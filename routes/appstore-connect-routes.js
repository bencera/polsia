/**
 * App Store Connect Routes
 * Handles App Store Connect JWT-based authentication (non-OAuth)
 * Users manually input Key ID, Issuer ID, and Private Key
 */

const express = require('express');
const { encryptToken, decryptToken } = require('../utils/encryption');
const {
  storeAppStoreConnectConnection,
  getAppStoreConnectConnection,
  deleteAppStoreConnectConnection,
  getAppStoreConnectPrivateKey,
  storeAppStoreAnalyticsRequest,
  getAppStoreAnalyticsRequest
} = require('../db');
const { AppStoreConnectClient } = require('../services/appstore-connect-service');

module.exports = (authenticateToken) => {
  const router = express.Router();

/**
 * POST /api/connections/appstore-connect
 * Store App Store Connect connection
 * Authentication: Required (JWT)
 * Body: { keyId, issuerId, privateKey }
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { keyId, issuerId, privateKey } = req.body;

    // Validate required fields
    if (!keyId || typeof keyId !== 'string' || keyId.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Key ID is required'
      });
    }

    if (!issuerId || typeof issuerId !== 'string' || issuerId.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Issuer ID is required'
      });
    }

    if (!privateKey || typeof privateKey !== 'string' || privateKey.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Private Key is required'
      });
    }

    // Validate Key ID format (should be 10 alphanumeric characters)
    if (!/^[A-Z0-9]{10}$/.test(keyId.trim())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Key ID format. Expected 10 alphanumeric characters (e.g., 2X9R4HXF34)'
      });
    }

    // Validate Issuer ID format (should be UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(issuerId.trim())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Issuer ID format. Expected UUID format (e.g., 57246542-96fe-1a63-e053-0824d011072a)'
      });
    }

    // Validate private key format (should contain PEM header/footer)
    const trimmedKey = privateKey.trim();
    if (!trimmedKey.includes('BEGIN PRIVATE KEY') || !trimmedKey.includes('END PRIVATE KEY')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Private Key format. Expected PEM format from .p8 file'
      });
    }

    console.log(`[App Store Connect] Validating credentials for user ${req.user.id}`);

    // Test credentials by attempting to create client and fetch apps
    let appsData = [];
    try {
      const testClient = new AppStoreConnectClient(keyId.trim(), issuerId.trim(), trimmedKey);

      // Test connection by listing apps (limit to 5 for quick validation)
      appsData = await testClient.listApps({ limit: 5 });

      console.log(`[App Store Connect] Credentials validated for user ${req.user.id}. Found ${appsData.length} app(s).`);
    } catch (apiError) {
      console.error(`[App Store Connect] Credential validation failed for user ${req.user.id}:`, apiError.message);

      // Check for specific error types
      if (apiError.message.includes('Authentication failed')) {
        return res.status(401).json({
          success: false,
          error: 'Invalid credentials. Please verify your Key ID, Issuer ID, and Private Key are correct.'
        });
      } else if (apiError.message.includes('Rate limit exceeded')) {
        return res.status(429).json({
          success: false,
          error: 'Rate limit exceeded. Please try again in a few minutes.'
        });
      } else if (apiError.message.includes('Failed to generate JWT')) {
        return res.status(400).json({
          success: false,
          error: 'Failed to generate JWT token. Please check your Private Key format.'
        });
      } else {
        return res.status(500).json({
          success: false,
          error: `API connection failed: ${apiError.message}`
        });
      }
    }

    // Encrypt the private key before storing
    const encryptedPrivateKey = encryptToken(trimmedKey);

    // Prepare connection data
    const connectionData = {
      keyId: keyId.trim(),
      issuerId: issuerId.trim()
    };

    // Store connection in database
    await storeAppStoreConnectConnection(req.user.id, connectionData, encryptedPrivateKey);

    console.log(`[App Store Connect] Connection stored for user ${req.user.id}`);

    // Return success with app count
    res.json({
      success: true,
      message: 'App Store Connect credentials connected successfully',
      data: {
        keyId: keyId.trim(),
        issuerId: issuerId.trim(),
        appCount: appsData.length
      }
    });

  } catch (error) {
    console.error('[App Store Connect] Error storing connection:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to store App Store Connect connection'
    });
  }
});

/**
 * DELETE /api/connections/appstore-connect/:id
 * Remove App Store Connect connection
 * Authentication: Required (JWT)
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`[App Store Connect] Disconnecting connection ${id} for user ${req.user.id}`);

    // Delete connection from database
    const deleted = await deleteAppStoreConnectConnection(id, req.user.id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Connection not found or already deleted'
      });
    }

    console.log(`[App Store Connect] Connection ${id} deleted`);

    res.json({
      success: true,
      message: 'App Store Connect connection removed successfully'
    });

  } catch (error) {
    console.error('[App Store Connect] Error disconnecting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove App Store Connect connection'
    });
  }
});

/**
 * GET /api/connections/appstore-connect/status
 * Check if user has App Store Connect connected
 * Authentication: Required (JWT)
 */
router.get('/status', authenticateToken, async (req, res) => {
  try {
    // Check if user has an App Store Connect connection
    const connection = await getAppStoreConnectConnection(req.user.id);

    res.json({
      success: true,
      connected: !!connection,
      data: connection ? {
        id: connection.id,
        keyId: connection.key_id,
        issuerId: connection.issuer_id,
        connected_at: connection.connected_at || connection.created_at
      } : null
    });

  } catch (error) {
    console.error('[App Store Connect] Error checking status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check connection status'
    });
  }
});

