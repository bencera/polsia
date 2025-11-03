/**
 * Render API Key Routes
 * Handles Render API key connection (non-OAuth)
 */

const express = require('express');
const axios = require('axios');
const { encryptToken, decryptToken } = require('../utils/encryption');
const {
  storeRenderConnection,
  getRenderConnection,
  deleteRenderConnection,
  getRenderApiKey,
  updateServiceConnectionMetadata
} = require('../db');

module.exports = (authenticateToken) => {
  const router = express.Router();

/**
 * POST /api/connections/render
 * Store Render API key connection
 * Authentication: Required (JWT)
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { api_key } = req.body;

    // Validate API key presence
    if (!api_key || typeof api_key !== 'string' || api_key.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'API key is required'
      });
    }

    console.log(`[Render] Validating API key for user ${req.user.id}`);

    // Validate API key by calling Render API
    try {
      // Test API key with a simple request to list services (limited to 1 for quick validation)
      const servicesResponse = await axios.get('https://api.render.com/v1/services', {
        headers: {
          'Authorization': `Bearer ${api_key}`,
          'Accept': 'application/json'
        },
        params: {
          limit: 1
        }
      });

      // If we get here, the API key is valid
      console.log(`[Render] API key validated for user ${req.user.id}`);

      // Fetch user's workspaces/owners
      let ownerData = {};
      try {
        const ownersResponse = await axios.get('https://api.render.com/v1/owners', {
          headers: {
            'Authorization': `Bearer ${api_key}`,
            'Accept': 'application/json'
          }
        });

        const owners = ownersResponse.data || [];
        console.log(`[Render] Found ${owners.length} workspace(s) for user ${req.user.id}`);

        // Store first owner/workspace info
        if (owners.length > 0) {
          ownerData = {
            owner_id: owners[0].id,
            owner_name: owners[0].name || 'Personal',
            owner_email: owners[0].email || null,
            total_workspaces: owners.length
          };
        }
      } catch (ownerError) {
        console.warn(`[Render] Could not fetch owner data: ${ownerError.message}`);
        // Continue anyway - owner data is optional
      }

      // Encrypt the API key
      const encryptedApiKey = encryptToken(api_key);

      // Store connection in database
      await storeRenderConnection(req.user.id, {
        ...ownerData,
        connected_at: new Date().toISOString()
      }, encryptedApiKey);

      console.log(`[Render] API key connection stored for user ${req.user.id}`);

      // Return success
      res.json({
        success: true,
        message: 'Render API key connected successfully',
        data: {
          owner_name: ownerData.owner_name || 'Connected',
          total_workspaces: ownerData.total_workspaces || 0
        }
      });

    } catch (apiError) {
      // API key validation failed
      console.error(`[Render] API key validation failed for user ${req.user.id}:`, apiError.message);

      if (apiError.response) {
        // Render API returned an error
        const status = apiError.response.status;
        if (status === 401 || status === 403) {
          return res.status(401).json({
            success: false,
            error: 'Invalid API key. Please check your Render API key and try again.'
          });
        } else if (status === 429) {
          return res.status(429).json({
            success: false,
            error: 'Rate limit exceeded. Please try again later.'
          });
        } else {
          return res.status(500).json({
            success: false,
            error: `Render API error: ${apiError.response.data?.message || 'Unknown error'}`
          });
        }
      }

      // Network or other error
      return res.status(500).json({
        success: false,
        error: 'Failed to validate API key with Render. Please check your connection and try again.'
      });
    }

  } catch (error) {
    console.error('[Render] Error storing connection:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to store Render connection'
    });
  }
});

/**
 * DELETE /api/connections/render/:id
 * Remove Render API key connection
 * Authentication: Required (JWT)
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`[Render] Disconnecting Render connection ${id} for user ${req.user.id}`);

    // Delete connection from database
    const deleted = await deleteRenderConnection(id, req.user.id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Connection not found or already deleted'
      });
    }

    console.log(`[Render] Render connection ${id} deleted`);

    res.json({
      success: true,
      message: 'Render connection removed successfully'
    });

  } catch (error) {
    console.error('[Render] Error disconnecting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove Render connection'
    });
  }
});

/**
 * GET /api/connections/render/status
 * Check if user has Render connected
 * Authentication: Required (JWT)
 */
router.get('/status', authenticateToken, async (req, res) => {
  try {
    // Check if user has a Render connection
    const connection = await getRenderConnection(req.user.id);

    res.json({
      success: true,
      connected: !!connection,
      data: connection ? {
        id: connection.id,
        owner_name: connection.metadata?.owner_name || 'Connected',
        total_workspaces: connection.metadata?.total_workspaces || 0,
        connected_at: connection.metadata?.connected_at || connection.created_at
      } : null
    });

  } catch (error) {
    console.error('[Render] Error checking status:', error);
    res.json({
      success: true,
      connected: false,
      data: null
    });
  }
});

/**
 * GET /api/connections/render/services
 * Fetch all Render services for the user
 * Authentication: Required (JWT)
 */
router.get('/services', authenticateToken, async (req, res) => {
  try {
    console.log(`[Render] Fetching services for user ${req.user.id}`);

    // Get encrypted API key from database
    const encryptedApiKey = await getRenderApiKey(req.user.id);

    if (!encryptedApiKey) {
      return res.status(404).json({
        success: false,
        error: 'Render connection not found. Please connect your Render account first.'
      });
    }

    // Decrypt API key
    const apiKey = decryptToken(encryptedApiKey);

    // Fetch services from Render API
    const servicesResponse = await axios.get('https://api.render.com/v1/services', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      },
      params: {
        limit: 100 // Get up to 100 services
      }
    });

    // Debug: Log the actual response structure
    console.log(`[Render] API Response:`, JSON.stringify(servicesResponse.data, null, 2).substring(0, 500));

    // Render API returns services in an array at the root level
    const services = Array.isArray(servicesResponse.data) ? servicesResponse.data : [];
    console.log(`[Render] Found ${services.length} service(s) for user ${req.user.id}`);

    // Format services for frontend
    const formattedServices = services.map(service => {
      console.log(`[Render] Processing service:`, service.service?.name || service.name);

      // Render API wraps service data in a 'service' property
      const svc = service.service || service;

      return {
        id: svc.id,
        name: svc.name,
        type: svc.type, // web, pserv (private service), cron, worker
        env: svc.serviceDetails?.env || svc.env || 'unknown',
        region: svc.serviceDetails?.region || svc.region || 'unknown',
        url: svc.serviceDetails?.url || svc.url || null,
        autoDeploy: svc.autoDeploy || 'yes',
        branch: svc.serviceDetails?.branch || svc.branch || null,
        repo: svc.serviceDetails?.repo || svc.repo || null,
        suspended: svc.suspended || 'NOT_SUSPENDED',
        createdAt: svc.createdAt,
        updatedAt: svc.updatedAt
      };
    });

    res.json({
      success: true,
      services: formattedServices
    });

  } catch (error) {
    console.error('[Render] Error fetching services:', error);

    if (error.response) {
      const status = error.response.status;
      if (status === 401 || status === 403) {
        return res.status(401).json({
          success: false,
          error: 'Invalid or expired API key. Please reconnect your Render account.'
        });
      }
    }

    res.status(500).json({
      success: false,
      error: 'Failed to fetch Render services'
    });
  }
});

