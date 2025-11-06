/**
 * Routine Executor Service
 * Executes scheduled routines via their owning agents with session persistence
 * Routines are scheduled tasks that run on a frequency (daily, weekly, auto)
 */

const { executeTask } = require('./claude-agent');
const {
    getAgentById,
    getRoutineById,
    createModuleExecution,
    updateModuleExecution,
    updateRoutine,
    saveExecutionLog,
    getServiceConnectionsByUserId,
    updateAgentSession,
    incrementAgentRoutineRuns,
} = require('../db');
const { getGitHubToken, getGmailToken, getSlackTokens, getSentryToken, getAppStoreConnectConnection, getMetaAdsConnection, getRenderApiKey, getRenderConnection } = require('../db');
const { decryptToken } = require('../utils/encryption');
const { setupGmailMCPCredentials, cleanupGmailMCPCredentials } = require('./gmail-mcp-setup');
const path = require('path');

/**
 * Execute a routine via its owning agent
 * @param {number} routineId - Routine ID
 * @param {number} userId - User ID
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Execution result
 */
async function runRoutine(routineId, userId, options = {}) {
    const startTime = Date.now();
    let executionRecord = null;
    let mcpMounts = [];

    console.log(`[Routine Executor] Starting routine ${routineId} for user ${userId}`);

    try {
        // 1. Load routine configuration
        const routine = await getRoutineById(routineId, userId);
        if (!routine) {
            throw new Error(`Routine ${routineId} not found for user ${userId}`);
        }

        console.log(`[Routine Executor] Routine found: ${routine.name} (${routine.type})`);

        // Check routine status
        if (routine.status !== 'active') {
            throw new Error(`Routine ${routine.name} is not active (status: ${routine.status})`);
        }

        // 2. Load owning agent
        const agent = await getAgentById(routine.agent_id, userId);
        if (!agent) {
            throw new Error(`Agent ${routine.agent_id} (owner of routine) not found`);
        }

        console.log(`[Routine Executor] Owning agent: ${agent.name} (${agent.agent_type})`);

        // Check agent status
        if (agent.status !== 'active') {
            throw new Error(`Agent ${agent.name} is not active (status: ${agent.status})`);
        }

        // 3. Create execution record (linked to routine)
        executionRecord = await createModuleExecution(null, userId, {
            routine_id: routineId,
            is_routine_execution: true,
            trigger_type: 'scheduled',
            status: 'running',
        });

        console.log(`[Routine Executor] Execution record created: ${executionRecord.id}`);

        // Log start
        await saveExecutionLog(executionRecord.id, {
            log_level: 'info',
            stage: 'started',
            message: `Routine "${routine.name}" starting via agent ${agent.name}`,
            metadata: { routine_id: routineId, agent_id: agent.id },
        });

        // 4. Build routine-specific prompt
        const prompt = await buildRoutinePrompt(agent, routine, userId);
        console.log(`[Routine Executor] Built routine prompt (${prompt.length} chars)`);

        // 5. Configure MCP servers based on routine config
        const config = routine.config || {};
        mcpMounts = config.mcpMounts || agent.config?.mcpMounts || [];
        const mcpServers = await configureMCPServersForRoutine(agent, routine, userId, config, mcpMounts);

        console.log(`[Routine Executor] Configured ${Object.keys(mcpServers).length} MCP servers: ${Object.keys(mcpServers).join(', ')}`);

        // 6. Setup Gmail credentials if needed
        if (mcpMounts.includes('gmail')) {
            await setupGmailMCPCredentials(userId);
        }

        // 7. Setup persistent workspace for agent (shared across routines and tasks)
        let workspace = agent.workspace_path;
        if (!workspace) {
            workspace = path.join(process.cwd(), 'temp', 'agent-sessions', `agent-${agent.id}`);
        }
        console.log(`[Routine Executor] Workspace: ${workspace}`);

        // 8. Load agent's session ID for session resumption
        const resumeSessionId = agent.session_id || null;
        if (resumeSessionId) {
            console.log(`[Routine Executor] 📂 Resuming agent session: ${resumeSessionId.substring(0, 8)}...`);
        } else {
            console.log(`[Routine Executor] 🆕 Starting new session for agent`);
        }

        // 9. Execute routine using Claude Agent SDK with session resumption
        console.log(`[Routine Executor] 🤖 Starting AI execution...`);

        const result = await executeTask(prompt, {
            cwd: workspace,
            resumeSessionId: resumeSessionId, // ✅ Session persistence across routines and tasks!
            maxTurns: config.maxTurns || agent.config?.maxTurns || 100,
            mcpServers: mcpServers,
            onProgress: async (progress) => {
                let logMessage = '';
                let logLevel = 'info';
                let stage = progress.stage || null;

                if (progress.stage === 'thinking') {
                    logMessage = progress.message || 'AI thinking...';
                    console.log(`[Routine Executor] 💭 AI thinking: ${progress.message || ''}`);
                } else if (progress.stage === 'tool_use') {
                    logMessage = `Using tool: ${progress.tool}`;
                    stage = 'tool_use';
                    console.log(`[Routine Executor] 🔧 Using tool: ${progress.tool} (turn ${progress.turnCount || '?'})`);
                } else if (progress.stage === 'initialized') {
                    logMessage = `Session initialized with model: ${progress.model}`;
                    stage = 'initialized';
                    console.log(`[Routine Executor] ✓ Session initialized with model: ${progress.model}`);
                } else if (progress.stage) {
                    logMessage = `Stage: ${progress.stage}${progress.substage ? `/${progress.substage}` : ''}`;
                    console.log(`[Routine Executor] 📊 Stage: ${progress.stage}${progress.substage ? `/${progress.substage}` : ''}`);
                }

                // Save log to database (non-blocking)
                if (logMessage && executionRecord) {
                    saveExecutionLog(executionRecord.id, {
                        log_level: logLevel,
                        stage: stage,
                        message: logMessage,
                        metadata: {
                            tool: progress.tool,
                            turnCount: progress.turnCount,
                            model: progress.model,
                            substage: progress.substage,
                            routine_id: routineId,
                            agent_id: agent.id,
                        },
                    }).catch(err => {
                        console.error('[Routine Executor] Failed to save log to database:', err.message);
                    });
                }
            },
        });

        console.log(`[Routine Executor] ✓ AI execution completed. Success: ${result.success}`);

        // Cleanup Gmail MCP credentials if they were used
        if (mcpMounts.includes('gmail')) {
            await cleanupGmailMCPCredentials();
        }

        // Save agent session ID for continuity across executions
        const newSessionId = result.metadata?.session_id;
        if (newSessionId && !resumeSessionId) {
            // First-time session creation
            await updateAgentSession(agent.id, newSessionId, workspace);
            console.log(`[Routine Executor] 💾 Saved new session ID for agent: ${newSessionId.substring(0, 8)}...`);
        } else if (newSessionId && newSessionId !== resumeSessionId) {
            // Session ID changed (shouldn't normally happen, but handle it)
            await updateAgentSession(agent.id, newSessionId, workspace);
            console.log(`[Routine Executor] 💾 Updated session ID for agent: ${newSessionId.substring(0, 8)}...`);
        }

        // 10. Update execution record with results
        const duration = Date.now() - startTime;
        const cost = result.metadata?.cost_usd || 0;

        console.log(`[Routine Executor] 📊 Execution stats:`);
        console.log(`   - Duration: ${(duration / 1000).toFixed(2)}s`);
        console.log(`   - Cost: $${cost.toFixed(4)}`);
        console.log(`   - Turns: ${result.metadata?.num_turns || 'N/A'}`);
        console.log(`   - Status: ${result.success ? '✓ completed' : '✗ failed'}`);

        await updateModuleExecution(executionRecord.id, {
            status: result.success ? 'completed' : 'failed',
            completed_at: new Date(),
            duration_ms: duration,
            cost_usd: cost,
            metadata: {
                turns: result.metadata?.num_turns,
                messages_count: result.metadata?.messages_count,
                model: result.metadata?.model,
                routine_id: routineId,
                agent_id: agent.id,
                routine_name: routine.name,
                agent_name: agent.name,
            },
        });

        // 11. Update routine timing and increment agent statistics
        if (result.success) {
            // Calculate next run time based on frequency
            const nextRunAt = calculateNextRunTime(routine.frequency);

            await updateRoutine(routineId, userId, {
                last_run_at: new Date(),
                next_run_at: nextRunAt,
            });

            // Increment agent's routine run counter
            await incrementAgentRoutineRuns(agent.id);

            await saveExecutionLog(executionRecord.id, {
                log_level: 'info',
                stage: 'completed',
                message: `✅ Routine completed: ${routine.name}`,
            });

            console.log(`[Routine Executor] ✅ Routine ${routineId} marked as completed`);
            console.log(`[Routine Executor] ⏰ Next run scheduled for: ${nextRunAt ? nextRunAt.toISOString() : 'manual only'}`);
        } else {
            // Still update last_run_at but don't schedule next run on failure
            await updateRoutine(routineId, userId, {
                last_run_at: new Date(),
            });

            await saveExecutionLog(executionRecord.id, {
                log_level: 'error',
                stage: 'failed',
                message: `❌ Routine failed: ${routine.name} - ${result.error || 'Unknown error'}`,
            });

            console.error(`[Routine Executor] ❌ Routine ${routineId} failed: ${result.error || 'Unknown error'}`);
        }

        return {
            success: result.success,
            routine_id: routineId,
            agent_id: agent.id,
            execution_id: executionRecord.id,
            duration_ms: duration,
            cost_usd: cost,
            output: result.output,
            metadata: result.metadata,
        };

    } catch (error) {
        console.error(`[Routine Executor] Error executing routine:`, error);

        // Update execution record with error
        if (executionRecord) {
            await updateModuleExecution(executionRecord.id, {
                status: 'failed',
                completed_at: new Date(),
                duration_ms: Date.now() - startTime,
                error_message: error.message,
            });

            await saveExecutionLog(executionRecord.id, {
                log_level: 'error',
                stage: 'failed',
                message: `❌ Routine execution failed: ${error.message}`,
            });
        }

        // Cleanup Gmail credentials if they were set up
        if (mcpMounts.includes('gmail')) {
            await cleanupGmailMCPCredentials().catch(err => {
                console.error('[Routine Executor] Failed to cleanup Gmail credentials:', err);
            });
        }

        throw error;
    }
}

