/**
 * Scheduler Service
 *
 * Checks for scheduled agents that need to run and triggers their execution
 * Unified system: modules, routines, and agents are all now "agents" with execution_mode
 */

const cron = require('node-cron');
const { pool } = require('../db');
const { runModule } = require('./agent-runner');
const { runBrainCycle, getLastBrainDecision } = require('./brain-orchestrator');
const { startTaskAssignmentListener, stopTaskAssignmentListener } = require('./task-assignment-listener');

// Track scheduled tasks
const scheduledTasks = new Map();

/**
 * Start the scheduler
 *
 * Active:
 * - Scheduled agents (execution_mode='scheduled') checked every hour
 * - Brain cycles once per day at 9 AM (optional)
 */
function startScheduler() {
    console.log('[Scheduler] Starting scheduler for scheduled agents');

    // Run scheduled agent checks every hour
    const agentTask = cron.schedule('0 * * * *', async () => {
        console.log('[Scheduler] Checking for scheduled agents to execute');
        await checkAndRunScheduledAgents();
    });

    scheduledTasks.set('agents', agentTask);

    // OPTIONAL: Run Brain cycle checks once per day at 9 AM
    // Uncomment to enable:
    // const brainTask = cron.schedule('0 9 * * *', async () => {
    //     console.log('[Scheduler] Checking for Brain cycles to execute');
    //     await checkAndRunBrainCycles();
    // });
    // scheduledTasks.set('brain', brainTask);

    console.log('[Scheduler] Scheduler started successfully');
}

/**
 * Stop the scheduler
 */
function stopScheduler() {
    console.log('[Scheduler] Stopping scheduler');

    // Stop cron tasks
    for (const [name, task] of scheduledTasks.entries()) {
        task.stop();
        scheduledTasks.delete(name);
    }

    // Stop task assignment listener
    console.log('[Scheduler] Stopping task assignment listener');
    stopTaskAssignmentListener();
}

/**
 * Check for scheduled agents that should run and execute them
 */
async function checkAndRunScheduledAgents() {
    const client = await pool.connect();
    try {
        // Get all agents with execution_mode='scheduled' that are active
        const result = await client.query(`
            SELECT id, user_id, name, agent_type, schedule_frequency, last_run_at, next_run_at
            FROM agents
            WHERE execution_mode = 'scheduled'
              AND status = 'active'
              AND (next_run_at IS NULL OR next_run_at <= NOW())
            ORDER BY next_run_at NULLS FIRST
        `);

        const agents = result.rows;
        console.log(`[Scheduler] Found ${agents.length} scheduled agents due for execution`);

        for (const agent of agents) {
            try {
                console.log(`[Scheduler] Triggering agent: ${agent.name} (ID: ${agent.id}, type: ${agent.agent_type})`);

                // Run agent asynchronously (don't await to prevent blocking)
                runModule(agent.id, agent.user_id, {
                    trigger_type: 'scheduled',
                }).then(() => {
                    // Update last_run_at and calculate next_run_at after execution
                    return updateAgentSchedule(agent.id, agent.schedule_frequency);
                }).catch((error) => {
                    console.error(`[Scheduler] Error running agent ${agent.id}:`, error);
                });
            } catch (error) {
                console.error(`[Scheduler] Error processing agent ${agent.id}:`, error);
            }
        }
    } catch (error) {
        console.error('[Scheduler] Error checking scheduled agents:', error);
    } finally {
        client.release();
    }
}

/**
 * Update agent's schedule after execution
 * @param {number} agentId - Agent ID
 * @param {string} frequency - Schedule frequency (auto, daily, weekly)
 */
async function updateAgentSchedule(agentId, frequency) {
    const client = await pool.connect();
    try {
        const now = new Date();
        let nextRunAt = new Date();

        // Calculate next_run_at based on frequency
        switch (frequency) {
            case 'auto':
                // Auto runs every 6 hours
                nextRunAt.setHours(nextRunAt.getHours() + 6);
                break;

            case 'daily':
                // Daily runs once per day
                nextRunAt.setDate(nextRunAt.getDate() + 1);
                break;

            case 'weekly':
                // Weekly runs once per week
                nextRunAt.setDate(nextRunAt.getDate() + 7);
                break;

            default:
                console.warn(`[Scheduler] Unknown frequency: ${frequency}`);
                // Default to daily
                nextRunAt.setDate(nextRunAt.getDate() + 1);
                break;
        }

        await client.query(`
            UPDATE agents
            SET last_run_at = $1, next_run_at = $2, updated_at = $1
            WHERE id = $3
        `, [now, nextRunAt, agentId]);

        console.log(`[Scheduler] Updated agent ${agentId} schedule: next run at ${nextRunAt.toISOString()}`);
    } catch (error) {
        console.error(`[Scheduler] Error updating agent schedule for ${agentId}:`, error);
    } finally {
        client.release();
    }
}


/**
 * Check for users that should have Brain cycles run and execute them
 */
async function checkAndRunBrainCycles() {
    const client = await pool.connect();
    try {
        // Get all users with document store (meaning they're set up for Brain)
        const result = await client.query(
            `SELECT DISTINCT u.id, u.email, u.name
             FROM users u
             INNER JOIN document_store ds ON u.id = ds.user_id
             ORDER BY u.id`
        );

        const users = result.rows;
        console.log(`[Scheduler] Found ${users.length} users eligible for Brain cycles`);

        for (const user of users) {
            try {
                const shouldRun = await shouldBrainCycleRun(user.id);

                if (shouldRun) {
                    console.log(`[Scheduler] Triggering Brain cycle for user: ${user.email} (ID: ${user.id})`);

                    // Run Brain cycle asynchronously (don't await to prevent blocking)
                    runBrainCycle(user.id).catch((error) => {
                        console.error(`[Scheduler] Error running Brain cycle for user ${user.id}:`, error);
                    });
                }
            } catch (error) {
                console.error(`[Scheduler] Error processing Brain cycle for user ${user.id}:`, error);
            }
        }
    } catch (error) {
        console.error('[Scheduler] Error checking Brain cycles:', error);
    } finally {
        client.release();
    }
}

/**
 * Determine if a Brain cycle should run for a user
 * @param {number} userId - User ID
 * @returns {Promise<boolean>} Whether the Brain should run
 */
async function shouldBrainCycleRun(userId) {
    try {
        // Get last Brain decision
        const lastDecision = await getLastBrainDecision(userId);

        // If never run before, run it
        if (!lastDecision) {
            console.log(`[Scheduler] Brain has never run for user ${userId}`);
            return true;
        }

        // Check if enough time has passed (default: 24 hours)
        const now = Date.now();
        const lastRunTime = new Date(lastDecision.created_at).getTime();
        const timeSinceLastRun = now - lastRunTime;

        // Run once per day (24 hours)
        const shouldRun = timeSinceLastRun >= 24 * 60 * 60 * 1000;

        if (shouldRun) {
            console.log(`[Scheduler] Brain cycle is due for user ${userId} (last run: ${(timeSinceLastRun / 1000 / 60 / 60).toFixed(1)} hours ago)`);
        }

        return shouldRun;
    } catch (error) {
        console.error(`[Scheduler] Error checking if Brain should run for user ${userId}:`, error);
        return false;
    }
}

module.exports = {
    startScheduler,
    stopScheduler,
    checkAndRunScheduledAgents,
    updateAgentSchedule,
    checkAndRunBrainCycles,
};
