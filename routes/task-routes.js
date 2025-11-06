/**
 * Task Management API Routes
 * REST endpoints for task workflow management
 * Allows frontend to display tasks and admins to manually manage workflow
 */

const express = require('express');
const router = express.Router();
const {
    createTaskProposal,
    updateTaskStatus,
    getTasksByStatus,
    getTaskById,
    getTasksByModuleId,
    getTasksByUserId
} = require('../db');

/**
 * GET /api/tasks
 * Get tasks with optional filters
 * Query params:
 *   - status: filter by status (suggested, approved, in_progress, waiting, blocked, completed, rejected, failed)
 *   - assigned_to_module_id: filter by assigned module
 *   - limit: maximum results (default: 50)
 *   - offset: pagination offset (default: 0)
 */
router.get('/', async (req, res) => {
    try {
        const userId = req.user.userId;
        const { status, assigned_to_module_id, limit = 50, offset = 0 } = req.query;

        const options = {
            limit: parseInt(limit),
            offset: parseInt(offset)
        };

        if (assigned_to_module_id) {
            options.assigned_to_module_id = parseInt(assigned_to_module_id);
        }

        const tasks = await getTasksByStatus(userId, status || null, options);

        res.json({
            success: true,
            count: tasks.length,
            filter: { status, assigned_to_module_id, limit: options.limit, offset: options.offset },
            tasks
        });
    } catch (error) {
        console.error('Error fetching tasks:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch tasks',
            message: error.message
        });
    }
});

/**
 * GET /api/tasks/stats
 * Get task statistics (counts by status)
 */
router.get('/stats', async (req, res) => {
    try {
        const userId = req.user.userId;

        // Get counts for each status
        const statuses = ['suggested', 'approved', 'in_progress', 'waiting', 'blocked', 'completed', 'rejected', 'failed'];
        const stats = {};

        for (const status of statuses) {
            const tasks = await getTasksByStatus(userId, status, { limit: 1000 });
            stats[status] = tasks.length;
        }

        // Calculate total
        stats.total = Object.values(stats).reduce((sum, count) => sum + count, 0);

        res.json({
            success: true,
            stats
        });
    } catch (error) {
        console.error('Error fetching task stats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch task stats',
            message: error.message
        });
    }
});

/**
 * GET /api/tasks/:id
 * Get single task by ID with full details
 */
router.get('/:id', async (req, res) => {
    try {
        const userId = req.user.userId;
        const taskId = parseInt(req.params.id);

        const task = await getTaskById(taskId, userId);

        if (!task) {
            return res.status(404).json({
                success: false,
                error: 'Task not found'
            });
        }

        res.json({
            success: true,
            task
        });
    } catch (error) {
        console.error('Error fetching task:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch task',
            message: error.message
        });
    }
});

/**
 * POST /api/tasks
 * Create a new task proposal (manual task creation by admin/user)
 * Body:
 *   - title: string (required)
 *   - description: string (required)
 *   - suggestion_reasoning: string (required)
 *   - assigned_to_module_id: number (optional)
 *   - proposed_by_module_id: number (optional)
 */
router.post('/', async (req, res) => {
    try {
        const userId = req.user.userId;
        const {
            title,
            description,
            suggestion_reasoning,
            assigned_to_module_id,
            proposed_by_module_id
        } = req.body;

        // Validation
        if (!title || !description || !suggestion_reasoning) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: title, description, suggestion_reasoning'
            });
        }

        const taskData = {
            title,
            description,
            suggestion_reasoning,
            assigned_to_module_id: assigned_to_module_id || null,
            proposed_by_module_id: proposed_by_module_id || null
        };

        const task = await createTaskProposal(userId, taskData);

        res.status(201).json({
            success: true,
            message: 'Task proposal created successfully',
            task
        });
    } catch (error) {
        console.error('Error creating task:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create task',
            message: error.message
        });
    }
});

/**
 * PATCH /api/tasks/:id/status
 * Update task status (manual workflow management)
 * Body:
 *   - status: string (required) - new status
 *   - changed_by: string (optional) - who made the change
 *   - approval_reasoning: string (optional) - for status=approved
 *   - rejection_reasoning: string (optional) - for status=rejected
 *   - completion_summary: string (optional) - for status=completed
 *   - blocked_reason: string (optional) - for status=waiting/blocked
 *   - assigned_to_module_id: number (optional) - for status=approved
 */
