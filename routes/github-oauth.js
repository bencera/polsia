/**
 * GitHub OAuth Routes
 * Handles GitHub OAuth authentication flow
 */

const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const { encryptToken, decryptToken } = require('../utils/encryption');
const {
  storeGitHubConnection,
  getGitHubToken,
  deleteGitHubConnection,
  storeOAuthState,
  getOAuthState,
  deleteOAuthState,
  cleanupExpiredOAuthStates
} = require('../db');

module.exports = (authenticateTokenFromQuery, authenticateToken) => {
  const router = express.Router();

// GitHub OAuth configuration
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const GITHUB_CALLBACK_URL = process.env.GITHUB_CALLBACK_URL || 'http://localhost:3000/api/auth/github/callback';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Cleanup expired OAuth states every 10 minutes
setInterval(() => {
  cleanupExpiredOAuthStates();
}, 600000);

/**
 * GET /api/auth/github
 * Initiate GitHub OAuth flow
 * Authentication: Required (via query parameter)
 */
router.get('/', authenticateTokenFromQuery, async (req, res) => {
  try {
    // Check if GitHub OAuth is configured
    if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
      return res.status(500).json({
        success: false,
        error: 'GitHub OAuth is not configured. Please set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in .env'
      });
    }

    // User authentication is handled by middleware (authenticateTokenFromQuery)
    // req.user is guaranteed to be set here

    // Generate CSRF state token
    const state = crypto.randomBytes(32).toString('hex');

    // Store state in database (persists across server restarts)
    await storeOAuthState(state, req.user.id, 10); // 10 minute expiration

    // GitHub OAuth scopes - request full repo access for reading and pushing code
    const scopes = 'repo user:email';

    // Build GitHub authorization URL
    const authUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(GITHUB_CALLBACK_URL)}&scope=${encodeURIComponent(scopes)}&state=${state}`;

    console.log(`[GitHub OAuth] Redirecting user ${req.user.id} to GitHub authorization`);

    // Redirect to GitHub
    res.redirect(authUrl);

  } catch (error) {
    console.error('[GitHub OAuth] Error initiating OAuth:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initiate GitHub OAuth'
    });
  }
});

/**
 * GET /api/auth/github/callback
 * Handle GitHub OAuth callback
 */
router.get('/callback', async (req, res) => {
  const { code, state } = req.query;

  try {
    // Validate state parameter (CSRF protection)
    if (!state) {
      console.error('[GitHub OAuth] Missing state parameter');
      return res.redirect(`${FRONTEND_URL}/connections?error=invalid_state`);
    }

    // Get user ID from database
    const stateData = await getOAuthState(state);
    if (!stateData) {
      console.error('[GitHub OAuth] Invalid or expired state parameter');
      return res.redirect(`${FRONTEND_URL}/connections?error=invalid_state`);
    }

    const userId = stateData.userId;

    // Remove used state token from database
    await deleteOAuthState(state);

    // Validate code parameter
    if (!code) {
      console.error('[GitHub OAuth] No authorization code received');
      return res.redirect(`${FRONTEND_URL}/connections?error=no_code`);
    }

    console.log(`[GitHub OAuth] Exchanging code for access token for user ${userId}`);

    // Exchange code for access token
    const tokenResponse = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: GITHUB_CALLBACK_URL
      },
      {
        headers: {
          Accept: 'application/json'
        }
      }
    );

    const { access_token, scope, token_type } = tokenResponse.data;

    if (!access_token) {
      console.error('[GitHub OAuth] No access token received from GitHub');
      return res.redirect(`${FRONTEND_URL}/connections?error=no_token`);
    }

    console.log(`[GitHub OAuth] Access token received for user ${userId}`);

    // Fetch GitHub user info
    const userResponse = await axios.get('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${access_token}`,
        Accept: 'application/vnd.github.v3+json'
      }
    });

    const githubUser = userResponse.data;

    console.log(`[GitHub OAuth] GitHub user info fetched: ${githubUser.login}`);

    // Encrypt the access token
    const encryptedToken = encryptToken(access_token);

    // Store connection in database
    await storeGitHubConnection(userId, {
      username: githubUser.login,
      avatar_url: githubUser.avatar_url,
      name: githubUser.name,
      email: githubUser.email,
      public_repos: githubUser.public_repos,
      total_private_repos: githubUser.total_private_repos,
      scopes: scope ? scope.split(',') : ['repo'],
      github_id: githubUser.id,
      profile_url: githubUser.html_url
    }, encryptedToken);

    console.log(`[GitHub OAuth] GitHub connection stored for user ${userId}`);

    // Redirect back to connections page with success message
    res.redirect(`${FRONTEND_URL}/connections?success=github_connected`);

  } catch (error) {
    console.error('[GitHub OAuth] Error in callback:', error.message);

    // More specific error handling
    if (error.response) {
      console.error('[GitHub OAuth] GitHub API error:', error.response.data);
    }

    res.redirect(`${FRONTEND_URL}/connections?error=oauth_failed`);
  }
});

/**
 * DELETE /api/auth/github/:id
 * Disconnect GitHub account
 * Authentication: Required (via Authorization header)
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // User authentication is handled by middleware (authenticateToken)
    // req.user is guaranteed to be set here

    console.log(`[GitHub OAuth] Disconnecting GitHub connection ${id} for user ${req.user.id}`);

    // Delete connection from database
    const deleted = await deleteGitHubConnection(id, req.user.id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Connection not found or already deleted'
      });
    }

    console.log(`[GitHub OAuth] GitHub connection ${id} deleted`);

    res.json({
      success: true,
      message: 'GitHub account disconnected successfully'
    });

  } catch (error) {
    console.error('[GitHub OAuth] Error disconnecting GitHub:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to disconnect GitHub account'
    });
  }
});

/**
 * GET /api/auth/github/status
 * Check if user has GitHub connected
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

    // Try to get GitHub token to check if connected
    const token = await getGitHubToken(req.user.id);

    res.json({
      success: true,
      connected: !!token
    });

  } catch (error) {
    console.error('[GitHub OAuth] Error checking status:', error);
    res.json({
      success: true,
      connected: false
    });
  }
});

  // Return the configured router
  return router;
};
