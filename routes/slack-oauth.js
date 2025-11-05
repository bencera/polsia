/**
 * Slack OAuth Routes
 * Handles Slack OAuth authentication flow
 */

const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const { encryptToken, decryptToken } = require('../utils/encryption');
const { getValidatedFrontendURL } = require('../utils/redirect-validator');
const {
  storeSlackConnection,
  getSlackToken,
  deleteSlackConnection
} = require('../db');

module.exports = (authenticateTokenFromQuery, authenticateToken) => {
  const router = express.Router();

// Slack OAuth configuration
const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID;
const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET;
const SLACK_CALLBACK_URL = process.env.SLACK_CALLBACK_URL || 'http://localhost:3000/api/auth/slack/callback';
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
 * GET /api/auth/slack
 * Initiate Slack OAuth flow
 * Authentication: Required (via query parameter)
 */
router.get('/', authenticateTokenFromQuery, async (req, res) => {
  try {
    // Check if Slack OAuth is configured
    if (!SLACK_CLIENT_ID || !SLACK_CLIENT_SECRET) {
      return res.status(500).json({
        success: false,
        error: 'Slack OAuth is not configured. Please set SLACK_CLIENT_ID and SLACK_CLIENT_SECRET in .env'
      });
    }

    // User authentication is handled by middleware (authenticateTokenFromQuery)
    // req.user is guaranteed to be set here

    // Generate CSRF state token
    const state = crypto.randomBytes(32).toString('hex');

    // Store state in memory for CSRF protection
    stateStore.set(state, {
      userId: req.user.id,
      timestamp: Date.now()
    });

    // Slack OAuth scopes - comprehensive read and write permissions
    // Read scopes for understanding company conversations
    const readScopes = [
      'channels:read',      // View basic channel info
      'channels:history',   // View messages in public channels
      'groups:read',        // View basic private channel info
      'groups:history',     // View messages in private channels
      'im:read',            // View basic DM info
      'im:history',         // View messages in DMs
      'mpim:read',          // View basic group DM info
      'mpim:history',       // View messages in group DMs
      'users:read',         // View people in workspace
      'team:read'           // View workspace info
    ];

    // Write scopes for sending messages and interacting
    const writeScopes = [
      'chat:write',         // Post messages
      'reactions:write',    // Add emoji reactions
      'channels:manage'     // Create and manage channels
    ];

    const allScopes = [...readScopes, ...writeScopes].join(',');

    // User token scopes - for reading all channels without bot membership
    const userScopes = [
      'channels:history',   // Read all public channel messages (no invite needed!)
      'channels:read',      // View all public channels
      'search:read',        // Search workspace messages
      'users:read'          // View workspace users
    ].join(',');

    // Build Slack authorization URL (using OAuth v2)
    // Request BOTH bot token (scope) and user token (user_scope)
    const authUrl = `https://slack.com/oauth/v2/authorize?client_id=${SLACK_CLIENT_ID}&redirect_uri=${encodeURIComponent(SLACK_CALLBACK_URL)}&scope=${encodeURIComponent(allScopes)}&user_scope=${encodeURIComponent(userScopes)}&state=${state}`;

    console.log(`[Slack OAuth] Redirecting user ${req.user.id} to Slack authorization`);

    // Redirect to Slack
    res.redirect(authUrl);

  } catch (error) {
    console.error('[Slack OAuth] Error initiating OAuth:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initiate Slack OAuth'
    });
  }
});

/**
 * GET /api/auth/slack/callback
 * Handle Slack OAuth callback
 */