/**
 * POST /api/connections/appstore-connect/test
 * Test App Store Connect connection
 * Authentication: Required (JWT)
 */
router.post('/test', authenticateToken, async (req, res) => {
  try {
    console.log(`[App Store Connect] Testing connection for user ${req.user.id}`);

    // Get connection
    const connection = await getAppStoreConnectConnection(req.user.id);

    if (!connection) {
      return res.status(404).json({
        success: false,
        error: 'No App Store Connect connection found'
      });
    }

    // Decrypt private key
    const privateKey = decryptToken({
      encrypted: connection.encrypted_private_key,
      iv: connection.private_key_iv,
      authTag: connection.private_key_auth_tag
    });

    // Create client and test connection
    const client = new AppStoreConnectClient(connection.key_id, connection.issuer_id, privateKey);
    const apps = await client.listApps({ limit: 10 });

    console.log(`[App Store Connect] Connection test successful for user ${req.user.id}. Found ${apps.length} apps.`);

    res.json({
      success: true,
      message: 'Connection test successful',
      data: {
        appCount: apps.length,
        apps: apps.map(app => ({
          id: app.id,
          name: app.attributes?.name,
          bundleId: app.attributes?.bundleId
        }))
      }
    });

  } catch (error) {
    console.error('[App Store Connect] Connection test failed:', error);

    if (error.message.includes('Authentication failed')) {
      return res.status(401).json({
        success: false,
        error: 'Authentication failed. Your credentials may have expired or been revoked.'
      });
    }

    res.status(500).json({
      success: false,
      error: `Connection test failed: ${error.message}`
    });
  }
});

/**
 * GET /api/connections/appstore-connect/apps
 * Fetch apps from App Store Connect
 * Authentication: Required (JWT)
 */
