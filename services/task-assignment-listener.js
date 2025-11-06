/**
 * Task Assignment Listener
 * Polls for approved tasks assigned to agents and triggers automatic execution
 * Enables real-time task-driven agent system
 */

const { pool } = require('../db');
const { runAgentWithTask } = require('./agent-executor');

// Track currently executing agents to prevent concurrent executions
const executingAgents = new Set();

// Polling interval in milliseconds (default: 30 seconds)
const POLL_INTERVAL = process.env.TASK_POLL_INTERVAL || 30000;

// Flag to control listener lifecycle
let isRunning = false;
let pollTimeout = null;

/**
 * Start the task assignment listener
 * Begins polling for approved tasks and triggering agent executions
 */
function startTaskAssignmentListener() {
    if (isRunning) {
        console.log('[Task Assignment Listener] Already running, skipping start');
        return;
    }

    isRunning = true;
    console.log(`[Task Assignment Listener] Starting (poll interval: ${POLL_INTERVAL}ms)`);

    // Start polling immediately
    pollTaskAssignments();
}

/**
 * Stop the task assignment listener
 * Cancels polling and prevents new agent executions
 */
function stopTaskAssignmentListener() {
    if (!isRunning) {
        return;
    }

    isRunning = false;
    if (pollTimeout) {
        clearTimeout(pollTimeout);
        pollTimeout = null;
    }

    console.log('[Task Assignment Listener] Stopped');
}

/**
 * Poll for approved tasks assigned to agents and trigger execution
 */
async function pollTaskAssignments() {
    if (!isRunning) {
        return;
    }

    try {
        // Query for approved tasks assigned to agents
        const client = await pool.connect();
        try {
            const result = await client.query(`
                SELECT
                    t.id as task_id,
                    t.user_id,
                    t.assigned_to_agent_id as agent_id,
                    t.title,
                    t.priority,
                    a.name as agent_name,
                    a.status as agent_status
                FROM tasks t
                INNER JOIN agents a ON a.id = t.assigned_to_agent_id
                WHERE t.status = 'approved'
                  AND t.assigned_to_agent_id IS NOT NULL
                  AND a.status = 'active'
                ORDER BY
                    CASE t.priority
                        WHEN 'critical' THEN 1
                        WHEN 'high' THEN 2
                        WHEN 'medium' THEN 3
                        WHEN 'low' THEN 4
                        ELSE 5
                    END,
                    t.created_at ASC
            `);

            const tasksToExecute = result.rows;

            if (tasksToExecute.length > 0) {
                console.log(`[Task Assignment Listener] Found ${tasksToExecute.length} approved tasks awaiting execution`);

                for (const task of tasksToExecute) {
                    await processTaskAssignment(task);
                }
            }
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('[Task Assignment Listener] Error polling for task assignments:', error);
    }

    // Schedule next poll if still running
    if (isRunning) {
        pollTimeout = setTimeout(pollTaskAssignments, POLL_INTERVAL);
    }
}

/**
 * Process a single task assignment and trigger agent execution
 * @param {Object} task - Task details with agent info
 */
async function processTaskAssignment(task) {
    const { task_id, user_id, agent_id, title, agent_name, agent_status } = task;

    // Skip if agent is already executing another task
    if (executingAgents.has(agent_id)) {
        console.log(`[Task Assignment Listener] Agent ${agent_id} (${agent_name}) is already executing a task, skipping Task ${task_id}`);
        return;
    }

    // Verify agent is active
    if (agent_status !== 'active') {
        console.log(`[Task Assignment Listener] Agent ${agent_id} (${agent_name}) is not active (status: ${agent_status}), skipping Task ${task_id}`);
        return;
    }

    try {
        console.log(`[Task Assignment Listener] 🚀 Triggering Agent ${agent_id} (${agent_name}) for Task ${task_id}: ${title}`);

        // Mark agent as executing
        executingAgents.add(agent_id);

        // Trigger agent execution (non-blocking)
        // We don't await here to allow parallel execution of multiple agents
        runAgentWithTask(agent_id, task_id, user_id)
            .then(result => {
                console.log(`[Task Assignment Listener] ✅ Agent ${agent_id} completed Task ${task_id} (${result.success ? 'success' : 'failed'})`);
            })
            .catch(error => {
                console.error(`[Task Assignment Listener] ❌ Agent ${agent_id} failed to execute Task ${task_id}:`, error.message);
            })
            .finally(() => {
                // Remove from executing set when done
                executingAgents.delete(agent_id);
            });

    } catch (error) {
        console.error(`[Task Assignment Listener] Error processing Task ${task_id}:`, error);
        executingAgents.delete(agent_id);
    }
}

/**
 * Get current listener status
 * @returns {Object} Status information
 */
function getListenerStatus() {
    return {
        isRunning,
        pollInterval: POLL_INTERVAL,
        executingAgentsCount: executingAgents.size,
        executingAgentIds: Array.from(executingAgents),
    };
}

module.exports = {
    startTaskAssignmentListener,
    stopTaskAssignmentListener,
    getListenerStatus,
};
