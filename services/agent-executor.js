/**
 * Agent Executor Service
 * Executes task-driven AI agents with dynamic prompts based on assigned tasks
 * Agents are triggered by task assignments (not schedules) and execute specific work
 */

const { executeTask } = require('./claude-agent');
const {
    getAgentById,
    getTaskById,
    updateTaskStatus,
    createModuleExecution,
    updateModuleExecution,
    saveExecutionLog,
    getServiceConnectionsByUserId,
    updateAgentSession,
    incrementAgentTaskCompletions,
} = require('../db');
const { getGitHubToken, getGmailToken, getSlackTokens, getSentryToken, getAppStoreConnectConnection, getMetaAdsConnection, getRenderApiKey, getRenderConnection } = require('../db');
const { decryptToken } = require('../utils/encryption');
const { setupGmailMCPCredentials, cleanupGmailMCPCredentials } = require('./gmail-mcp-setup');
const path = require('path');
const crypto = require('crypto');

/**
 * Execute an agent with a specific task
 * @param {number} agentId - Agent ID
 * @param {number} taskId - Task ID to execute
 * @param {number} userId - User ID
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Execution result
 */
async function runAgentWithTask(agentId, taskId, userId, options = {}) {
    const startTime = Date.now();
    let executionRecord = null;
    let mcpMounts = [];

    console.log(`[Agent Executor] Starting agent ${agentId} with task ${taskId} for user ${userId}`);

    try {
        // 1. Load agent configuration
        const agent = await getAgentById(agentId, userId);
        if (!agent) {
            throw new Error(`Agent ${agentId} not found for user ${userId}`);
        }

        console.log(`[Agent Executor] Agent found: ${agent.name} (${agent.agent_type})`);

        // Check agent status
        if (agent.status !== 'active') {
            throw new Error(`Agent ${agent.name} is not active (status: ${agent.status})`);
        }

        // 2. Load task details
        const task = await getTaskById(taskId, userId);
        if (!task) {
            throw new Error(`Task ${taskId} not found for user ${userId}`);
        }

        console.log(`[Agent Executor] Task found: ${task.title} (status: ${task.status})`);

        // Verify task is assigned to this agent
        if (task.assigned_to_agent_id !== agentId) {
            throw new Error(`Task ${taskId} is not assigned to agent ${agentId}`);
        }

        // Verify task is in approved status (ready for execution)
        if (task.status !== 'approved') {
            throw new Error(`Task ${taskId} is not approved (status: ${task.status}). Cannot execute.`);
        }

        // 3. Update task status to in_progress
        await updateTaskStatus(taskId, 'in_progress', {
            changed_by: agent.name,
            started_at: new Date(),
        });

        console.log(`[Agent Executor] Task status updated to in_progress`);

        // 4. Create execution record (linked to task)
        executionRecord = await createModuleExecution(null, userId, {
            trigger_type: 'task_assignment',
            status: 'running',
        });

        // Link execution to task
        await updateTaskStatus(taskId, 'in_progress', {
            execution_id: executionRecord.id,
        });

        console.log(`[Agent Executor] Execution record created: ${executionRecord.id}`);

        // Log start
        await saveExecutionLog(executionRecord.id, {
            log_level: 'info',
            stage: 'started',
            message: `Agent ${agent.name} starting task: ${task.title}`,
            metadata: { agent_id: agentId, task_id: taskId },
        });

        // 5. Build task-specific prompt
        const prompt = await buildAgentPrompt(agent, task, userId);
        console.log(`[Agent Executor] Built task-specific prompt (${prompt.length} chars)`);

        // 6. Configure MCP servers based on agent config
        const config = agent.config || {};
        mcpMounts = config.mcpMounts || [];
        const mcpServers = await configureMCPServersForAgent(agent, userId, config, mcpMounts);

        console.log(`[Agent Executor] Configured ${Object.keys(mcpServers).length} MCP servers: ${Object.keys(mcpServers).join(', ')}`);

        // 7. Setup Gmail credentials if needed
        if (mcpMounts.includes('gmail')) {
            await setupGmailMCPCredentials(userId);
        }

        // 8. Setup persistent workspace for agent (not task-specific)
        // Use agent's existing workspace or create new one
        let workspace = agent.workspace_path;
        if (!workspace) {
            workspace = path.join(process.cwd(), 'temp', 'agent-sessions', `agent-${agentId}`);
        }
        console.log(`[Agent Executor] Workspace: ${workspace}`);

        // 9. Load agent's session ID for session resumption
        const resumeSessionId = agent.session_id || null;
        if (resumeSessionId) {
            console.log(`[Agent Executor] 📂 Resuming agent session: ${resumeSessionId.substring(0, 8)}...`);
        } else {
            console.log(`[Agent Executor] 🆕 Starting new session for agent`);
        }

        // 10. Execute task using Claude Agent SDK with session resumption
        console.log(`[Agent Executor] 🤖 Starting AI execution...`);

        const result = await executeTask(prompt, {
            cwd: workspace,
            resumeSessionId: resumeSessionId, // ✅ Session persistence!
            maxTurns: config.maxTurns || 100,
            mcpServers: mcpServers,
            onProgress: async (progress) => {
                let logMessage = '';
                let logLevel = 'info';
                let stage = progress.stage || null;

                if (progress.stage === 'thinking') {
                    logMessage = progress.message || 'AI thinking...';
                    console.log(`[Agent Executor] 💭 AI thinking: ${progress.message || ''}`);
                } else if (progress.stage === 'tool_use') {
                    logMessage = `Using tool: ${progress.tool}`;
                    stage = 'tool_use';
                    console.log(`[Agent Executor] 🔧 Using tool: ${progress.tool} (turn ${progress.turnCount || '?'})`);
                } else if (progress.stage === 'initialized') {
                    logMessage = `Session initialized with model: ${progress.model}`;
                    stage = 'initialized';
                    console.log(`[Agent Executor] ✓ Session initialized with model: ${progress.model}`);
                } else if (progress.stage) {
                    logMessage = `Stage: ${progress.stage}${progress.substage ? `/${progress.substage}` : ''}`;
                    console.log(`[Agent Executor] 📊 Stage: ${progress.stage}${progress.substage ? `/${progress.substage}` : ''}`);
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
                            agent_id: agentId,
                            task_id: taskId,
                        },
                    }).catch(err => {
                        console.error('[Agent Executor] Failed to save log to database:', err.message);
                    });
                }
            },
        });

        console.log(`[Agent Executor] ✓ AI execution completed. Success: ${result.success}`);

        // Cleanup Gmail MCP credentials if they were used
        if (mcpMounts.includes('gmail')) {
            await cleanupGmailMCPCredentials();
        }

        // Save agent session ID for continuity across executions
        const newSessionId = result.metadata?.session_id;
        if (newSessionId && !resumeSessionId) {
            // First-time session creation
            await updateAgentSession(agentId, newSessionId, workspace);
            console.log(`[Agent Executor] 💾 Saved new session ID for agent: ${newSessionId.substring(0, 8)}...`);
        } else if (newSessionId && newSessionId !== resumeSessionId) {
            // Session ID changed (shouldn't normally happen, but handle it)
            await updateAgentSession(agentId, newSessionId, workspace);
            console.log(`[Agent Executor] 💾 Updated session ID for agent: ${newSessionId.substring(0, 8)}...`);
        }

        // 10. Update execution record with results
        const duration = Date.now() - startTime;
        const cost = result.metadata?.cost_usd || 0;

        console.log(`[Agent Executor] 📊 Execution stats:`);
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
                agent_id: agentId,
                task_id: taskId,
                agent_name: agent.name,
                task_title: task.title,
            },
        });

        // 11. Update task status based on execution result
        if (result.success) {
            // Extract completion summary from agent's final output
            const completionSummary = result.output || 'Task completed successfully by agent';

            await updateTaskStatus(taskId, 'completed', {
                changed_by: agent.name,
                completion_summary: completionSummary,
                completed_at: new Date(),
            });

            // Increment agent's task completion counter
            await incrementAgentTaskCompletions(agentId);

            await saveExecutionLog(executionRecord.id, {
                log_level: 'info',
                stage: 'completed',
                message: `✅ Task completed: ${task.title}`,
            });

            console.log(`[Agent Executor] ✅ Task ${taskId} marked as completed`);
        } else {
            // Mark task as failed with error message
            const errorMessage = result.error || 'Agent execution failed';

            await updateTaskStatus(taskId, 'failed', {
                changed_by: agent.name,
                completion_summary: `Failed: ${errorMessage}`,
            });

            await saveExecutionLog(executionRecord.id, {
                log_level: 'error',
                stage: 'failed',
                message: `❌ Task failed: ${task.title} - ${errorMessage}`,
            });

            console.error(`[Agent Executor] ❌ Task ${taskId} marked as failed: ${errorMessage}`);
        }

        return {
            success: result.success,
            agent_id: agentId,
            task_id: taskId,
            execution_id: executionRecord.id,
            duration_ms: duration,
            cost_usd: cost,
            output: result.output,
            metadata: result.metadata,
        };

    } catch (error) {
        console.error(`[Agent Executor] Error executing agent:`, error);

        // Update execution record as failed
        if (executionRecord) {
            const duration = Date.now() - startTime;
            await updateModuleExecution(executionRecord.id, {
                status: 'failed',
                completed_at: new Date(),
                duration_ms: duration,
                error_message: error.message,
            });

            await saveExecutionLog(executionRecord.id, {
                log_level: 'error',
                stage: 'failed',
                message: `Error: ${error.message}`,
                metadata: { agent_id: agentId, task_id: taskId },
            });
        }

        // Update task status as failed
        if (taskId) {
            try {
                await updateTaskStatus(taskId, 'failed', {
                    changed_by: 'system',
                    completion_summary: `Failed: ${error.message}`,
                });
            } catch (taskUpdateErr) {
                console.error(`[Agent Executor] Failed to update task status:`, taskUpdateErr);
            }
        }

        // Cleanup Gmail credentials if needed
        if (mcpMounts.includes('gmail')) {
            await cleanupGmailMCPCredentials().catch(err => {
                console.error('[Agent Executor] Error cleaning up Gmail credentials:', err);
            });
        }

        throw error;
    }
}