/**
 * GET /api/connections/render/primary-service
 * Get the current primary service
 * Authentication: Required (JWT)
 */
router.get('/primary-service', authenticateToken, async (req, res) => {
  try {
    const connection = await getRenderConnection(req.user.id);

    if (!connection) {
      return res.status(404).json({
        success: false,
        error: 'Render connection not found'
      });
    }

    const primaryService = connection.metadata?.primary_service || null;

    res.json({
      success: true,
      primary_service: primaryService
    });

  } catch (error) {
    console.error('[Render] Error getting primary service:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get primary service'
    });
  }
});

/**
 * PUT /api/connections/render/primary-service
 * Set the primary service
 * Authentication: Required (JWT)
 */
router.put('/primary-service', authenticateToken, async (req, res) => {
  try {
    const { serviceId, serviceName, serviceType } = req.body;

    if (!serviceId || !serviceName) {
      return res.status(400).json({
        success: false,
        error: 'Service ID and name are required'
      });
    }

    console.log(`[Render] Setting primary service ${serviceId} for user ${req.user.id}`);

    // Get current connection
    const connection = await getRenderConnection(req.user.id);

    if (!connection) {
      return res.status(404).json({
        success: false,
        error: 'Render connection not found'
      });
    }

    // Update metadata with primary service
    const updatedMetadata = {
      ...connection.metadata,
      primary_service: {
        id: serviceId,
        name: serviceName,
        type: serviceType || 'web'
      }
    };

    await updateServiceConnectionMetadata(req.user.id, 'render', updatedMetadata);

    console.log(`[Render] Primary service updated for user ${req.user.id}`);

    res.json({
      success: true,
      primary_service: updatedMetadata.primary_service
    });

  } catch (error) {
    console.error('[Render] Error setting primary service:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to set primary service'
    });
  }
});

  // Return the configured router
  return router;
};
