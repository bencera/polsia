/**
 * Module Scheduler Service
 * Checks for modules that need to run and triggers their execution
 */

const cron = require('node-cron');
const { getActiveModulesForScheduling, getModuleExecutions, pool } = require('../db');
const { runModule } = require('./agent-runner');
const { runBrainCycle, getLastBrainDecision } = require('./brain-orchestrator');

// Track scheduled tasks
const scheduledTasks = new Map();

/**
 * Start the module scheduler
 * Checks every hour for modules that need to run
 * Checks daily for Brain cycles
 */
function startScheduler() {
    console.log('[Scheduler] Starting module scheduler');

    // Run module checks every hour
    const moduleTask = cron.schedule('0 * * * *', async () => {
        console.log('[Scheduler] Checking for modules to execute');
        await checkAndRunModules();
    });

    scheduledTasks.set('modules', moduleTask);

    // Run Brain cycle checks once per day at 9 AM
    const brainTask = cron.schedule('0 9 * * *', async () => {
        console.log('[Scheduler] Checking for Brain cycles to execute');
        await checkAndRunBrainCycles();
    });

    scheduledTasks.set('brain', brainTask);

    // Also run immediately on startup
    setImmediate(async () => {
        console.log('[Scheduler] Running initial module check');
        await checkAndRunModules();
    });

    console.log('[Scheduler] Scheduler started successfully');
}

/**
 * Stop the scheduler
 */
function stopScheduler() {
    console.log('[Scheduler] Stopping scheduler');
    for (const [name, task] of scheduledTasks.entries()) {
        task.stop();
        scheduledTasks.delete(name);
    }
}

/**
 * Check for modules that should run and execute them
 */
async function checkAndRunModules() {
    try {
        const modules = await getActiveModulesForScheduling();

        console.log(`[Scheduler] Found ${modules.length} active modules`);

        for (const module of modules) {
            try {
                const shouldRun = await shouldModuleRun(module);

                if (shouldRun) {
                    console.log(`[Scheduler] Triggering module: ${module.name} (ID: ${module.id})`);

                    // Run module asynchronously (don't await to prevent blocking)
                    runModule(module.id, module.user_id, {
                        trigger_type: 'scheduled',
                    }).catch((error) => {
                        console.error(`[Scheduler] Error running module ${module.id}:`, error);
                    });
                }
            } catch (error) {
                console.error(`[Scheduler] Error processing module ${module.id}:`, error);
            }
        }
    } catch (error) {
        console.error('[Scheduler] Error checking modules:', error);
    }
}

/**
 * Determine if a module should run based on its frequency and last execution
 * @param {Object} module - Module configuration
 * @returns {Promise<boolean>} Whether the module should run
 */
async function shouldModuleRun(module) {
    const { frequency, id, user_id } = module;

    // Manual modules don't run on schedule
    if (frequency === 'manual') {
        return false;
    }

    // Get last execution
    const executions = await getModuleExecutions(id, user_id, 1);
    const lastExecution = executions[0];

    // If never run before, run it
    if (!lastExecution) {
        console.log(`[Scheduler] Module ${id} has never run before`);
        return true;
    }

    // Check if enough time has passed based on frequency
    const now = Date.now();
    const lastRunTime = new Date(lastExecution.created_at).getTime();
    const timeSinceLastRun = now - lastRunTime;

    let shouldRun = false;

    switch (frequency) {
        case 'auto':
            // Auto runs every 6 hours
            shouldRun = timeSinceLastRun >= 6 * 60 * 60 * 1000;
            break;

        case 'daily':
            // Daily runs once per day
            shouldRun = timeSinceLastRun >= 24 * 60 * 60 * 1000;
            break;

        case 'weekly':
            // Weekly runs once per week
            shouldRun = timeSinceLastRun >= 7 * 24 * 60 * 60 * 1000;
            break;

        default:
            console.warn(`[Scheduler] Unknown frequency: ${frequency}`);
            break;
    }

    if (shouldRun) {
        console.log(`[Scheduler] Module ${id} is due to run (last run: ${timeSinceLastRun / 1000}s ago)`);
    }

    return shouldRun;
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
    checkAndRunModules,
    checkAndRunBrainCycles,
};
