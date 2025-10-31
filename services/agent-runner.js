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
const { getGitHubToken, getGmailToken } = require('../db');
const { decryptToken } = require('../utils/encryption');
const { generateTaskSummary } = require('./summary-generator');
const { summarizeRecentEmails } = require('./email-summarizer');
const { setupGmailMCPCredentials, cleanupGmailMCPCredentials } = require('./gmail-mcp-setup');

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
    let mcpMounts = [];

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

        // 3. Check if this is a special module type (email summarizer)
        if (module.type === 'email_summarizer') {
            return await runEmailSummarizerModule(module, userId, executionRecord, startTime);
        }

        // 4. Prepare execution context for regular modules
        const context = await prepareModuleContext(module, userId);

        console.log(`[Agent Runner] Context prepared with ${Object.keys(context.mcpServers || {}).length} MCP servers`);

        // 5. If using Gmail MCP, seed credentials first
        const config = module.config || {};
        mcpMounts = config.mcpMounts || [];
        if (mcpMounts.includes('gmail')) {
            console.log('[Agent Runner] Setting up Gmail MCP credentials...');
            const setupSuccess = await setupGmailMCPCredentials(userId);
            if (!setupSuccess) {
                throw new Error('Failed to set up Gmail MCP credentials');
            }
        }

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

        // 6. Cleanup workspace and Gmail MCP credentials
        console.log(`[Agent Runner] 🧹 Cleaning up workspace...`);
        await fs.rm(workspace, { recursive: true, force: true });

        // Cleanup Gmail MCP credentials if they were used
        if (mcpMounts.includes('gmail')) {
            await cleanupGmailMCPCredentials();
        }

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

        // Cleanup Gmail MCP credentials if they were used
        if (mcpMounts.includes('gmail')) {
            await cleanupGmailMCPCredentials();
        }

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
    const mcpMounts = config.mcpMounts || [];

    let prompt = `
${goal}

Context:
${JSON.stringify(inputs, null, 2)}

Please execute this task autonomously using the available MCP tools.`;

    // Add fal.ai capabilities if enabled
    if (mcpMounts.includes('fal-ai')) {
        prompt += `

## AI Content Generation (fal.ai)

You have access to AI content generation via the Polsia backend API. You can generate images and videos programmatically.

**Available API Endpoints:**

1. **Generate Image** - POST /api/ai/generate/image
   Body: { "prompt": "your image description", "options": { "model": "flux-pro" | "nano-banana", "width": 1024, "height": 1024 } }

2. **Generate Video** - POST /api/ai/generate/video
   Body: { "source_type": "text" | "image", "source": "prompt or image URL", "prompt": "motion description", "options": { "model": "veo3-fast", "duration": 5, "aspect_ratio": "16:9" } }

3. **Create Social Content with AI Media** - POST /api/ai/generate/content
   Body: { "account_id": 123, "text": "post text", "media_type": "image" | "video", "generation_prompt": "what to generate" }

**Available Models:**
- Images: flux-pro (high quality), nano-banana (fast/cheap)
- Text-to-Video: veo3-fast, kling-text-to-video, sora2-text, wan-v2.2
- Image-to-Video: minimax-hailuo, veo3-image, kling-video, sora2-image

Use the \`mcp__http__fetch\` tool or similar to call these endpoints. All media is automatically backed up to R2 if enabled.`;
    }

    return prompt.trim();
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
        } else if (mcpName === 'gmail') {
            // Gmail MCP uses credentials from ~/.gmail-mcp/credentials.json
            // These are seeded by setupGmailMCPCredentials() before execution
            const encryptedTokens = await getGmailToken(userId);
            if (encryptedTokens) {
                mcpServers.gmail = {
                    command: 'npx',
                    args: ['-y', '@gongrzhe/server-gmail-autoauth-mcp'],
                };
                console.log('[Agent Runner] Configured Gmail MCP server (credentials pre-seeded)');
            } else {
                console.warn('[Agent Runner] Gmail MCP requested but user has no Gmail connection');
            }
        }
        // Add more MCP server types here (notion, slack, etc.)
        // Note: 'fal-ai' is handled via prompt augmentation in buildModulePrompt(),
        // not as a true MCP server. Modules call Polsia's /api/ai endpoints directly.
    }

    return mcpServers;
}

