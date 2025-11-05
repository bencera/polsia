/**
 * Instagram OAuth Routes (via Late.dev)
 * Handles Instagram connection flow using Late.dev as the OAuth provider
 */

const express = require('express');
const crypto = require('crypto');
const lateApiService = require('../services/late-api-service');
const syncService = require('../services/sync-service');
const { getValidatedFrontendURL } = require('../utils/redirect-validator');
const {
  getProfilesByUserId,
  createProfile,
  storeInstagramConnection,
  deleteInstagramConnection,
  getInstagramConnection
} = require('../db');

module.exports = (authenticateTokenFromQuery, authenticateToken) => {
  const router = express.Router();

  // Instagram OAuth configuration (via Late.dev)
  const INSTAGRAM_CALLBACK_URL = process.env.INSTAGRAM_CALLBACK_URL || 'http://localhost:3000/api/auth/instagram/callback';
  // Security: Validate frontend URL to prevent open redirect vulnerabilities
  const FRONTEND_URL = getValidatedFrontendURL();

  // Security: Use cryptographic state tokens instead of predictable profileId
  // Maps state token -> { userId, profileId, lateProfileId, timestamp }
  const stateStore = new Map();

  // Cleanup expired OAuth states every 10 minutes
  setInterval(() => {
    const now = Date.now();
    const tenMinutes = 10 * 60 * 1000;
    for (const [state, data] of stateStore.entries()) {
      if (now - data.timestamp > tenMinutes) {
        stateStore.delete(state);
      }
    }
  }, 600000);

  /**
   * GET /api/auth/instagram
   * Initiate Instagram OAuth flow via Late.dev
   * Authentication: Required (via query parameter)
   */
  router.get('/', authenticateTokenFromQuery, async (req, res) => {
    try {
      // Check if Late.dev API is configured
      if (!process.env.LATE_API_KEY) {
        return res.status(500).json({
          success: false,
          error: 'Late.dev API is not configured. Please set LATE_API_KEY in .env'
        });
      }

      const userId = req.user.id;

      console.log(`[Instagram OAuth] Initiating Instagram connection for user ${userId}`);

      // Step 1: Check if user has a Late.dev profile
      let profiles = await getProfilesByUserId(userId);
      let lateProfile = profiles.find(p => p.late_profile_id !== null);

      // Step 2: If no profile exists, create one via Late.dev API
      if (!lateProfile) {
        console.log(`[Instagram OAuth] Creating Late.dev profile for user ${userId}`);

        // Make profile name unique by appending user ID
        const baseName = req.user.name || req.user.email?.split('@')[0] || 'User';
        const profileName = `${baseName} (Polsia #${userId})`;

        let lateProfileResponse;

        try {
          // Try to create a new profile
          lateProfileResponse = await lateApiService.createProfile({
            name: profileName,
            description: `Polsia - ${req.user.email || `User ${userId}`}`,
            color: '#4ade80'
          });
          console.log(`[Instagram OAuth] Created new Late.dev profile:`, lateProfileResponse);
        } catch (createError) {
          // If profile already exists, fetch all profiles and find the matching one
          if (createError.message && createError.message.includes('already exists')) {
            console.log(`[Instagram OAuth] Profile already exists on Late.dev, fetching existing profiles...`);

            const allProfiles = await lateApiService.getProfiles();
            // Find profile by name match
            lateProfileResponse = allProfiles.find(p =>
              p.name === profileName ||
              p.name?.includes(baseName) ||
              p.description?.includes(req.user.email)
            );

            if (!lateProfileResponse && allProfiles.length > 0) {
              // If no match found, use the first profile (fallback)
              console.log(`[Instagram OAuth] No matching profile found, using first available profile`);
              lateProfileResponse = allProfiles[0];
            }

            if (!lateProfileResponse) {
              throw new Error('Could not create or find Late.dev profile');
            }

            console.log(`[Instagram OAuth] Using existing Late.dev profile:`, lateProfileResponse);
          } else {
            // Re-throw if it's a different error
            throw createError;
          }
        }

        // Store the profile in our database
        lateProfile = await createProfile(userId, {
          name: lateProfileResponse.name || profileName,
          description: lateProfileResponse.description || `Polsia - ${req.user.email}`,
          late_profile_id: lateProfileResponse._id || lateProfileResponse.id
        });

        console.log(`[Instagram OAuth] Stored profile in DB with late_profile_id: ${lateProfile.late_profile_id}`);
      }

      // Validate that we have a Late.dev profile ID
      if (!lateProfile || !lateProfile.late_profile_id) {
        console.error(`[Instagram OAuth] No valid Late.dev profile ID found for user ${userId}`, {
          hasProfile: !!lateProfile,
          profileId: lateProfile?.id,
          lateProfileId: lateProfile?.late_profile_id
        });
        return res.status(500).json({
          success: false,
          error: 'Failed to create or retrieve Late.dev profile. Please try again.'
        });
      }

      console.log(`[Instagram OAuth] Using Late.dev profile: ${lateProfile.late_profile_id}`);

      // Security: Generate cryptographic state token for CSRF protection
      // Use state token instead of predictable profileId
      const state = crypto.randomBytes(32).toString('hex');

      // Store state with user session data
      stateStore.set(state, {
        userId: req.user.id,
        profileId: lateProfile.id,
        lateProfileId: lateProfile.late_profile_id,
        timestamp: Date.now()
      });

      // Build callback URL with state parameter for security
      const redirectUrl = `${INSTAGRAM_CALLBACK_URL}?state=${state}`;

      console.log(`[Instagram OAuth] Calling Late.dev connect API for profile: ${lateProfile.late_profile_id}`);

      const connectResponse = await lateApiService.makeRequest(
        `/v1/connect/instagram?profileId=${lateProfile.late_profile_id}&redirect_url=${encodeURIComponent(redirectUrl)}`,
        'GET'
      );

      console.log(`[Instagram OAuth] Received connect response:`, connectResponse);

      // Late.dev returns { authUrl: "...", state: "..." }
      if (!connectResponse.authUrl) {
        throw new Error('No authUrl received from Late.dev');
      }

      console.log(`[Instagram OAuth] Redirecting user ${userId} to Instagram OAuth`);

      // Redirect to Instagram OAuth URL
      res.redirect(connectResponse.authUrl);

    } catch (error) {
      console.error('[Instagram OAuth] Error initiating OAuth:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to initiate Instagram OAuth',
        details: error.message
      });
    }
  });

  /**
   * GET /api/auth/instagram/callback
   * Handle Instagram OAuth callback from Late.dev
   */
  router.get('/callback', async (req, res) => {
    const { connected, profileId, username, error, platform, state } = req.query;

    try {
      console.log('[Instagram OAuth] Callback received:', { connected, profileId, username, error, platform, state });

      // Security: Validate state token first (CSRF protection)
      if (!state || !stateStore.has(state)) {
        console.error('[Instagram OAuth] Invalid or missing state token');
        return res.redirect(`${FRONTEND_URL}/connections?error=invalid_state`);
      }

      const session = stateStore.get(state);
      const userId = session.userId;

      // Check for errors from Late.dev
      if (error) {
        console.error(`[Instagram OAuth] Connection failed: ${error} for platform ${platform}`);
        // Clean up state
        stateStore.delete(state);
        return res.redirect(`${FRONTEND_URL}/connections?error=instagram_${error}`);
      }

      // Validate profileId matches stored session
      if (!profileId || profileId !== session.lateProfileId) {
        console.error('[Instagram OAuth] ProfileId mismatch. Expected:', session.lateProfileId, 'Got:', profileId);
        stateStore.delete(state);
        return res.redirect(`${FRONTEND_URL}/connections?error=instagram_session_mismatch`);
      }

      // Remove used state token (one-time use)
      stateStore.delete(state);

      console.log('[Instagram OAuth] Retrieved session for user:', userId);

      // Validate success parameters
      if (!connected || connected !== 'instagram' || !username || !profileId) {
        console.error('[Instagram OAuth] Invalid callback parameters');
        return res.redirect(`${FRONTEND_URL}/connections?error=invalid_callback`);
      }

      console.log(`[Instagram OAuth] Instagram connected successfully for user ${userId}: @${username}`);

      // Sync only this user's specific Late.dev profile (not all profiles)
      console.log(`[Instagram OAuth] Syncing profile ${profileId} from Late.dev`);
      const syncResults = await syncService.syncSpecificProfile(userId, profileId);

      // Find the Instagram account that was just connected
      const instagramAccount = syncResults.accounts.find(
        acc => acc.platform.toLowerCase() === 'instagram' && acc.username === username
      );

      // Store Instagram connection in service_connections
      await storeInstagramConnection(userId, {
        username: username,
        late_profile_id: profileId,
        late_account_id: instagramAccount ? instagramAccount.lateAccountId : null
      });

      console.log(`[Instagram OAuth] Instagram connection stored for user ${userId}`);

      // Redirect back to connections page with success message
      res.redirect(`${FRONTEND_URL}/connections?success=instagram_connected&username=${username}`);

    } catch (error) {
      console.error('[Instagram OAuth] Error in callback:', error.message);
      res.redirect(`${FRONTEND_URL}/connections?error=instagram_failed`);
    }
  });

  /**
   * DELETE /api/auth/instagram/:id
   * Disconnect Instagram account
   * Authentication: Required (via Authorization header)
   */
  router.delete('/:id', authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;

      console.log(`[Instagram OAuth] Disconnecting Instagram connection ${id} for user ${req.user.id}`);

      // Delete connection from database
      const deleted = await deleteInstagramConnection(id, req.user.id);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: 'Connection not found or already deleted'
        });
      }

      console.log(`[Instagram OAuth] Instagram connection ${id} deleted`);

      res.json({
        success: true,
        message: 'Instagram account disconnected successfully'
      });

    } catch (error) {
      console.error('[Instagram OAuth] Error disconnecting Instagram:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to disconnect Instagram account'
      });
    }
  });

  /**
   * GET /api/auth/instagram/status
   * Check if user has Instagram connected
   */
  router.get('/status', authenticateToken, async (req, res) => {
    try {
      // Try to get Instagram connection to check if connected
      const connection = await getInstagramConnection(req.user.id);

      res.json({
        success: true,
        connected: !!connection,
        connection: connection || null
      });

    } catch (error) {
      console.error('[Instagram OAuth] Error checking status:', error);
      res.json({
        success: true,
        connected: false
      });
    }
  });

  // Return the configured router
  return router;
};
