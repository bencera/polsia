/**
 * Agent Runner Service
 * Executes autonomous modules using Claude Agent SDK with MCP tools
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { executeTask } = require('./claude-agent');
const {
    getModuleById,
    createModuleExecution,
    updateModuleExecution,
    getServiceConnectionsByUserId,
    saveExecutionLog,
    createTaskSummary,
    getExecutionLogs,
} = require('../db');
const { getGitHubToken } = require('../db');
const { decryptToken } = require('../utils/encryption');
const { generateTaskSummary } = require('./summary-generator');

/**
 * Run a module and track its execution
 * @param {number} moduleId - The module ID to execute
 * @param {number} userId - The user ID who owns the module
 * @param {Object} options - Execution options
 * @param {string} options.trigger_type - How was this triggered? ('manual', 'scheduled', 'auto')
 * @returns {Promise<Object>} Execution result
 */
async function runModule(moduleId, userId, options = {}) {
    const startTime = Date.now();
    const { trigger_type = 'manual' } = options;

    console.log(`[Agent Runner] Starting module execution: ${moduleId} for user ${userId}`);

    let executionRecord = null;

    try {
        // 1. Fetch module configuration
        const module = await getModuleById(moduleId, userId);
        if (!module) {
            throw new Error(`Module ${moduleId} not found for user ${userId}`);
        }

        console.log(`[Agent Runner] Module found: ${module.name}`);

        // 2. Create execution record
        executionRecord = await createModuleExecution(moduleId, userId, {
            trigger_type,
            status: 'running',
        });

        console.log(`[Agent Runner] Execution record created: ${executionRecord.id}`);

        // Update execution status to running
        await updateModuleExecution(executionRecord.id, {
            status: 'running',
        });

        // 3. Prepare execution context
        const context = await prepareModuleContext(module, userId);

        console.log(`[Agent Runner] Context prepared with ${Object.keys(context.mcpServers || {}).length} MCP servers`);

        // 4. Create workspace directory
        const workspace = path.join(
            process.cwd(),
            'temp',
            'module-executions',
            `${executionRecord.id}-${crypto.randomBytes(4).toString('hex')}`
        );
        await fs.mkdir(workspace, { recursive: true });

        console.log(`[Agent Runner] Workspace created: ${workspace}`);

        // 5. Execute task using Claude Agent SDK
        console.log(`[Agent Runner] 🤖 Starting AI execution...`);
        console.log(`[Agent Runner] Prompt: ${context.prompt.substring(0, 100)}...`);

        const result = await executeTask(context.prompt, {
            cwd: workspace,
            maxTurns: context.maxTurns || 20,
            mcpServers: context.mcpServers,
            onProgress: async (progress) => {
                let logMessage = '';
                let logLevel = 'info';
                let stage = progress.stage || null;

                if (progress.stage === 'thinking') {
                    logMessage = progress.message || 'AI thinking...';
                    console.log(`[Agent Runner] 💭 AI thinking: ${progress.message || ''}`);
                } else if (progress.stage === 'tool_use') {
                    logMessage = `Using tool: ${progress.tool}`;
                    stage = 'tool_use';
                    console.log(`[Agent Runner] 🔧 Using tool: ${progress.tool} (turn ${progress.turnCount || '?'})`);
                } else if (progress.stage === 'initialized') {
                    logMessage = `Session initialized with model: ${progress.model}`;
                    stage = 'initialized';
                    console.log(`[Agent Runner] ✓ Session initialized with model: ${progress.model}`);
                } else if (progress.stage) {
                    logMessage = `Stage: ${progress.stage}${progress.substage ? `/${progress.substage}` : ''}`;
                    console.log(`[Agent Runner] 📊 Stage: ${progress.stage}${progress.substage ? `/${progress.substage}` : ''}`);
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
                        },
                    }).catch(err => {
                        console.error('[Agent Runner] Failed to save log to database:', err.message);
                    });
                }
            },
        });

        console.log(`[Agent Runner] ✓ AI execution completed. Success: ${result.success}`);

        // 6. Cleanup workspace
        console.log(`[Agent Runner] 🧹 Cleaning up workspace...`);
        await fs.rm(workspace, { recursive: true, force: true });

        // 7. Update execution record with results
        const duration = Date.now() - startTime;
        const cost = result.metadata?.cost_usd || 0;

        console.log(`[Agent Runner] 📊 Execution stats:`);
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
                files: result.files ? Object.keys(result.files) : [],
                model: result.metadata?.model,
            },
            error_message: result.success ? null : result.error,
        });

        console.log(`[Agent Runner] ✅ Module execution completed: ${moduleId}`);

        // 8. Create task summary for the feed if successful
        if (result.success) {
            try {
                console.log(`[Agent Runner] 📝 Generating AI task summary...`);

                // Get execution logs for AI summary generation
                const executionLogs = await getExecutionLogs(executionRecord.id);

                // Generate AI-powered summary
                const aiSummary = await generateTaskSummary(executionLogs, {
                    duration: duration,
                    cost: cost,
                    turns: result.metadata?.num_turns,
                }, module);

                // Get service connections used for this module
                const usedServices = await getServiceConnectionsByUserId(userId);
                const moduleConfig = module.config || {};
                const serviceIds = moduleConfig.mcpMounts?.map(serviceName => {
                    const service = usedServices.find(s => s.service_name === serviceName);
                    return service?.id;
                }).filter(Boolean) || [];

                // Create summary with AI-generated title and description
                await createTaskSummary(userId, {
                    title: aiSummary.title,
                    description: aiSummary.description,
                    status: 'completed',
                    serviceIds: serviceIds,
                    execution_id: executionRecord.id,
                    module_id: moduleId,
                    cost_usd: cost,
                    duration_ms: duration,
                    num_turns: result.metadata?.num_turns || 0,
                    completed_at: new Date(), // Use actual completion time
                });

                console.log(`[Agent Runner] ✅ Task summary created for user ${userId}`);
            } catch (err) {
                console.error(`[Agent Runner] ⚠️  Failed to create task summary:`, err.message);
                // Don't fail the entire execution if summary creation fails
            }
        }

        return {
            success: result.success,
            execution_id: executionRecord.id,
            duration_ms: duration,
            cost_usd: result.metadata?.cost_usd || 0,
        };
    } catch (error) {
        console.error(`[Agent Runner] ❌ Error executing module ${moduleId}:`, error.message);
        console.error(`[Agent Runner] Stack trace:`, error.stack);

        // Update execution record with error
        if (executionRecord) {
            const duration = Date.now() - startTime;
            console.log(`[Agent Runner] 📊 Failed execution stats:`);
            console.log(`   - Duration: ${(duration / 1000).toFixed(2)}s`);
            console.log(`   - Error: ${error.message}`);

            await updateModuleExecution(executionRecord.id, {
                status: 'failed',
                completed_at: new Date(),
                duration_ms: duration,
                error_message: error.message,
            });
        }

        return {
            success: false,
            error: error.message,
            execution_id: executionRecord?.id,
        };
    }
}