/**
 * Build dynamic prompt combining agent role + task details
 * @param {Object} agent - Agent configuration
 * @param {Object} task - Task details
 * @param {number} userId - User ID
 * @returns {Promise<string>} Task-specific prompt
 */
async function buildAgentPrompt(agent, task, userId) {
    const currentDate = new Date();
    const formattedDate = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD
    const fullDateString = currentDate.toDateString(); // e.g., "Tue Nov 05 2025"

    // Build prompt structure
    const prompt = `${agent.role}

## Current Task Assignment

You have been assigned a specific task to complete. Review the details below and execute the task using your available tools.

### Task Information
- **Task ID:** ${task.id}
- **Title:** ${task.title}
- **Priority:** ${task.priority || 'medium'}
- **Status:** ${task.status}

### What to Do
${task.description || 'No detailed description provided.'}

### Why This Matters
${task.suggestion_reasoning || 'No reasoning provided.'}

${task.approval_reasoning ? `### CEO Approval Reasoning\n${task.approval_reasoning}\n` : ''}

${task.blocked_reason ? `### Previous Blocker\n${task.blocked_reason}\n` : ''}

## Current Date & Time

**Today's date:** ${fullDateString} (${formattedDate})
**Current time:** ${currentDate.toISOString()}

When working with time-sensitive data, use the date **${formattedDate}** in your queries.

## Your Mission

Execute this task using your available MCP tools. When you complete the task:

1. **Provide a comprehensive summary** of what you accomplished
2. **Include relevant details**: PRs created, files modified, metrics changed, etc.
3. **Note any issues** or limitations encountered
4. **Suggest follow-up work** if applicable

Your summary will be saved as the task completion record.

## Important Guidelines

- Focus on **completing this specific task** - don't deviate to other work
- Use your tools efficiently and purposefully
- If you encounter blockers, document them clearly
- Provide evidence of your work (links, screenshots, metrics)
- Write clear, actionable completion summaries

Let's get started! 🚀`;

    return prompt.trim();
}

