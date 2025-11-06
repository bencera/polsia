/**
 * Scheduler Service
 * Checks for modules and routines that need to run and triggers their execution
 * Routines are executed via their owning agents with session persistence
 */

const cron = require('node-cron');
const { getActiveModulesForScheduling, getModuleExecutions, getRoutinesDueForExecution, pool } = require('../db');
const { runModule } = require('./agent-runner');
const { runRoutine } = require('./routine-executor');
const { runBrainCycle, getLastBrainDecision } = require('./brain-orchestrator');
const { startTaskAssignmentListener, stopTaskAssignmentListener } = require('./task-assignment-listener');

// Track scheduled tasks
const scheduledTasks = new Map();

/**
 * Start the scheduler
 * Checks every hour for modules and routines that need to run
 * Checks daily for Brain cycles
 * Starts task assignment listener for real-time agent execution
 */
function startScheduler() {
    console.log('[Scheduler] Starting scheduler (modules + routines)');

    // Run module checks every hour (legacy support during migration)
    const moduleTask = cron.schedule('0 * * * *', async () => {
        console.log('[Scheduler] Checking for modules to execute');
        await checkAndRunModules();
    });

    scheduledTasks.set('modules', moduleTask);

    // Run routine checks every hour
    const routineTask = cron.schedule('0 * * * *', async () => {
        console.log('[Scheduler] Checking for routines to execute');
        await checkAndRunRoutines();
    });

    scheduledTasks.set('routines', routineTask);

    // Run Brain cycle checks once per day at 9 AM
    const brainTask = cron.schedule('0 9 * * *', async () => {
        console.log('[Scheduler] Checking for Brain cycles to execute');
        await checkAndRunBrainCycles();
    });

    scheduledTasks.set('brain', brainTask);

    // Start task assignment listener for real-time agent execution
    console.log('[Scheduler] Starting task assignment listener for agents');
    startTaskAssignmentListener();

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
 * Check for routines that should run and execute them via their owning agents
 */
async function checkAndRunRoutines() {
    try {
        const routines = await getRoutinesDueForExecution();

        console.log(`[Scheduler] Found ${routines.length} routines due for execution`);

        for (const routine of routines) {
            try {
                console.log(`[Scheduler] Triggering routine: ${routine.name} (ID: ${routine.id}) via agent ${routine.agent_name || routine.agent_id}`);

                // Run routine asynchronously via agent (don't await to prevent blocking)
                runRoutine(routine.id, routine.user_id, {
                    trigger_type: 'scheduled',
                }).catch((error) => {
                    console.error(`[Scheduler] Error running routine ${routine.id}:`, error);
                });
            } catch (error) {
                console.error(`[Scheduler] Error processing routine ${routine.id}:`, error);
            }
        }
    } catch (error) {
        console.error('[Scheduler] Error checking routines:', error);
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
    checkAndRunModules,
    checkAndRunBrainCycles,
};
