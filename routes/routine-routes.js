/**
 * Routine Routes
 * RESTful API endpoints for managing scheduled agent routines
 */

const express = require('express');
const router = express.Router();
const {
    getRoutinesByUserId,
    getRoutinesByAgentId,
    getRoutineById,
    createRoutine,
    updateRoutine,
    deleteRoutine,
    getRoutineExecutions,
    getExecutionLogs,
    getExecutionLogsSince,
    getAgentById,
} = require('../db');
const { runRoutine } = require('../services/routine-executor');

// Note: All routes require authenticateToken middleware (applied in server.js)
// req.user is available in all routes

/**
 * GET /api/routines
 * List all routines for the authenticated user
 */
router.get('/', async (req, res) => {
    try {
        const routines = await getRoutinesByUserId(req.user.id);
        res.json({ success: true, routines });
    } catch (error) {
        console.error('Error getting routines:', error);
        res.status(500).json({ success: false, message: 'Failed to get routines' });
    }
});

/**
 * GET /api/routines/:id
 * Get a specific routine by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const routine = await getRoutineById(req.params.id, req.user.id);

        if (!routine) {
            return res.status(404).json({
                success: false,
                message: 'Routine not found',
            });
        }

        res.json({ success: true, routine });
    } catch (error) {
        console.error('Error getting routine:', error);
        res.status(500).json({ success: false, message: 'Failed to get routine' });
    }
});

/**
 * POST /api/routines
 * Create a new routine
 */
router.post('/', async (req, res) => {
    try {
        const { agent_id, name, description, type, status, frequency, config } = req.body;

        // Validate required fields
        if (!agent_id) {
            return res.status(400).json({
                success: false,
                message: 'agent_id is required - routines must belong to an agent',
            });
        }

        if (!name || !type) {
            return res.status(400).json({
                success: false,
                message: 'name and type are required',
            });
        }

        // Verify agent exists and belongs to user
        const agent = await getAgentById(agent_id, req.user.id);
        if (!agent) {
            return res.status(404).json({
                success: false,
                message: 'Agent not found or does not belong to you',
            });
        }

        const routineData = {
            agent_id,
            name,
            description,
            type,
            status: status || 'active',
            frequency: frequency || 'manual',
            config: config || {},
        };

        const routine = await createRoutine(req.user.id, routineData);

        res.json({
            success: true,
            routine,
            message: 'Routine created successfully',
        });
    } catch (error) {
        console.error('Error creating routine:', error);
        res.status(500).json({ success: false, message: 'Failed to create routine' });
    }
});

/**
 * PUT /api/routines/:id
 * Update an existing routine
 */
router.put('/:id', async (req, res) => {
    try {
        const { name, description, type, status, frequency, config } = req.body;

        const updates = {};
        if (name !== undefined) updates.name = name;
        if (description !== undefined) updates.description = description;
        if (type !== undefined) updates.type = type;
        if (status !== undefined) updates.status = status;
        if (frequency !== undefined) updates.frequency = frequency;
        if (config !== undefined) updates.config = config;

        const routine = await updateRoutine(req.params.id, req.user.id, updates);

        if (!routine) {
            return res.status(404).json({
                success: false,
                message: 'Routine not found',
            });
        }

        res.json({
            success: true,
            routine,
            message: 'Routine updated successfully',
        });
    } catch (error) {
        console.error('Error updating routine:', error);
        res.status(500).json({ success: false, message: 'Failed to update routine' });
    }
});

/**
 * DELETE /api/routines/:id
 * Delete a routine
 */
router.delete('/:id', async (req, res) => {
    try {
        const deleted = await deleteRoutine(req.params.id, req.user.id);

        if (!deleted) {
            return res.status(404).json({
                success: false,
                message: 'Routine not found',
            });
        }

        res.json({
            success: true,
            message: 'Routine deleted successfully',
        });
    } catch (error) {
        console.error('Error deleting routine:', error);
        res.status(500).json({ success: false, message: 'Failed to delete routine' });
    }
});

/**
 * POST /api/routines/:id/run
 * Manually trigger a routine execution
 */
router.post('/:id/run', async (req, res) => {
    try {
        const routine = await getRoutineById(req.params.id, req.user.id);

        if (!routine) {
            return res.status(404).json({
                success: false,
                message: 'Routine not found',
            });
        }

        // Trigger routine execution asynchronously
        runRoutine(req.params.id, req.user.id, {
            trigger_type: 'manual',
        }).catch((error) => {
            console.error(`Error running routine ${req.params.id}:`, error);
        });

        res.json({
            success: true,
            message: 'Routine execution triggered',
        });
    } catch (error) {
        console.error('Error triggering routine:', error);
        res.status(500).json({ success: false, message: 'Failed to trigger routine' });
    }
});

/**
 * GET /api/routines/:id/executions
 * Get execution history for a routine
 */
router.get('/:id/executions', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const executions = await getRoutineExecutions(req.params.id, req.user.id, limit);

        res.json({ success: true, executions });
    } catch (error) {
        console.error('Error getting routine executions:', error);
        res.status(500).json({ success: false, message: 'Failed to get executions' });
    }
});

/**
 * GET /api/routines/:id/executions/:executionId/logs
 * Get execution logs for a specific routine execution
 */
router.get('/:id/executions/:executionId/logs', async (req, res) => {
    try {
        const logs = await getExecutionLogs(req.params.executionId);
        res.json({ success: true, logs });
    } catch (error) {
        console.error('Error getting execution logs:', error);
        res.status(500).json({ success: false, message: 'Failed to get logs' });
    }
});

/**
 * GET /api/routines/:id/executions/:executionId/logs/stream
 * Stream execution logs for real-time updates (Server-Sent Events)
 */
router.get('/:id/executions/:executionId/logs/stream', async (req, res) => {
    try {
        // Set SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const executionId = req.params.executionId;
        let lastLogId = 0;

        // Send initial logs
        const initialLogs = await getExecutionLogs(executionId);
        res.write(`data: ${JSON.stringify({ logs: initialLogs })}\n\n`);

        if (initialLogs.length > 0) {
            lastLogId = initialLogs[initialLogs.length - 1].id;
        }

        // Poll for new logs every second
        const intervalId = setInterval(async () => {
            try {
                const newLogs = await getExecutionLogsSince(executionId, lastLogId);

                if (newLogs.length > 0) {
                    res.write(`data: ${JSON.stringify({ logs: newLogs })}\n\n`);
                    lastLogId = newLogs[newLogs.length - 1].id;
                }
            } catch (error) {
                console.error('Error fetching new logs:', error);
            }
        }, 1000);

        // Clean up on client disconnect
        req.on('close', () => {
            clearInterval(intervalId);
            res.end();
        });
    } catch (error) {
        console.error('Error streaming logs:', error);
        res.status(500).json({ success: false, message: 'Failed to stream logs' });
    }
});

/**
 * GET /api/agents/:agentId/routines
 * Get all routines owned by a specific agent
 */
router.get('/agents/:agentId/routines', async (req, res) => {
    try {
        const routines = await getRoutinesByAgentId(req.params.agentId, req.user.id);
        res.json({ success: true, routines });
    } catch (error) {
        console.error('Error getting agent routines:', error);
        res.status(500).json({ success: false, message: 'Failed to get agent routines' });
    }
});

module.exports = router;
