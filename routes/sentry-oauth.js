/**
 * Sentry OAuth Routes
 * Handles Sentry OAuth authentication flow for error monitoring
 */

const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const { encryptToken, decryptToken } = require('../utils/encryption');
const { getValidatedFrontendURL } = require('../utils/redirect-validator');
const {
  storeSentryConnection,
  getSentryToken,
  deleteSentryConnection,
  updateSentryTokens,
  getSentryConnection
} = require('../db');

module.exports = (authenticateTokenFromQuery, authenticateToken) => {
  const router = express.Router();

  // Sentry OAuth configuration
  const SENTRY_CLIENT_ID = process.env.SENTRY_CLIENT_ID;
  const SENTRY_CLIENT_SECRET = process.env.SENTRY_CLIENT_SECRET;
  const SENTRY_CALLBACK_URL = process.env.SENTRY_CALLBACK_URL || 'http://localhost:3000/api/auth/sentry/callback';
  const SENTRY_BASE_URL = process.env.SENTRY_BASE_URL || 'https://sentry.io';
  // Security: Validate frontend URL to prevent open redirect vulnerabilities
  const FRONTEND_URL = getValidatedFrontendURL();

  // In-memory store for OAuth state tokens (CSRF protection)
  // Maps state token -> { userId, timestamp }
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
   * GET /api/auth/sentry
   * Initiate Sentry OAuth flow
   * Authentication: Required (via query parameter)
   */
  router.get('/', authenticateTokenFromQuery, async (req, res) => {
    try {
      // Check if Sentry OAuth is configured
      if (!SENTRY_CLIENT_ID || !SENTRY_CLIENT_SECRET) {
        return res.status(500).json({
          success: false,
          error: 'Sentry OAuth is not configured. Please set SENTRY_CLIENT_ID and SENTRY_CLIENT_SECRET in .env'
        });
      }

      // Generate CSRF state token
      const state = crypto.randomBytes(32).toString('hex');

      // Store state in memory for CSRF protection
      stateStore.set(state, {
        userId: req.user.id,
        timestamp: Date.now()
      });

      // Sentry OAuth scopes - comprehensive access for error monitoring
      const scopes = [
        'project:read',       // Read project data
        'project:write',      // Write project data
        'org:read',           // Read organization data
        'event:read',         // Read error events
        'member:read'         // Read member data
      ];

      // Build Sentry authorization URL
      const authUrl = `${SENTRY_BASE_URL}/oauth/authorize/?` +
        `client_id=${SENTRY_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(SENTRY_CALLBACK_URL)}` +
        `&scope=${encodeURIComponent(scopes.join(' '))}` +
        `&state=${state}` +
        `&response_type=code`;

      console.log(`[Sentry OAuth] Redirecting user ${req.user.id} to Sentry authorization`);

      // Redirect to Sentry
      res.redirect(authUrl);

    } catch (error) {
      console.error('[Sentry OAuth] Error initiating OAuth:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to initiate Sentry OAuth'
      });
    }
  });

  /**
   * GET /api/auth/sentry/callback
   * Handle Sentry OAuth callback
   */
  router.get('/callback', async (req, res) => {
    const { code, state, error, error_description } = req.query;

    try {
      // Check for OAuth errors from Sentry
      if (error) {
        console.error(`[Sentry OAuth] OAuth error: ${error} - ${error_description}`);
        return res.redirect(`${FRONTEND_URL}/connections?error=sentry_${error}`);
      }

      // Validate state parameter (CSRF protection)
      if (!state || !stateStore.has(state)) {
        console.error('[Sentry OAuth] Invalid or missing state parameter');
        return res.redirect(`${FRONTEND_URL}/connections?error=invalid_state`);
      }

      // Get user ID from stored state
      const stateData = stateStore.get(state);
      const userId = stateData.userId;

      // Remove used state token
      stateStore.delete(state);

      // Validate code parameter
      if (!code) {
        console.error('[Sentry OAuth] No authorization code received');
        return res.redirect(`${FRONTEND_URL}/connections?error=no_code`);
      }

      console.log(`[Sentry OAuth] Exchanging code for access token for user ${userId}`);
      console.log(`[Sentry OAuth] Token URL: ${SENTRY_BASE_URL}/oauth/token/`);
      console.log(`[Sentry OAuth] Client ID (first 10 chars): ${SENTRY_CLIENT_ID?.substring(0, 10)}...`);
      console.log(`[Sentry OAuth] Client ID length: ${SENTRY_CLIENT_ID?.length}`);
      console.log(`[Sentry OAuth] Client Secret (first 10 chars): ${SENTRY_CLIENT_SECRET?.substring(0, 10)}...`);
      console.log(`[Sentry OAuth] Client Secret length: ${SENTRY_CLIENT_SECRET?.length}`);
      console.log(`[Sentry OAuth] Redirect URI: ${SENTRY_CALLBACK_URL}`);
      console.log(`[Sentry OAuth] Code present: ${!!code}`);

      // Exchange code for access token
      // Sentry requires form-encoded data with credentials in body
      const tokenResponse = await axios.post(
        `${SENTRY_BASE_URL}/oauth/token/`,
        new URLSearchParams({
          client_id: SENTRY_CLIENT_ID,
          client_secret: SENTRY_CLIENT_SECRET,
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: SENTRY_CALLBACK_URL
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      const { access_token, refresh_token, expires_in, token_type, scope } = tokenResponse.data;

      if (!access_token) {
        console.error('[Sentry OAuth] No access token received from Sentry');
        return res.redirect(`${FRONTEND_URL}/connections?error=no_token`);
      }

      console.log(`[Sentry OAuth] Access token received for user ${userId}`);

      // Calculate token expiry date (expires_in is in seconds, typically 28799 = ~8 hours)
      const expiresInSeconds = expires_in || 28800; // 8 hours default
      const expiryDate = new Date(Date.now() + (expiresInSeconds * 1000));

      // Validate the date is valid
      if (isNaN(expiryDate.getTime())) {
        console.error('[Sentry OAuth] Invalid expiry date calculated');
        return res.redirect(`${FRONTEND_URL}/connections?error=invalid_token_expiry`);
      }

      console.log(`[Sentry OAuth] Token expires in ${expiresInSeconds / 3600} hours`);

      // Fetch organizations from Sentry API
      let organizations = [];
      try {
        const orgsResponse = await axios.get(
          `${SENTRY_BASE_URL}/api/0/organizations/`,
          {
            headers: {
              'Authorization': `Bearer ${access_token}`
            }
          }
        );
        organizations = orgsResponse.data || [];
        console.log(`[Sentry OAuth] Found ${organizations.length} organizations`);
      } catch (orgError) {
        console.error('[Sentry OAuth] Error fetching organizations:', orgError.message);
        // Continue even if we can't fetch organizations
      }

      // Fetch user profile from Sentry
      let userProfile = {};
      try {
        const userResponse = await axios.get(
          `${SENTRY_BASE_URL}/api/0/`,
          {
            headers: {
              'Authorization': `Bearer ${access_token}`
            }
          }
        );
        userProfile = userResponse.data.user || {};
        console.log(`[Sentry OAuth] User profile fetched: ${userProfile.email}`);
      } catch (userError) {
        console.error('[Sentry OAuth] Error fetching user profile:', userError.message);
        // Continue even if we can't fetch user profile
      }

      // Encrypt the access token
      const encryptedToken = encryptToken(access_token);

      // Encrypt the refresh token if provided
      let encryptedRefreshToken = null;
      if (refresh_token) {
        encryptedRefreshToken = encryptToken(refresh_token);
      }

      // Prepare metadata for storage
      const metadata = {
        user_id: userProfile.id || null,
        email: userProfile.email || null,
        name: userProfile.name || null,
        username: userProfile.username || null,
        organizations: organizations.map(org => ({
          id: org.id,
          slug: org.slug,
          name: org.name
        })),
        token_expiry: expiryDate.toISOString(),
        scopes: scope ? scope.split(' ') : []
      };

      // Add refresh token fields if available
      if (encryptedRefreshToken) {
        metadata.encrypted_refresh_token = encryptedRefreshToken.encrypted;
        metadata.refresh_token_iv = encryptedRefreshToken.iv;
        metadata.refresh_token_auth_tag = encryptedRefreshToken.authTag;
      }

      // Store connection in database
      await storeSentryConnection(userId, metadata, encryptedToken);

      console.log(`[Sentry OAuth] Sentry connection stored for user ${userId}`);

      // Redirect back to connections page with success message
      res.redirect(`${FRONTEND_URL}/connections?success=sentry_connected`);

    } catch (error) {
      console.error('[Sentry OAuth] Error in callback:', error.message);

      // More specific error handling
      if (error.response) {
        console.error('[Sentry OAuth] Sentry API error details:');
        console.error('  Status:', error.response.status);
        console.error('  Status Text:', error.response.statusText);
        console.error('  Data:', JSON.stringify(error.response.data, null, 2));
        console.error('  Headers:', JSON.stringify(error.response.headers, null, 2));
      } else {
        console.error('[Sentry OAuth] Full error:', error);
      }

      res.redirect(`${FRONTEND_URL}/connections?error=oauth_failed`);
    }
  });

  /**
   * DELETE /api/auth/sentry/:id
   * Disconnect Sentry account
   * Authentication: Required (via Authorization header)
   */
  router.delete('/:id', authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;

      console.log(`[Sentry OAuth] Disconnecting Sentry connection ${id} for user ${req.user.id}`);

      // Delete connection from database
      const deleted = await deleteSentryConnection(id, req.user.id);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: 'Connection not found or already deleted'
        });
      }

      console.log(`[Sentry OAuth] Sentry connection ${id} deleted`);

      res.json({
        success: true,
        message: 'Sentry account disconnected successfully'
      });

    } catch (error) {
      console.error('[Sentry OAuth] Error disconnecting Sentry:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to disconnect Sentry account'
      });
    }
  });

  /**
   * GET /api/auth/sentry/status
   * Check if user has Sentry connected
   */
  router.get('/status', authenticateToken, async (req, res) => {
    try {
      // Try to get Sentry token to check if connected
      const token = await getSentryToken(req.user.id);

      res.json({
        success: true,
        connected: !!token
      });

    } catch (error) {
      console.error('[Sentry OAuth] Error checking status:', error);
      res.json({
        success: true,
        connected: false
      });
    }
  });

  /**
   * POST /api/auth/sentry/refresh
   * Refresh Sentry token (tokens expire every 8 hours)
   * Authentication: Required (via Authorization header)
   */
  router.post('/refresh', authenticateToken, async (req, res) => {
    try {
      console.log(`[Sentry OAuth] Refreshing token for user ${req.user.id}`);

      // Get current connection with metadata
      const connection = await getSentryConnection(req.user.id);

      if (!connection) {
        return res.status(404).json({
          success: false,
          error: 'No Sentry connection found'
        });
      }

      const metadata = connection.metadata;

      // Check if refresh token exists
      if (!metadata.encrypted_refresh_token || !metadata.refresh_token_iv || !metadata.refresh_token_auth_tag) {
        return res.status(400).json({
          success: false,
          error: 'No refresh token available. Please reconnect your Sentry account.'
        });
      }

      // Decrypt refresh token
      const refreshToken = decryptToken({
        encrypted: metadata.encrypted_refresh_token,
        iv: metadata.refresh_token_iv,
        authTag: metadata.refresh_token_auth_tag
      });

      // Exchange refresh token for new access token
      // Sentry requires form-encoded data
      const refreshResponse = await axios.post(
        `${SENTRY_BASE_URL}/oauth/token/`,
        new URLSearchParams({
          client_id: SENTRY_CLIENT_ID,
          client_secret: SENTRY_CLIENT_SECRET,
          grant_type: 'refresh_token',
          refresh_token: refreshToken
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      const { access_token: newToken, refresh_token: newRefreshToken, expires_in } = refreshResponse.data;

      if (!newToken) {
        throw new Error('Failed to refresh token');
      }

      // Calculate new expiry date
      const expiresInSeconds = expires_in || 28800; // 8 hours default
      const expiryDate = new Date(Date.now() + (expiresInSeconds * 1000));

      // Validate the date is valid
      if (isNaN(expiryDate.getTime())) {
        throw new Error('Invalid expiry date calculated');
      }

      // Encrypt new tokens
      const encryptedNewToken = encryptToken(newToken);
      const encryptedNewRefreshToken = newRefreshToken ? encryptToken(newRefreshToken) : null;

      // Update tokens in database
      await updateSentryTokens(req.user.id, encryptedNewToken, expiryDate.toISOString(), encryptedNewRefreshToken);

      console.log(`[Sentry OAuth] Token refreshed successfully for user ${req.user.id}`);

      res.json({
        success: true,
        message: 'Token refreshed successfully',
        expires_at: expiryDate.toISOString()
      });

    } catch (error) {
      console.error('[Sentry OAuth] Error refreshing token:', error);

      // If refresh fails, user may need to reconnect
      if (error.response && error.response.data) {
        console.error('[Sentry OAuth] Sentry API error:', error.response.data);
      }

      res.status(500).json({
        success: false,
        error: 'Failed to refresh token. Please reconnect your Sentry account.'
      });
    }
  });

  // Return the configured router
  return router;
};