/**
 * Build routine-specific prompt
 */
async function buildRoutinePrompt(agent, routine, userId) {
    const config = routine.config || {};
    const goal = config.goal || routine.description || `Execute routine: ${routine.name}`;

    // Get current date/time for context
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
    const timeStr = now.toLocaleTimeString('en-US');

    let prompt = `${agent.role}\n\n`;
    prompt += `## Current Routine\n\n`;
    prompt += `**Routine:** ${routine.name}\n`;
    prompt += `**Type:** ${routine.type}\n`;
    prompt += `**Description:** ${routine.description || 'N/A'}\n`;
    prompt += `**Frequency:** ${routine.frequency}\n\n`;
    prompt += `## Goal\n\n${goal}\n\n`;
    prompt += `## Context\n\n`;
    prompt += `**Today's Date:** ${dateStr}\n`;
    prompt += `**Current Time:** ${timeStr}\n\n`;

    if (config.guardrails) {
        prompt += `## Guardrails\n\n${config.guardrails}\n\n`;
    }

    prompt += `## Instructions\n\n`;
    prompt += `Execute this routine as defined. You have access to the tools mounted via MCP servers. `;
    prompt += `This is a scheduled routine that runs automatically. Provide a summary of what you accomplished.\n`;

    return prompt;
}