router.patch('/:id/status', async (req, res) => {
    try {
        const userId = req.user.userId;
        const taskId = parseInt(req.params.id);
        const {
            status,
            changed_by = 'user',
            approval_reasoning,
            rejection_reasoning,
            completion_summary,
            blocked_reason,
            assigned_to_module_id,
            approved_by
        } = req.body;

        // Validation
        if (!status) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field: status'
            });
        }

        const validStatuses = ['suggested', 'approved', 'in_progress', 'waiting', 'blocked', 'completed', 'rejected', 'failed'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
            });
        }

        // Verify task belongs to user
        const existingTask = await getTaskById(taskId, userId);
        if (!existingTask) {
            return res.status(404).json({
                success: false,
                error: 'Task not found'
            });
        }

        // Build updates object
        const updates = {
            changed_by
        };

        if (approval_reasoning) updates.approval_reasoning = approval_reasoning;
        if (rejection_reasoning) updates.rejection_reasoning = rejection_reasoning;
        if (completion_summary) updates.completion_summary = completion_summary;
        if (blocked_reason) updates.blocked_reason = blocked_reason;
        if (assigned_to_module_id) updates.assigned_to_module_id = assigned_to_module_id;
        if (approved_by) updates.approved_by = approved_by;

        const task = await updateTaskStatus(taskId, status, updates);

        res.json({
            success: true,
            message: `Task status updated to: ${status}`,
            task
        });
    } catch (error) {
        console.error('Error updating task status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update task status',
            message: error.message
        });
    }
});

/**
 * POST /api/tasks/:id/approve
 * Approve a suggested task (convenience endpoint)
 * Body:
 *   - approval_reasoning: string (required)
 *   - assign_to_module_id: number (optional)
 *   - approved_by: string (default: 'user')
 */
router.post('/:id/approve', async (req, res) => {
    try {
        const userId = req.user.userId;
        const taskId = parseInt(req.params.id);
        const {
            approval_reasoning,
            assign_to_module_id,
            approved_by = 'user'
        } = req.body;

        if (!approval_reasoning) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field: approval_reasoning'
            });
        }

        // Verify task belongs to user and is in suggested status
        const existingTask = await getTaskById(taskId, userId);
        if (!existingTask) {
            return res.status(404).json({
                success: false,
                error: 'Task not found'
            });
        }

        if (existingTask.status !== 'suggested') {
            return res.status(400).json({
                success: false,
                error: `Cannot approve task with status: ${existingTask.status}. Only suggested tasks can be approved.`
            });
        }

        const task = await updateTaskStatus(taskId, 'approved', {
            changed_by: approved_by,
            approval_reasoning,
            approved_by,
            assigned_to_module_id: assign_to_module_id || null
        });

        res.json({
            success: true,
            message: 'Task approved successfully',
            task
        });
    } catch (error) {
        console.error('Error approving task:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to approve task',
            message: error.message
        });
    }
});

/**
 * POST /api/tasks/:id/reject
 * Reject a suggested task (convenience endpoint)
 * Body:
 *   - rejection_reasoning: string (required)
 *   - rejected_by: string (default: 'user')
 */
router.post('/:id/reject', async (req, res) => {
    try {
        const userId = req.user.userId;
        const taskId = parseInt(req.params.id);
        const {
            rejection_reasoning,
            rejected_by = 'user'
        } = req.body;

        if (!rejection_reasoning) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field: rejection_reasoning'
            });
        }

        // Verify task belongs to user and is in suggested status
        const existingTask = await getTaskById(taskId, userId);
        if (!existingTask) {
            return res.status(404).json({
                success: false,
                error: 'Task not found'
            });
        }

        if (existingTask.status !== 'suggested') {
            return res.status(400).json({
                success: false,
                error: `Cannot reject task with status: ${existingTask.status}. Only suggested tasks can be rejected.`
            });
        }

        const task = await updateTaskStatus(taskId, 'rejected', {
            changed_by: rejected_by,
            rejection_reasoning
        });

        res.json({
            success: true,
            message: 'Task rejected',
            task
        });
    } catch (error) {
        console.error('Error rejecting task:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to reject task',
            message: error.message
        });
    }
});

/**
 * POST /api/tasks/:id/assign
 * Assign a task to an agent or module
 * Body: { agentId?: number, moduleId?: number }
 */
router.post('/:id/assign', async (req, res) => {
    try {
        const userId = req.user.userId;
        const taskId = parseInt(req.params.id);
        const { agentId, moduleId } = req.body;

        // Validate that either agentId or moduleId is provided (but not both)
        if (!agentId && !moduleId) {
            return res.status(400).json({
                success: false,
                error: 'Either agentId or moduleId must be provided'
            });
        }

        if (agentId && moduleId) {
            return res.status(400).json({
                success: false,
                error: 'Cannot assign to both agent and module. Choose one.'
            });
        }

        // Verify task belongs to user
        const existingTask = await getTaskById(taskId, userId);
        if (!existingTask) {
            return res.status(404).json({
                success: false,
                error: 'Task not found'
            });
        }

        // Update task assignment
        const updates = {
            changed_by: 'user'
        };

        if (agentId) {
            updates.assigned_to_agent_id = agentId;
            updates.assigned_to_module_id = null; // Clear module assignment
        } else {
            updates.assigned_to_module_id = moduleId;
            updates.assigned_to_agent_id = null; // Clear agent assignment
        }

        const task = await updateTaskStatus(taskId, existingTask.status, updates);

        res.json({
            success: true,
            message: `Task assigned to ${agentId ? 'agent' : 'module'}`,
            task
        });
    } catch (error) {
        console.error('Error assigning task:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to assign task',
            message: error.message
        });
    }
});

module.exports = router;