router.get('/apps', authenticateToken, async (req, res) => {
  try {
    console.log(`[App Store Connect] Fetching apps for user ${req.user.id}`);

    // Get connection
    const connection = await getAppStoreConnectConnection(req.user.id);

    if (!connection) {
      return res.status(404).json({
        success: false,
        error: 'No App Store Connect connection found'
      });
    }

    // Decrypt private key
    const privateKey = decryptToken({
      encrypted: connection.encrypted_private_key,
      iv: connection.private_key_iv,
      authTag: connection.private_key_auth_tag
    });

    // Create client and fetch apps
    const client = new AppStoreConnectClient(connection.key_id, connection.issuer_id, privateKey);
    const apps = await client.listApps({ limit: 200 });

    console.log(`[App Store Connect] Found ${apps.length} apps for user ${req.user.id}`);

    // Format apps for frontend
    const formattedApps = apps.map(app => ({
      id: app.id,
      name: app.attributes?.name,
      bundleId: app.attributes?.bundleId,
      sku: app.attributes?.sku,
      primaryLocale: app.attributes?.primaryLocale
    }));

    res.json({
      success: true,
      apps: formattedApps
    });

  } catch (error) {
    console.error('[App Store Connect] Error fetching apps:', error);
    res.status(500).json({
      success: false,
      error: `Failed to fetch apps: ${error.message}`
    });
  }
});

/**
 * POST /api/connections/appstore-connect/primary-app
 * Set primary app for App Store Connect connection
 * Authentication: Required (JWT)
 * Body: { appId, appName, bundleId }
 */
router.post('/primary-app', authenticateToken, async (req, res) => {
  try {
    const { appId, appName, bundleId } = req.body;

    if (!appId || !appName) {
      return res.status(400).json({
        success: false,
        error: 'App ID and name are required'
      });
    }

    console.log(`[App Store Connect] Setting primary app for user ${req.user.id}: ${appName}`);

    // Get connection
    const connection = await getAppStoreConnectConnection(req.user.id);

    if (!connection) {
      return res.status(404).json({
        success: false,
        error: 'No App Store Connect connection found'
      });
    }

    // Update connection metadata with primary app
    const updatedMetadata = {
      key_id: connection.key_id,
      issuer_id: connection.issuer_id,
      encrypted_private_key: connection.encrypted_private_key,
      private_key_iv: connection.private_key_iv,
      private_key_auth_tag: connection.private_key_auth_tag,
      connected_at: connection.connected_at,
      primary_app: {
        id: appId,
        name: appName,
        bundle_id: bundleId
      }
    };

    // Update in database
    const { updateServiceConnectionMetadata } = require('../db');
    await updateServiceConnectionMetadata(req.user.id, 'appstore_connect', updatedMetadata);

    console.log(`[App Store Connect] Primary app set successfully for user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Primary app set successfully',
      primaryApp: {
        id: appId,
        name: appName,
        bundleId
      }
    });

  } catch (error) {
    console.error('[App Store Connect] Error setting primary app:', error);
    res.status(500).json({
      success: false,
      error: `Failed to set primary app: ${error.message}`
    });
  }
});

/**
 * POST /api/connections/appstore-connect/analytics-request
 * Store analytics request ID for future retrieval
 * Authentication: Required (JWT)
 * Body: { requestId, appId }
 */
router.post('/analytics-request', authenticateToken, async (req, res) => {
  try {
    const { requestId, appId } = req.body;

    if (!requestId || !appId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: requestId and appId'
      });
    }

    await storeAppStoreAnalyticsRequest(req.user.id, requestId, appId);

    console.log(`[App Store Connect] Analytics request ID stored for user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Analytics request ID stored successfully',
      data: { requestId, appId }
    });

  } catch (error) {
    console.error('[App Store Connect] Error storing analytics request:', error);
    res.status(500).json({
      success: false,
      error: `Failed to store analytics request: ${error.message}`
    });
  }
});

/**
 * GET /api/connections/appstore-connect/analytics-request
 * Get stored analytics request ID
 * Authentication: Required (JWT)
 */
router.get('/analytics-request', authenticateToken, async (req, res) => {
  try {
    const storedRequest = await getAppStoreAnalyticsRequest(req.user.id);

    if (!storedRequest) {
      return res.status(404).json({
        success: false,
        error: 'No analytics request found. Please run the Enable module first.'
      });
    }

    res.json({
      success: true,
      data: storedRequest
    });

  } catch (error) {
    console.error('[App Store Connect] Error getting analytics request:', error);
    res.status(500).json({
      success: false,
      error: `Failed to get analytics request: ${error.message}`
    });
  }
});

  return router;
};
