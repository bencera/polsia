/**
 * Meta (Facebook) Ads OAuth Routes
 * Handles Meta Ads OAuth authentication flow with Marketing API access
 */

const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const { encryptToken, decryptToken } = require('../utils/encryption');
const {
  storeMetaAdsConnection,
  getMetaAdsToken,
  getMetaAdsConnection,
  deleteMetaAdsConnection,
  updateMetaAdsTokens
} = require('../db');

module.exports = (authenticateTokenFromQuery, authenticateToken) => {
  const router = express.Router();

  // Meta Ads OAuth configuration
  const META_APP_ID = process.env.META_APP_ID;
  const META_APP_SECRET = process.env.META_APP_SECRET;
  const META_CALLBACK_URL = process.env.META_CALLBACK_URL || 'http://localhost:3000/api/auth/meta-ads/callback';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
  const META_API_VERSION = 'v21.0'; // Current stable version

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
   * GET /api/auth/meta-ads
   * Initiate Meta Ads OAuth flow
   * Authentication: Required (via query parameter)
   */
  router.get('/', authenticateTokenFromQuery, async (req, res) => {
    try {
      // Check if Meta OAuth is configured
      if (!META_APP_ID || !META_APP_SECRET) {
        return res.status(500).json({
          success: false,
          error: 'Meta Ads OAuth is not configured. Please set META_APP_ID and META_APP_SECRET in .env'
        });
      }

      // Generate CSRF state token
      const state = crypto.randomBytes(32).toString('hex');

      // Store state in memory for CSRF protection
      stateStore.set(state, {
        userId: req.user.id,
        timestamp: Date.now()
      });

      // Meta Marketing API scopes - comprehensive access for ad management
      const scopes = [
        'ads_read',              // Read ads data
        'ads_management',        // Manage ads, ad sets, and campaigns
        'business_management',   // Access business settings and ad accounts
        'pages_show_list',       // Show list of Pages
        'pages_read_engagement'  // Read engagement data from Pages
      ];

      // Build Meta authorization URL
      const authUrl = `https://www.facebook.com/${META_API_VERSION}/dialog/oauth?` +
        `client_id=${META_APP_ID}` +
        `&redirect_uri=${encodeURIComponent(META_CALLBACK_URL)}` +
        `&scope=${encodeURIComponent(scopes.join(','))}` +
        `&state=${state}` +
        `&response_type=code`;

      console.log(`[Meta Ads OAuth] Redirecting user ${req.user.id} to Meta authorization`);

      // Redirect to Meta/Facebook
      res.redirect(authUrl);

    } catch (error) {
      console.error('[Meta Ads OAuth] Error initiating OAuth:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to initiate Meta Ads OAuth'
      });
    }
  });

  /**
   * GET /api/auth/meta-ads/callback
   * Handle Meta Ads OAuth callback
   */
  router.get('/callback', async (req, res) => {
    const { code, state, error, error_description } = req.query;

    try {
      // Check for OAuth errors from Meta
      if (error) {
        console.error(`[Meta Ads OAuth] OAuth error: ${error} - ${error_description}`);
        return res.redirect(`${FRONTEND_URL}/connections?error=meta_ads_${error}`);
      }

      // Validate state parameter (CSRF protection)
      if (!state || !stateStore.has(state)) {
        console.error('[Meta Ads OAuth] Invalid or missing state parameter');
        return res.redirect(`${FRONTEND_URL}/connections?error=invalid_state`);
      }

      // Get user ID from stored state
      const stateData = stateStore.get(state);
      const userId = stateData.userId;

      // Remove used state token
      stateStore.delete(state);

      // Validate code parameter
      if (!code) {
        console.error('[Meta Ads OAuth] No authorization code received');
        return res.redirect(`${FRONTEND_URL}/connections?error=no_code`);
      }

      console.log(`[Meta Ads OAuth] Exchanging code for access token for user ${userId}`);

      // Exchange code for short-lived access token
      const tokenResponse = await axios.get(
        `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token`,
        {
          params: {
            client_id: META_APP_ID,
            client_secret: META_APP_SECRET,
            redirect_uri: META_CALLBACK_URL,
            code
          }
        }
      );

      const { access_token: shortLivedToken } = tokenResponse.data;

      if (!shortLivedToken) {
        console.error('[Meta Ads OAuth] No access token received from Meta');
        return res.redirect(`${FRONTEND_URL}/connections?error=no_token`);
      }

      console.log(`[Meta Ads OAuth] Short-lived access token received for user ${userId}`);

      // Exchange short-lived token for long-lived token (60 days)
      console.log(`[Meta Ads OAuth] Exchanging for long-lived token`);
      const longLivedTokenResponse = await axios.get(
        `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token`,
        {
          params: {
            grant_type: 'fb_exchange_token',
            client_id: META_APP_ID,
            client_secret: META_APP_SECRET,
            fb_exchange_token: shortLivedToken
          }
        }
      );

      const { access_token: longLivedToken, expires_in } = longLivedTokenResponse.data;

      if (!longLivedToken) {
        console.error('[Meta Ads OAuth] Failed to get long-lived token');
        return res.redirect(`${FRONTEND_URL}/connections?error=token_exchange_failed`);
      }

      // Calculate token expiry date (expires_in is in seconds, typically 5184000 = 60 days)
      // Default to 60 days if expires_in is not provided
      const expiresInSeconds = expires_in || 5184000; // 60 days default
      const expiryDate = new Date(Date.now() + (expiresInSeconds * 1000));

      // Validate the date is valid
      if (isNaN(expiryDate.getTime())) {
        console.error('[Meta Ads OAuth] Invalid expiry date calculated');
        return res.redirect(`${FRONTEND_URL}/connections?error=invalid_token_expiry`);
      }

      console.log(`[Meta Ads OAuth] Long-lived token received, expires in ${expiresInSeconds / 86400} days`);

      // Fetch user info from Meta
      const userResponse = await axios.get(
        `https://graph.facebook.com/${META_API_VERSION}/me`,
        {
          params: {
            access_token: longLivedToken,
            fields: 'id,name,email'
          }
        }
      );

      const metaUser = userResponse.data;
      console.log(`[Meta Ads OAuth] Meta user info fetched: ${metaUser.name}`);

      // Fetch ad accounts accessible to this user
      let adAccounts = [];
      try {
        const adAccountsResponse = await axios.get(
          `https://graph.facebook.com/${META_API_VERSION}/me/adaccounts`,
          {
            params: {
              access_token: longLivedToken,
              fields: 'id,name,account_id,account_status,currency,timezone_name'
            }
          }
        );
        adAccounts = adAccountsResponse.data.data || [];
        console.log(`[Meta Ads OAuth] Found ${adAccounts.length} ad accounts`);
      } catch (adAccountError) {
        console.error('[Meta Ads OAuth] Error fetching ad accounts:', adAccountError.message);
        // Continue even if we can't fetch ad accounts - user can still connect
      }

      // Fetch businesses accessible to this user
      let businesses = [];
      try {
        const businessesResponse = await axios.get(
          `https://graph.facebook.com/${META_API_VERSION}/me/businesses`,
          {
            params: {
              access_token: longLivedToken,
              fields: 'id,name'
            }
          }
        );
        businesses = businessesResponse.data.data || [];
        console.log(`[Meta Ads OAuth] Found ${businesses.length} businesses`);
      } catch (businessError) {
        console.error('[Meta Ads OAuth] Error fetching businesses:', businessError.message);
        // Continue even if we can't fetch businesses
      }

      // Fetch pages accessible to this user
      let pages = [];
      try {
        const pagesResponse = await axios.get(
          `https://graph.facebook.com/${META_API_VERSION}/me/accounts`,
          {
            params: {
              access_token: longLivedToken,
              fields: 'id,name,access_token'
            }
          }
        );
        pages = pagesResponse.data.data || [];
        console.log(`[Meta Ads OAuth] Found ${pages.length} pages`);
      } catch (pageError) {
        console.error('[Meta Ads OAuth] Error fetching pages:', pageError.message);
        // Continue even if we can't fetch pages
      }

      // Encrypt the long-lived access token
      const encryptedToken = encryptToken(longLivedToken);

      // Store connection in database
      await storeMetaAdsConnection(userId, {
        meta_user_id: metaUser.id,
        name: metaUser.name,
        email: metaUser.email || null,
        ad_accounts: adAccounts,
        businesses: businesses,
        pages: pages.map(p => ({ id: p.id, name: p.name })), // Don't store page tokens
        token_expiry: expiryDate.toISOString(),
        scopes: tokenResponse.data.scope ? tokenResponse.data.scope.split(',') : []
      }, encryptedToken);

      console.log(`[Meta Ads OAuth] Meta Ads connection stored for user ${userId}`);

      // Redirect back to connections page with success message
      res.redirect(`${FRONTEND_URL}/connections?success=meta_ads_connected`);

    } catch (error) {
      console.error('[Meta Ads OAuth] Error in callback:', error.message);

      // More specific error handling
      if (error.response) {
        console.error('[Meta Ads OAuth] Meta API error:', error.response.data);
      }

      res.redirect(`${FRONTEND_URL}/connections?error=oauth_failed`);
    }
  });

  /**
   * DELETE /api/auth/meta-ads/:id
   * Disconnect Meta Ads account
   * Authentication: Required (via Authorization header)
   */
  router.delete('/:id', authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;

      console.log(`[Meta Ads OAuth] Disconnecting Meta Ads connection ${id} for user ${req.user.id}`);

      // Delete connection from database
      const deleted = await deleteMetaAdsConnection(id, req.user.id);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: 'Connection not found or already deleted'
        });
      }

      console.log(`[Meta Ads OAuth] Meta Ads connection ${id} deleted`);

      res.json({
        success: true,
        message: 'Meta Ads account disconnected successfully'
      });

    } catch (error) {
      console.error('[Meta Ads OAuth] Error disconnecting Meta Ads:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to disconnect Meta Ads account'
      });
    }
  });

  /**
   * GET /api/auth/meta-ads/status
   * Check if user has Meta Ads connected
   */
  router.get('/status', authenticateToken, async (req, res) => {
    try {
      // Try to get Meta Ads token to check if connected
      const token = await getMetaAdsToken(req.user.id);

      res.json({
        success: true,
        connected: !!token
      });

    } catch (error) {
      console.error('[Meta Ads OAuth] Error checking status:', error);
      res.json({
        success: true,
        connected: false
      });
    }
  });

  /**
   * POST /api/auth/meta-ads/refresh
   * Manually refresh Meta Ads token
   * Authentication: Required (via Authorization header)
   */
  router.post('/refresh', authenticateToken, async (req, res) => {
    try {
      console.log(`[Meta Ads OAuth] Manually refreshing token for user ${req.user.id}`);

      // Get current token
      const encryptedTokenData = await getMetaAdsToken(req.user.id);

      if (!encryptedTokenData) {
        return res.status(404).json({
          success: false,
          error: 'No Meta Ads connection found'
        });
      }

      // Decrypt current token
      const currentToken = decryptToken(encryptedTokenData);

      // Exchange current token for new long-lived token
      const refreshResponse = await axios.get(
        `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token`,
        {
          params: {
            grant_type: 'fb_exchange_token',
            client_id: META_APP_ID,
            client_secret: META_APP_SECRET,
            fb_exchange_token: currentToken
          }
        }
      );

      const { access_token: newToken, expires_in } = refreshResponse.data;

      if (!newToken) {
        throw new Error('Failed to refresh token');
      }

      // Calculate new expiry date
      // Default to 60 days if expires_in is not provided
      const expiresInSeconds = expires_in || 5184000; // 60 days default
      const expiryDate = new Date(Date.now() + (expiresInSeconds * 1000));

      // Validate the date is valid
      if (isNaN(expiryDate.getTime())) {
        throw new Error('Invalid expiry date calculated');
      }

      // Encrypt new token
      const encryptedNewToken = encryptToken(newToken);

      // Update token in database
      await updateMetaAdsTokens(req.user.id, encryptedNewToken, expiryDate.toISOString());

      console.log(`[Meta Ads OAuth] Token refreshed successfully for user ${req.user.id}`);

      res.json({
        success: true,
        message: 'Token refreshed successfully',
        expires_at: expiryDate.toISOString()
      });

    } catch (error) {
      console.error('[Meta Ads OAuth] Error refreshing token:', error);

      // If refresh fails, user may need to reconnect
      if (error.response && error.response.data) {
        console.error('[Meta Ads OAuth] Meta API error:', error.response.data);
      }

      res.status(500).json({
        success: false,
        error: 'Failed to refresh token. Please reconnect your Meta Ads account.'
      });
    }
  });

  /**
   * GET /api/connections/meta-ads/ad-accounts
   * Get list of ad accounts for the connected Meta Ads user
   * Authentication: Required (via Authorization header)
   */
  router.get('/ad-accounts', authenticateToken, async (req, res) => {
    try {
      console.log(`[Meta Ads OAuth] Fetching ad accounts for user ${req.user.id}`);

      // Get connection
      const connection = await getMetaAdsConnection(req.user.id);

      if (!connection) {
        return res.status(404).json({
          success: false,
          error: 'No Meta Ads connection found'
        });
      }

      // Extract ad accounts from metadata
      const adAccounts = connection.metadata?.ad_accounts || [];

      console.log(`[Meta Ads OAuth] Returning ${adAccounts.length} ad accounts for user ${req.user.id}`);

      res.json({
        success: true,
        adAccounts: adAccounts
      });

    } catch (error) {
      console.error('[Meta Ads OAuth] Error fetching ad accounts:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch ad accounts'
      });
    }
  });

  /**
   * POST /api/connections/meta-ads/primary-ad-account
   * Set primary ad account for Meta Ads connection
   * Authentication: Required (via Authorization header)
   * Body: { adAccountId, name, accountId, currency }
   */
  router.post('/primary-ad-account', authenticateToken, async (req, res) => {
    try {
      const { adAccountId, name, accountId, currency } = req.body;

      if (!adAccountId || !name) {
        return res.status(400).json({
          success: false,
          error: 'Ad account ID and name are required'
        });
      }

      console.log(`[Meta Ads OAuth] Setting primary ad account for user ${req.user.id}: ${name}`);

      // Get connection
      const connection = await getMetaAdsConnection(req.user.id);

      if (!connection) {
        return res.status(404).json({
          success: false,
          error: 'No Meta Ads connection found'
        });
      }

      // Update connection metadata with primary ad account
      const updatedMetadata = {
        ...connection.metadata,
        primary_ad_account: {
          id: adAccountId,
          name: name,
          account_id: accountId,
          currency: currency
        }
      };

      // Update in database
      const { updateServiceConnectionMetadata } = require('../db');
      await updateServiceConnectionMetadata(req.user.id, 'meta-ads', updatedMetadata);

      console.log(`[Meta Ads OAuth] Primary ad account set successfully for user ${req.user.id}`);

      res.json({
        success: true,
        message: 'Primary ad account set successfully',
        primaryAdAccount: {
          id: adAccountId,
          name: name,
          accountId: accountId,
          currency: currency
        }
      });

    } catch (error) {
      console.error('[Meta Ads OAuth] Error setting primary ad account:', error);
      res.status(500).json({
        success: false,
        error: `Failed to set primary ad account: ${error.message}`
      });
    }
  });

  // Return the configured router
  return router;
};