/**
 * Configure MCP servers for agent execution
 * @param {Object} agent - Agent configuration
 * @param {number} userId - User ID
 * @param {Object} config - Agent config JSON
 * @param {Array} mcpMounts - List of MCP mounts
 * @returns {Promise<Object>} MCP servers configuration
 */
async function configureMCPServersForAgent(agent, userId, config, mcpMounts) {
    const mcpServers = {};

    // Reuse the same MCP configuration logic from agent-runner.js
    // This is essentially the same as configureMCPServers() but standalone

    for (const mcpName of mcpMounts) {
        if (mcpName === 'github') {
            const encryptedToken = await getGitHubToken(userId);
            if (encryptedToken) {
                const token = decryptToken(encryptedToken);
                mcpServers.github = {
                    command: 'npx',
                    args: ['-y', '@modelcontextprotocol/server-github'],
                    env: {
                        GITHUB_PERSONAL_ACCESS_TOKEN: token,
                    },
                };
                console.log('[Agent Executor] Configured GitHub MCP server');
            } else {
                console.warn('[Agent Executor] GitHub MCP requested but user has no GitHub connection');
            }
        } else if (mcpName === 'gmail') {
            const encryptedTokens = await getGmailToken(userId);
            if (encryptedTokens) {
                mcpServers.gmail = {
                    command: 'npx',
                    args: ['-y', '@gongrzhe/server-gmail-autoauth-mcp'],
                };
                console.log('[Agent Executor] Configured Gmail MCP server');
            } else {
                console.warn('[Agent Executor] Gmail MCP requested but user has no Gmail connection');
            }
        } else if (mcpName === 'slack') {
            const tokens = await getSlackTokens(userId);
            if (tokens) {
                const botToken = decryptToken(tokens.bot);
                const userToken = tokens.user ? decryptToken(tokens.user) : null;
                const serverPath = path.join(__dirname, 'slack-custom-mcp-server.js');
                const env = { SLACK_BOT_TOKEN: botToken };
                if (userToken) env.SLACK_USER_TOKEN = userToken;

                mcpServers.slack = {
                    command: 'node',
                    args: [serverPath],
                    env: env,
                };
                console.log('[Agent Executor] Configured Slack MCP server');
            } else {
                console.warn('[Agent Executor] Slack MCP requested but user has no Slack connection');
            }
        } else if (mcpName === 'sentry') {
            const encryptedToken = await getSentryToken(userId);
            if (encryptedToken) {
                const token = decryptToken(encryptedToken);
                const serverPath = path.join(__dirname, 'sentry-custom-mcp-server.js');
                mcpServers.sentry = {
                    command: 'node',
                    args: [serverPath],
                    env: { SENTRY_ACCESS_TOKEN: token },
                };
                console.log('[Agent Executor] Configured Sentry MCP server');
            } else {
                console.warn('[Agent Executor] Sentry MCP requested but user has no Sentry connection');
            }
        } else if (mcpName === 'appstore_connect') {
            const connection = await getAppStoreConnectConnection(userId);
            if (connection) {
                const privateKey = decryptToken({
                    encrypted: connection.encrypted_private_key,
                    iv: connection.private_key_iv,
                    authTag: connection.private_key_auth_tag
                });
                const serverPath = path.join(__dirname, 'appstore-connect-custom-mcp-server.js');
                mcpServers.appstore_connect = {
                    command: 'node',
                    args: [serverPath],
                    env: {
                        APPSTORE_KEY_ID: connection.key_id,
                        APPSTORE_ISSUER_ID: connection.issuer_id,
                        APPSTORE_PRIVATE_KEY: privateKey,
                    },
                };
                console.log('[Agent Executor] Configured App Store Connect MCP server');
            } else {
                console.warn('[Agent Executor] App Store Connect MCP requested but user has no connection');
            }
        } else if (mcpName === 'meta_ads') {
            const connection = await getMetaAdsConnection(userId);
            if (connection) {
                const accessToken = decryptToken({
                    encrypted: connection.metadata.encrypted_token,
                    iv: connection.metadata.token_iv,
                    authTag: connection.metadata.token_auth_tag
                });
                const primaryAdAccount = connection.metadata.primary_ad_account;
                if (primaryAdAccount) {
                    const serverPath = path.join(__dirname, 'meta-ads-custom-mcp-server.js');
                    mcpServers.meta_ads = {
                        command: 'node',
                        args: [serverPath],
                        env: {
                            META_ACCESS_TOKEN: accessToken,
                            META_AD_ACCOUNT_ID: primaryAdAccount.id,
                        },
                    };
                    console.log('[Agent Executor] Configured Meta Ads MCP server');
                } else {
                    console.warn('[Agent Executor] Meta Ads MCP requested but no primary ad account selected');
                }
            } else {
                console.warn('[Agent Executor] Meta Ads MCP requested but user has no connection');
            }
        } else if (mcpName === 'render') {
            const encryptedApiKey = await getRenderApiKey(userId);
            if (encryptedApiKey) {
                const apiKey = decryptToken(encryptedApiKey);
                mcpServers.render = {
                    type: 'http',
                    url: 'https://mcp.render.com/mcp',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                    },
                };
                console.log('[Agent Executor] Configured Render MCP server');
            } else {
                console.warn('[Agent Executor] Render MCP requested but user has no connection');
            }
        } else if (mcpName === 'tasks') {
            const serverPath = path.join(__dirname, 'task-management-mcp-server.js');
            const args = [`--user-id=${userId}`];
            if (agent && agent.id) {
                args.push(`--module-id=${agent.id}`); // Note: Using agent.id as module context
            }
            mcpServers.tasks = {
                command: 'node',
                args: [serverPath, ...args],
            };
            console.log('[Agent Executor] Configured Task Management MCP server');
        } else if (mcpName === 'reports') {
            const serverPath = path.join(__dirname, 'reports-custom-mcp-server.js');
            mcpServers.reports = {
                command: 'node',
                args: [serverPath, `--user-id=${userId}`],
            };
            console.log('[Agent Executor] Configured Reports MCP server');
        } else if (mcpName === 'capabilities') {
            const serverPath = path.join(__dirname, 'capabilities-custom-mcp-server.js');
            mcpServers.capabilities = {
                command: 'node',
                args: [serverPath, `--user-id=${userId}`],
            };
            console.log('[Agent Executor] Configured Capabilities MCP server');
        }
    }

    return mcpServers;
}

module.exports = {
    runAgentWithTask,
    buildAgentPrompt,
    configureMCPServersForAgent,
};