/**
 * Configure MCP servers for routine execution
 */
async function configureMCPServersForRoutine(agent, routine, userId, config, mcpMounts) {
    const mcpServers = {};

    // Use agent's MCP config merged with routine-specific config
    const agentMcpConfig = agent.config?.mcpConfig || {};
    const routineMcpConfig = config.mcpConfig || {};
    const mergedMcpConfig = { ...agentMcpConfig, ...routineMcpConfig };

    for (const mount of mcpMounts) {
        if (mount === 'github') {
            const githubConfig = mergedMcpConfig.github || {};
            const githubToken = await getGitHubToken(userId);
            if (!githubToken) {
                console.warn('[Routine Executor] GitHub MCP mount requested but no token found');
                continue;
            }
            const decryptedToken = decryptToken(githubToken);

            mcpServers.github = {
                command: 'npx',
                args: ['-y', '@modelcontextprotocol/server-github'],
                env: {
                    GITHUB_PERSONAL_ACCESS_TOKEN: decryptedToken,
                },
            };
        } else if (mount === 'gmail') {
            mcpServers.gmail = {
                command: 'npx',
                args: ['-y', '@gongrzhe/server-gmail-autoauth-mcp'],
            };
        } else if (mount === 'tasks') {
            const serverPath = path.join(process.cwd(), 'services', 'task-management-mcp-server.js');
            mcpServers.tasks = {
                command: 'node',
                args: [serverPath],
                env: {
                    USER_ID: userId.toString(),
                },
            };
        } else if (mount === 'reports') {
            const serverPath = path.join(process.cwd(), 'services', 'reports-custom-mcp-server.js');
            mcpServers.reports = {
                command: 'node',
                args: [serverPath],
                env: {
                    USER_ID: userId.toString(),
                },
            };
        } else if (mount === 'capabilities') {
            const serverPath = path.join(process.cwd(), 'services', 'capabilities-custom-mcp-server.js');
            mcpServers.capabilities = {
                command: 'node',
                args: [serverPath],
                env: {
                    USER_ID: userId.toString(),
                },
            };
        } else if (mount === 'render') {
            const renderConnection = await getRenderConnection(userId);
            if (!renderConnection) {
                console.warn('[Routine Executor] Render MCP mount requested but no connection found');
                continue;
            }
            const renderApiKey = decryptToken(renderConnection.api_key);

            mcpServers.render = {
                type: 'http',
                url: 'https://mcp.render.com/mcp',
                headers: {
                    'Authorization': `Bearer ${renderApiKey}`,
                },
            };
        }
    }

    return mcpServers;
}

/**
 * Calculate next run time based on frequency
 */
function calculateNextRunTime(frequency) {
    const now = new Date();

    switch (frequency) {
        case 'auto':
            // Run every 6 hours
            return new Date(now.getTime() + 6 * 60 * 60 * 1000);
        case 'daily':
            // Run once per day (24 hours from now)
            return new Date(now.getTime() + 24 * 60 * 60 * 1000);
        case 'weekly':
            // Run once per week (7 days from now)
            return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        case 'manual':
            // Don't schedule next run
            return null;
        default:
            // Unknown frequency, don't schedule
            return null;
    }
}

module.exports = {
    runRoutine,
};
