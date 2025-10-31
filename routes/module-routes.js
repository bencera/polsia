/**
 * Module Routes
 * RESTful API endpoints for managing autonomous modules
 */

const express = require('express');
const router = express.Router();
const {
    getModulesByUserId,
    getModuleById,
    createModule,
    updateModule,
    deleteModule,
    getModuleExecutions,
    getExecutionLogs,
    getExecutionLogsSince,
} = require('../db');
const { runModule } = require('../services/agent-runner');

// Note: All routes require authenticateToken middleware (applied in server.js)
// req.user is available in all routes

/**
 * GET /api/modules
 * List all modules for the authenticated user
 */
router.get('/', async (req, res) => {
    try {
        const modules = await getModulesByUserId(req.user.id);
        res.json({ success: true, modules });
    } catch (error) {
        console.error('Error getting modules:', error);
        res.status(500).json({ success: false, message: 'Failed to get modules' });
    }
});

/**
 * POST /api/modules
 * Create a new module
 */
router.post('/', async (req, res) => {
    try {
        const { name, description, type, status, frequency, config } = req.body;

        // Validate required fields
        if (!name || !type) {
            return res.status(400).json({
                success: false,
                message: 'Name and type are required',
            });
        }

        const moduleData = {
            name,
            description,
            type,
            status: status || 'active',
            frequency: frequency || 'auto',
            config: config || {},
        };

        const module = await createModule(req.user.id, moduleData);

        res.json({
            success: true,
            module,
            message: 'Module created successfully',
        });
    } catch (error) {
        console.error('Error creating module:', error);
        res.status(500).json({ success: false, message: 'Failed to create module' });
    }
});

/**
 * POST /api/modules/email-summarizer
 * Quick-create an email summarizer module
 */
router.post('/email-summarizer', async (req, res) => {
    try {
        const { name, maxEmails, query } = req.body;

        const moduleData = {
            name: name || 'Email Summarizer',
            description: 'Automatically fetches and summarizes your recent emails',
            type: 'email_summarizer',
            status: 'active',
            frequency: 'manual', // Can be changed to 'auto' for scheduled runs
            config: {
                maxEmails: maxEmails || 5,
                query: query || 'in:inbox'
            },
        };

        const module = await createModule(req.user.id, moduleData);

        res.json({
            success: true,
            module,
            message: 'Email summarizer module created successfully',
        });
    } catch (error) {
        console.error('Error creating email summarizer module:', error);
        res.status(500).json({ success: false, message: 'Failed to create email summarizer module' });
    }
});

/**
 * GET /api/modules/:id
 * Get a specific module by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const moduleId = parseInt(req.params.id);

        if (isNaN(moduleId)) {
            return res.status(400).json({ success: false, message: 'Invalid module ID' });
        }

        const module = await getModuleById(moduleId, req.user.id);

        if (!module) {
            return res.status(404).json({ success: false, message: 'Module not found' });
        }

        res.json({ success: true, module });
    } catch (error) {
        console.error('Error getting module:', error);
        res.status(500).json({ success: false, message: 'Failed to get module' });
    }
});

/**
 * PUT /api/modules/:id
 * Update a module
 */
router.put('/:id', async (req, res) => {
    try {
        const moduleId = parseInt(req.params.id);

        if (isNaN(moduleId)) {
            return res.status(400).json({ success: false, message: 'Invalid module ID' });
        }

        const updates = {};

        // Only update fields that are provided
        if (req.body.name !== undefined) updates.name = req.body.name;
        if (req.body.description !== undefined) updates.description = req.body.description;
        if (req.body.type !== undefined) updates.type = req.body.type;
        if (req.body.status !== undefined) updates.status = req.body.status;
        if (req.body.frequency !== undefined) updates.frequency = req.body.frequency;
        if (req.body.config !== undefined) updates.config = req.body.config;

        const module = await updateModule(moduleId, req.user.id, updates);

        if (!module) {
            return res.status(404).json({ success: false, message: 'Module not found' });
        }

        res.json({
            success: true,
            module,
            message: 'Module updated successfully',
        });
    } catch (error) {
        console.error('Error updating module:', error);
        res.status(500).json({ success: false, message: 'Failed to update module' });
    }
});