/**
 * Run email summarizer module (specialized handler)
 * @param {Object} module - Module configuration
 * @param {number} userId - User ID
 * @param {Object} executionRecord - Execution record
 * @param {number} startTime - Start timestamp
 * @returns {Promise<Object>} Execution result
 */
async function runEmailSummarizerModule(module, userId, executionRecord, startTime) {
    try {
        console.log(`[Agent Runner] 📧 Running email summarizer module`);

        // Log start
        await saveExecutionLog(executionRecord.id, {
            log_level: 'info',
            stage: 'started',
            message: 'Starting email summarization',
        });

        // Get configuration
        const config = module.config || {};
        const maxEmails = config.maxEmails || 5;
        const query = config.query || 'in:inbox';

        console.log(`[Agent Runner] Fetching ${maxEmails} emails with query: "${query}"`);

        // Log fetching
        await saveExecutionLog(executionRecord.id, {
            log_level: 'info',
            stage: 'fetching',
            message: `Fetching ${maxEmails} most recent emails`,
        });

        // Execute email summarizer
        const result = await summarizeRecentEmails(userId, {
            maxEmails,
            query
        });

        // Log completion
        await saveExecutionLog(executionRecord.id, {
            log_level: 'info',
            stage: 'summarizing',
            message: `Generating AI summary of ${result.summary.emailCount} emails`,
        });

        await saveExecutionLog(executionRecord.id, {
            log_level: 'info',
            stage: 'completed',
            message: `Email summarization completed: "${result.summary.title}"`,
        });

        // Calculate metrics
        const duration = Date.now() - startTime;
        const cost = 0.002; // Approximate cost for Claude API call

        console.log(`[Agent Runner] ✓ Email summarizer completed`);
        console.log(`   - Duration: ${(duration / 1000).toFixed(2)}s`);
        console.log(`   - Emails: ${result.summary.emailCount}`);

        // Update execution record
        await updateModuleExecution(executionRecord.id, {
            status: 'completed',
            completed_at: new Date(),
            duration_ms: duration,
            cost_usd: cost,
            metadata: {
                emailCount: result.summary.emailCount,
                actionItems: result.summary.actionItems?.length || 0,
            },
        });

        // Create task summary
        const usedServices = await getServiceConnectionsByUserId(userId);
        const gmailService = usedServices.find(s => s.service_name === 'gmail');
        const serviceIds = gmailService ? [gmailService.id] : [];

        await createTaskSummary(userId, {
            title: result.summary.title,
            description: result.summary.description,
            status: 'completed',
            serviceIds: serviceIds,
            execution_id: executionRecord.id,
            module_id: module.id,
            cost_usd: cost,
            duration_ms: duration,
            num_turns: 1,
            completed_at: new Date(),
        });

        console.log(`[Agent Runner] ✅ Task summary created for email summarizer`);

        return {
            success: true,
            execution_id: executionRecord.id,
            duration_ms: duration,
            cost_usd: cost,
            summary: result.summary,
        };

    } catch (error) {
        console.error(`[Agent Runner] ❌ Error in email summarizer:`, error.message);

        const duration = Date.now() - startTime;

        // Log error
        await saveExecutionLog(executionRecord.id, {
            log_level: 'error',
            stage: 'failed',
            message: `Email summarizer failed: ${error.message}`,
        });

        // Update execution record with error
        await updateModuleExecution(executionRecord.id, {
            status: 'failed',
            completed_at: new Date(),
            duration_ms: duration,
            error_message: error.message,
        });

        return {
            success: false,
            error: error.message,
            execution_id: executionRecord.id,
        };
    }
}

module.exports = {
    runModule,
    prepareModuleContext,
};
