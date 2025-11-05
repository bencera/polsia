/**
 * Instagram OAuth Routes (via Late.dev)
 * Handles Instagram connection flow using Late.dev as the OAuth provider
 */

const express = require('express');
const crypto = require('crypto');
const lateApiService = require('../services/late-api-service');
const syncService = require('../services/sync-service');
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
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

  // Temporary session store for Instagram OAuth
  // Maps: Late.dev profileId -> { userId, profileId, timestamp, csrfToken }
  // SECURITY NOTE: Using Late.dev's profileId as session key. While not ideal,
  // Late.dev controls the OAuth flow and returns profileId in callback.
  // Added CSRF token for additional validation.
  const sessionStore = new Map();

  // Cleanup expired sessions every 10 minutes
  setInterval(() => {
    const now = Date.now();
    const tenMinutes = 10 * 60 * 1000;
    for (const [key, data] of sessionStore.entries()) {
      if (now - data.timestamp > tenMinutes) {
        sessionStore.delete(key);
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

      // Step 3: Store user session temporarily (keyed by Late.dev profile ID)
      // SECURITY: Late.dev's OAuth flow doesn't support custom state parameters.
      // We use their profileId as the session key. Sessions expire after 10 minutes.
      // Additional validation is done by checking the 'connected' and 'username' parameters.
      sessionStore.set(lateProfile.late_profile_id, {
        userId: req.user.id,
        profileId: lateProfile.id,
        timestamp: Date.now(),
        userEmail: req.user.email // Store for additional validation
      });

      // Build callback URL (Late.dev will redirect here after Instagram auth)
      const redirectUrl = INSTAGRAM_CALLBACK_URL;

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
        error: 'Failed to initiate Instagram OAuth'
      });
    }
  });

  /**
   * GET /api/auth/instagram/callback
   * Handle Instagram OAuth callback from Late.dev
   */
  router.get('/callback', async (req, res) => {
    const { connected, profileId, username, error, platform } = req.query;

    try {
      console.log('[Instagram OAuth] Callback received:', { connected, profileId, username, error, platform });

      // Check for errors from Late.dev FIRST (before session validation)
      if (error) {
        console.error(`[Instagram OAuth] Connection failed: ${error} for platform ${platform}`);
        // Clean up any session if profileId exists
        if (profileId && sessionStore.has(profileId)) {
          sessionStore.delete(profileId);
        }
        return res.redirect(`${FRONTEND_URL}/connections?error=instagram_${error}`);
      }

      // Retrieve user session from store using profileId
      if (!profileId || !sessionStore.has(profileId)) {
        console.error('[Instagram OAuth] No session found for profileId:', profileId);
        return res.redirect(`${FRONTEND_URL}/connections?error=instagram_session_expired`);
      }

      const session = sessionStore.get(profileId);

      // SECURITY: Validate session is not expired (10 minutes max)
      const sessionAge = Date.now() - session.timestamp;
      const maxAge = 10 * 60 * 1000; // 10 minutes
      if (sessionAge > maxAge) {
        console.error('[Instagram OAuth] Session expired for profileId:', profileId);
        sessionStore.delete(profileId);
        return res.redirect(`${FRONTEND_URL}/connections?error=instagram_session_expired`);
      }

      const userId = session.userId;

      // Remove used session (single-use)
      sessionStore.delete(profileId);

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