/**
 * DELETE /api/modules/:id
 * Delete a module
 */
router.delete('/:id', async (req, res) => {
    try {
        const moduleId = parseInt(req.params.id);

        if (isNaN(moduleId)) {
            return res.status(400).json({ success: false, message: 'Invalid module ID' });
        }

        const deleted = await deleteModule(moduleId, req.user.id);

        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Module not found' });
        }

        res.json({
            success: true,
            message: 'Module deleted successfully',
        });
    } catch (error) {
        console.error('Error deleting module:', error);
        res.status(500).json({ success: false, message: 'Failed to delete module' });
    }
});

/**
 * POST /api/modules/:id/execute
 * Manually trigger a module execution
 */
router.post('/:id/execute', async (req, res) => {
    try {
        const moduleId = parseInt(req.params.id);

        if (isNaN(moduleId)) {
            return res.status(400).json({ success: false, message: 'Invalid module ID' });
        }

        // Verify module exists and belongs to user
        const module = await getModuleById(moduleId, req.user.id);

        if (!module) {
            return res.status(404).json({ success: false, message: 'Module not found' });
        }

        console.log(`[Module Routes] Manual execution triggered for module: ${module.name}`);

        // Trigger execution asynchronously
        runModule(moduleId, req.user.id, {
            trigger_type: 'manual',
        }).catch((error) => {
            console.error(`[Module Routes] Error executing module ${moduleId}:`, error);
        });

        // Return immediately
        res.json({
            success: true,
            message: 'Module execution started',
        });
    } catch (error) {
        console.error('Error triggering module execution:', error);
        res.status(500).json({ success: false, message: 'Failed to trigger execution' });
    }
});

/**
 * GET /api/modules/:id/executions
 * Get execution history for a module
 */
router.get('/:id/executions', async (req, res) => {
    try {
        const moduleId = parseInt(req.params.id);
        const limit = parseInt(req.query.limit) || 50;

        if (isNaN(moduleId)) {
            return res.status(400).json({ success: false, message: 'Invalid module ID' });
        }

        // Verify module exists and belongs to user
        const module = await getModuleById(moduleId, req.user.id);

        if (!module) {
            return res.status(404).json({ success: false, message: 'Module not found' });
        }

        const executions = await getModuleExecutions(moduleId, req.user.id, limit);

        res.json({
            success: true,
            executions,
        });
    } catch (error) {
        console.error('Error getting module executions:', error);
        res.status(500).json({ success: false, message: 'Failed to get executions' });
    }
});

/**
 * GET /api/modules/:id/executions/:executionId/logs
 * Get logs for a specific execution (not streaming, just fetch)
 */
router.get('/:id/executions/:executionId/logs', async (req, res) => {
    try {
        const moduleId = parseInt(req.params.id);
        const executionId = parseInt(req.params.executionId);
        const limit = parseInt(req.query.limit) || 1000;

        if (isNaN(moduleId) || isNaN(executionId)) {
            return res.status(400).json({ success: false, message: 'Invalid module or execution ID' });
        }

        // Verify module exists and belongs to user
        const module = await getModuleById(moduleId, req.user.id);

        if (!module) {
            return res.status(404).json({ success: false, message: 'Module not found' });
        }

        const logs = await getExecutionLogs(executionId, limit);

        res.json({
            success: true,
            logs,
        });
    } catch (error) {
        console.error('Error getting execution logs:', error);
        res.status(500).json({ success: false, message: 'Failed to get logs' });
    }
});

// Note: SSE streaming endpoint is defined in server.js with authenticateTokenFromQuery
// because EventSource doesn't support custom headers

module.exports = router;