router.get('/callback', async (req, res) => {
  const { code, state } = req.query;

  try {
    // Validate state parameter (CSRF protection)
    if (!state || !stateStore.has(state)) {
      console.error('[Slack OAuth] Invalid or missing state parameter');
      return res.redirect(`${FRONTEND_URL}/connections?error=invalid_state`);
    }

    // Get user ID from stored state
    const stateData = stateStore.get(state);
    const userId = stateData.userId;

    // Remove used state token
    stateStore.delete(state);

    // Validate code parameter
    if (!code) {
      console.error('[Slack OAuth] No authorization code received');
      return res.redirect(`${FRONTEND_URL}/connections?error=no_code`);
    }

    console.log(`[Slack OAuth] Exchanging code for access token for user ${userId}`);

    // Exchange code for access token (Slack OAuth v2)
    const tokenResponse = await axios.post(
      'https://slack.com/api/oauth.v2.access',
      null,
      {
        params: {
          client_id: SLACK_CLIENT_ID,
          client_secret: SLACK_CLIENT_SECRET,
          code,
          redirect_uri: SLACK_CALLBACK_URL
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const responseData = tokenResponse.data;

    // Check if Slack returned an error
    if (!responseData.ok) {
      console.error('[Slack OAuth] Slack API error:', responseData.error);
      return res.redirect(`${FRONTEND_URL}/connections?error=${responseData.error}`);
    }

    // Extract bot token, user token, and workspace info
    const {
      access_token,        // Bot token (xoxb-)
      token_type,
      scope,
      bot_user_id,
      app_id,
      team,                // Workspace info
      authed_user,         // Contains user token!
      enterprise
    } = responseData;

    if (!access_token) {
      console.error('[Slack OAuth] No access token received from Slack');
      return res.redirect(`${FRONTEND_URL}/connections?error=no_token`);
    }

    // Extract user token from authed_user object
    const userToken = authed_user?.access_token;  // User token (xoxp-)
    const userScopes = authed_user?.scope;

    console.log(`[Slack OAuth] Bot token received for workspace: ${team.name}`);
    if (userToken) {
      console.log(`[Slack OAuth] User token also received with scopes: ${userScopes}`);
    }

    // Fetch bot user info for display
    let botInfo = {};
    try {
      const botInfoResponse = await axios.get('https://slack.com/api/users.info', {
        params: { user: bot_user_id },
        headers: {
          Authorization: `Bearer ${access_token}`
        }
      });

      if (botInfoResponse.data.ok) {
        botInfo = {
          bot_name: botInfoResponse.data.user.profile.display_name || botInfoResponse.data.user.real_name,
          bot_avatar: botInfoResponse.data.user.profile.image_192
        };
      }
    } catch (error) {
      console.warn('[Slack OAuth] Could not fetch bot info:', error.message);
    }

    // Encrypt both bot and user tokens
    const encryptedBotToken = encryptToken(access_token);
    const encryptedUserToken = userToken ? encryptToken(userToken) : null;

    // Store connection in database with both tokens and metadata
    await storeSlackConnection(userId, {
      workspace_name: team.name,
      workspace_id: team.id,
      bot_user_id,
      app_id,
      scopes: scope ? scope.split(',') : [],
      user_scopes: userScopes ? userScopes.split(',') : [],
      has_user_token: !!userToken,
      authed_user_id: authed_user?.id,
      enterprise_id: enterprise?.id,
      enterprise_name: enterprise?.name,
      ...botInfo
    }, encryptedBotToken, encryptedUserToken);

    console.log(`[Slack OAuth] Slack connection stored for user ${userId} (workspace: ${team.name})`);

    // Redirect back to connections page with success message
    res.redirect(`${FRONTEND_URL}/connections?success=slack_connected`);

  } catch (error) {
    console.error('[Slack OAuth] Error in callback:', error.message);

    // More specific error handling
    if (error.response) {
      console.error('[Slack OAuth] Slack API error:', error.response.data);
    }

    res.redirect(`${FRONTEND_URL}/connections?error=oauth_failed`);
  }
});

/**
 * DELETE /api/auth/slack/:id
 * Disconnect Slack workspace
 * Authentication: Required (via Authorization header)
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // User authentication is handled by middleware (authenticateToken)
    // req.user is guaranteed to be set here

    console.log(`[Slack OAuth] Disconnecting Slack connection ${id} for user ${req.user.id}`);

    // Delete connection from database
    const deleted = await deleteSlackConnection(id, req.user.id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Connection not found or already deleted'
      });
    }

    console.log(`[Slack OAuth] Slack connection ${id} deleted`);

    res.json({
      success: true,
      message: 'Slack workspace disconnected successfully'
    });

  } catch (error) {
    console.error('[Slack OAuth] Error disconnecting Slack:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to disconnect Slack workspace'
    });
  }
});

/**
 * GET /api/auth/slack/status
 * Check if user has Slack connected
 */
router.get('/status', async (req, res) => {
  try {
    // Check if user is authenticated
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // Try to get Slack token to check if connected
    const token = await getSlackToken(req.user.id);

    res.json({
      success: true,
      connected: !!token
    });

  } catch (error) {
    console.error('[Slack OAuth] Error checking status:', error);
    res.json({
      success: true,
      connected: false
    });
  }
});

  // Return the configured router
  return router;
};
