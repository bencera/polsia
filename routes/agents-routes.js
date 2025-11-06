/**
 * Agents Routes (Task-Driven AI Agents)
 * RESTful API endpoints for managing task-driven AI agents
 * Note: Different from agent-routes.js which is for generic Claude SDK operations
 */

const express = require('express');
const router = express.Router();
const {
    getAgentsByUserId,
    getAgentById,
    createAgent,
    updateAgent,
    deleteAgent,
    getTasksByAgentId,
    getAgentExecutions,
} = require('../db');
const { runModule } = require('../services/agent-runner');

// Note: All routes require authenticateToken middleware (applied in server.js)
// req.user is available in all routes

/**
 * GET /api/agents
 * List all agents for the authenticated user
 */
router.get('/', async (req, res) => {
    try {
        const agents = await getAgentsByUserId(req.user.id);
        res.json({ success: true, agents });
    } catch (error) {
        console.error('Error getting agents:', error);
        res.status(500).json({ success: false, message: 'Failed to get agents' });
    }
});

/**
 * GET /api/agents/:id
 * Get a specific agent by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const agentId = parseInt(req.params.id);

        if (isNaN(agentId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid agent ID',
            });
        }

        const agent = await getAgentById(agentId, req.user.id);

        if (!agent) {
            return res.status(404).json({
                success: false,
                message: 'Agent not found',
            });
        }

        res.json({ success: true, agent });
    } catch (error) {
        console.error('Error getting agent:', error);
        res.status(500).json({ success: false, message: 'Failed to get agent' });
    }
});

/**
 * POST /api/agents
 * Create a new agent
 */
router.post('/', async (req, res) => {
    try {
        const { name, description, role, agent_type, status, config } = req.body;

        // Validate required fields
        if (!name || !role || !agent_type) {
            return res.status(400).json({
                success: false,
                message: 'Name, role, and agent_type are required',
            });
        }

        const agentData = {
            name,
            description,
            role,
            agent_type,
            status: status || 'active',
            config: config || { mcpMounts: [], maxTurns: 100 },
        };

        const agent = await createAgent(req.user.id, agentData);

        res.json({
            success: true,
            agent,
            message: 'Agent created successfully',
        });
    } catch (error) {
        console.error('Error creating agent:', error);
        res.status(500).json({ success: false, message: 'Failed to create agent' });
    }
});

/**
 * PATCH /api/agents/:id
 * Update an existing agent
 */
router.patch('/:id', async (req, res) => {
    try {
        const agentId = parseInt(req.params.id);

        if (isNaN(agentId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid agent ID',
            });
        }

        const updates = {};
        const allowedFields = ['name', 'description', 'role', 'agent_type', 'status', 'config', 'metadata'];

        // Only include provided fields in update
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid fields provided for update',
            });
        }

        const agent = await updateAgent(agentId, req.user.id, updates);

        if (!agent) {
            return res.status(404).json({
                success: false,
                message: 'Agent not found',
            });
        }

        res.json({
            success: true,
            agent,
            message: 'Agent updated successfully',
        });
    } catch (error) {
        console.error('Error updating agent:', error);
        res.status(500).json({ success: false, message: 'Failed to update agent' });
    }
});

/**
 * DELETE /api/agents/:id
 * Delete an agent
 */
router.delete('/:id', async (req, res) => {
    try {
        const agentId = parseInt(req.params.id);

        if (isNaN(agentId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid agent ID',
            });
        }

        const deleted = await deleteAgent(agentId, req.user.id);

        if (!deleted) {
            return res.status(404).json({
                success: false,
                message: 'Agent not found',
            });
        }

        res.json({
            success: true,
            message: 'Agent deleted successfully',
        });
    } catch (error) {
        console.error('Error deleting agent:', error);
        res.status(500).json({ success: false, message: 'Failed to delete agent' });
    }
});

/**
 * GET /api/agents/:id/tasks
 * Get tasks assigned to an agent
 */
router.get('/:id/tasks', async (req, res) => {
    try {
        const agentId = parseInt(req.params.id);

        if (isNaN(agentId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid agent ID',
            });
        }

        const status = req.query.status || null; // Optional status filter
        const tasks = await getTasksByAgentId(req.user.id, agentId, status);

        res.json({ success: true, tasks, count: tasks.length });
    } catch (error) {
        console.error('Error getting agent tasks:', error);
        res.status(500).json({ success: false, message: 'Failed to get agent tasks' });
    }
});

/**
 * GET /api/agents/:id/executions
 * Get execution history for an agent
 */
router.get('/:id/executions', async (req, res) => {
    try {
        const agentId = parseInt(req.params.id);

        if (isNaN(agentId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid agent ID',
            });
        }

        const limit = parseInt(req.query.limit) || 50;
        const executions = await getAgentExecutions(agentId, req.user.id, limit);

        res.json({ success: true, executions, count: executions.length });
    } catch (error) {
        console.error('Error getting agent executions:', error);
        res.status(500).json({ success: false, message: 'Failed to get agent executions' });
    }
});

/**
 * POST /api/agents/:id/run
 * Manually trigger an agent with a specific task
 */
router.post('/:id/run', async (req, res) => {
    try {
        const agentId = parseInt(req.params.id);
        const { taskId } = req.body;

        if (isNaN(agentId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid agent ID',
            });
        }

        if (!taskId) {
            return res.status(400).json({
                success: false,
                message: 'taskId is required',
            });
        }

        // Verify agent exists
        const agent = await getAgentById(agentId, req.user.id);
        if (!agent) {
            return res.status(404).json({
                success: false,
                message: 'Agent not found',
            });
        }

        // Trigger agent execution via agent-runner
        // We use runModule as the entry point with agentId and taskId options
        // This will be routed to runAgentWithTask in agent-executor.js
        console.log(`[Agents Routes] Manually triggering agent ${agentId} with task ${taskId}`);

        // Trigger asynchronously and return immediately
        runModule(null, req.user.id, {
            agentId,
            taskId,
            trigger_type: 'manual',
        }).catch((error) => {
            console.error(`[Agents Routes] Error executing agent ${agentId}:`, error);
        });

        res.json({
            success: true,
            message: 'Agent execution started',
            agent_id: agentId,
            task_id: taskId,
        });
    } catch (error) {
        console.error('Error triggering agent:', error);
        res.status(500).json({ success: false, message: 'Failed to trigger agent' });
    }
});

module.exports = router;
