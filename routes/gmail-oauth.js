/**
 * Gmail OAuth Routes
 * Handles Gmail OAuth authentication flow with full Gmail API access
 */

const express = require('express');
const { google } = require('googleapis');
const crypto = require('crypto');
const { encryptToken, decryptToken } = require('../utils/encryption');
const { getValidatedFrontendURL } = require('../utils/redirect-validator');
const {
  storeGmailConnection,
  getGmailToken,
  deleteGmailConnection
} = require('../db');

module.exports = (authenticateTokenFromQuery, authenticateToken) => {
  const router = express.Router();

  // Gmail OAuth configuration
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/gmail/callback';
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
   * Create OAuth2 client
   */
  function createOAuth2Client() {
    return new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_CALLBACK_URL
    );
  }

  /**
   * GET /api/auth/gmail
   * Initiate Gmail OAuth flow
   * Authentication: Required (via query parameter)
   */
  router.get('/', authenticateTokenFromQuery, async (req, res) => {
    try {
      // Check if Gmail OAuth is configured
      if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        return res.status(500).json({
          success: false,
          error: 'Gmail OAuth is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env'
        });
      }

      // Generate CSRF state token
      const state = crypto.randomBytes(32).toString('hex');

      // Store state in memory for CSRF protection
      stateStore.set(state, {
        userId: req.user.id,
        timestamp: Date.now()
      });

      // Gmail OAuth scopes - request comprehensive access
      const scopes = [
        'https://www.googleapis.com/auth/gmail.readonly',     // Read emails
        'https://www.googleapis.com/auth/gmail.send',         // Send emails
        'https://www.googleapis.com/auth/gmail.modify',       // Modify emails (labels, etc.)
        'https://www.googleapis.com/auth/gmail.labels',       // Manage labels
        'https://www.googleapis.com/auth/userinfo.email',     // Get user email
        'https://www.googleapis.com/auth/userinfo.profile'    // Get user profile
      ];

      // Create OAuth2 client and generate auth URL
      const oauth2Client = createOAuth2Client();
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',  // Request refresh token
        scope: scopes,
        state: state,
        prompt: 'consent'  // Force consent to ensure refresh token
      });

      console.log(`[Gmail OAuth] Redirecting user ${req.user.id} to Google authorization`);

      // Redirect to Google
      res.redirect(authUrl);

    } catch (error) {
      console.error('[Gmail OAuth] Error initiating OAuth:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to initiate Gmail OAuth'
      });
    }
  });

  /**
   * GET /api/auth/gmail/callback
   * Handle Gmail OAuth callback
   */
  router.get('/callback', async (req, res) => {
    const { code, state } = req.query;

    try {
      // Validate state parameter (CSRF protection)
      if (!state || !stateStore.has(state)) {
        console.error('[Gmail OAuth] Invalid or missing state parameter');
        return res.redirect(`${FRONTEND_URL}/connections?error=invalid_state`);
      }

      // Get user ID from stored state
      const stateData = stateStore.get(state);
      const userId = stateData.userId;

      // Remove used state token
      stateStore.delete(state);

      // Validate code parameter
      if (!code) {
        console.error('[Gmail OAuth] No authorization code received');
        return res.redirect(`${FRONTEND_URL}/connections?error=no_code`);
      }

      console.log(`[Gmail OAuth] Exchanging code for access token for user ${userId}`);

      // Exchange code for tokens
      const oauth2Client = createOAuth2Client();
      const { tokens } = await oauth2Client.getToken(code);

      if (!tokens.access_token) {
        console.error('[Gmail OAuth] No access token received from Google');
        return res.redirect(`${FRONTEND_URL}/connections?error=no_token`);
      }

      console.log(`[Gmail OAuth] Access token received for user ${userId}`);

      // Set credentials to fetch user info
      oauth2Client.setCredentials(tokens);

      // Fetch user info
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const { data: userInfo } = await oauth2.userinfo.get();

      console.log(`[Gmail OAuth] Google user info fetched: ${userInfo.email}`);

      // Encrypt the tokens
      const encryptedAccessToken = encryptToken(tokens.access_token);
      const encryptedRefreshToken = tokens.refresh_token
        ? encryptToken(tokens.refresh_token)
        : null;

      // Store connection in database
      await storeGmailConnection(userId, {
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture,
        google_id: userInfo.id,
        scopes: tokens.scope ? tokens.scope.split(' ') : [],
        token_expiry: tokens.expiry_date
      }, {
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken
      });

      console.log(`[Gmail OAuth] Gmail connection stored for user ${userId}`);

      // Redirect back to connections page with success message
      res.redirect(`${FRONTEND_URL}/connections?success=gmail_connected`);

    } catch (error) {
      console.error('[Gmail OAuth] Error in callback:', error.message);

      // More specific error handling
      if (error.response) {
        console.error('[Gmail OAuth] Google API error:', error.response.data);
      }

      res.redirect(`${FRONTEND_URL}/connections?error=oauth_failed`);
    }
  });

  /**
   * DELETE /api/auth/gmail/:id
   * Disconnect Gmail account
   * Authentication: Required (via Authorization header)
   */
  router.delete('/:id', authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;

      console.log(`[Gmail OAuth] Disconnecting Gmail connection ${id} for user ${req.user.id}`);

      // Delete connection from database
      const deleted = await deleteGmailConnection(id, req.user.id);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: 'Connection not found or already deleted'
        });
      }

      console.log(`[Gmail OAuth] Gmail connection ${id} deleted`);

      res.json({
        success: true,
        message: 'Gmail account disconnected successfully'
      });

    } catch (error) {
      console.error('[Gmail OAuth] Error disconnecting Gmail:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to disconnect Gmail account'
      });
    }
  });

  /**
   * GET /api/auth/gmail/status
   * Check if user has Gmail connected
   */
  router.get('/status', authenticateToken, async (req, res) => {
    try {
      // Try to get Gmail token to check if connected
      const token = await getGmailToken(req.user.id);

      res.json({
        success: true,
        connected: !!token
      });

    } catch (error) {
      console.error('[Gmail OAuth] Error checking status:', error);
      res.json({
        success: true,
        connected: false
      });
    }
  });

  // Return the configured router
  return router;
};