/**
 * Prepare execution context for a module
 * @param {Object} module - Module configuration
 * @param {number} userId - User ID
 * @returns {Promise<Object>} Execution context with prompt, MCP servers, etc.
 */
async function prepareModuleContext(module, userId) {
    const config = module.config || {};

    // 1. Build the system prompt
    const prompt = buildModulePrompt(module, config);

    // 2. Configure MCP servers based on module requirements
    const mcpServers = await configureMCPServers(module, userId, config);

    // 3. Set execution parameters
    const maxTurns = config.maxTurns || 20;

    return {
        prompt,
        mcpServers,
        maxTurns,
    };
}

/**
 * Build the prompt for the module
 * @param {Object} module - Module configuration
 * @param {Object} config - Module config JSON
 * @returns {string} System prompt
 */
function buildModulePrompt(module, config) {
    const goal = config.goal || `You are ${module.name}. ${module.description}`;
    const inputs = config.inputs || {};

    return `
${goal}

Context:
${JSON.stringify(inputs, null, 2)}

Please execute this task autonomously using the available MCP tools.
`.trim();
}

/**
 * Configure MCP servers based on module requirements
 * @param {Object} module - Module configuration
 * @param {number} userId - User ID
 * @param {Object} config - Module config JSON
 * @returns {Promise<Object>} MCP servers configuration for SDK
 */
async function configureMCPServers(module, userId, config) {
    const mcpServers = {};
    const mcpMounts = config.mcpMounts || [];

    // For each MCP server the module needs, configure it with user's tokens
    for (const mcpName of mcpMounts) {
        if (mcpName === 'github') {
            // Get user's GitHub token
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
                console.log('[Agent Runner] Configured GitHub MCP server');
            } else {
                console.warn('[Agent Runner] GitHub MCP requested but user has no GitHub connection');
            }
        }
        // Add more MCP server types here (notion, slack, etc.)
    }

    return mcpServers;
}

module.exports = {
    runModule,
    prepareModuleContext,
};
