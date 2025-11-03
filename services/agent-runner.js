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
    getServiceConnectionByName,
} = require('../db');
const { getGitHubToken, getGmailToken, getSentryToken, getAppStoreConnectConnection, getMetaAdsConnection, getRenderApiKey, getRenderConnection } = require('../db');
const { decryptToken } = require('../utils/encryption');
const { generateTaskSummary } = require('./summary-generator');
const { summarizeRecentEmails } = require('./email-summarizer');
const { setupGmailMCPCredentials, cleanupGmailMCPCredentials } = require('./gmail-mcp-setup');
const { runDataAgent } = require('./data-agent');

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

        // 3. Check if this is a special module type (email summarizer, data agent, vision gatherer, render analytics)
        if (module.type === 'email_summarizer') {
            return await runEmailSummarizerModule(module, userId, executionRecord, startTime);
        }

        if (module.type === 'data_agent') {
            return await runDataAgentModule(module, userId, executionRecord, startTime);
        }

        if (module.type === 'vision_gatherer') {
            return await runVisionGathererModule(module, userId, executionRecord, startTime);
        }

        if (module.type === 'render_analytics') {
            return await runRenderAnalyticsModule(module, userId, executionRecord, startTime);
        }

        if (module.type === 'appstore_analytics') {
            return await runAppStoreAnalyticsModule(module, userId, executionRecord, startTime);
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

        // 7.5. Auto-store analytics request ID if this is the Enable module
        if (result.success && module.name === 'Enable App Store Analytics Reports') {
            try {
                const { storeAppStoreAnalyticsRequest } = require('../db');

                // Parse the output for ANALYTICS_REQUEST_ID and ANALYTICS_APP_ID
                const outputText = result.output || '';
                const requestIdMatch = outputText.match(/ANALYTICS_REQUEST_ID:\s*([a-f0-9-]+)/i);
                const appIdMatch = outputText.match(/ANALYTICS_APP_ID:\s*([a-f0-9-]+)/i);

                if (requestIdMatch && appIdMatch) {
                    const requestId = requestIdMatch[1];
                    const appId = appIdMatch[1];

                    await storeAppStoreAnalyticsRequest(userId, requestId, appId);
                    console.log(`[Agent Runner] ✓ Auto-stored analytics request ID: ${requestId}`);
                } else {
                    console.log('[Agent Runner] ⚠️  Enable module completed but could not find ANALYTICS_REQUEST_ID in output');
                }
            } catch (err) {
                console.error('[Agent Runner] Failed to auto-store analytics request ID:', err);
            }
        }

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

    // 1. Build the system prompt (now async to support context injection)
    const prompt = await buildModulePrompt(module, config, userId);

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
 * @param {number} userId - User ID (for context injection)
 * @returns {Promise<string>} System prompt
 */
async function buildModulePrompt(module, config, userId) {
    const goal = config.goal || `You are ${module.name}. ${module.description}`;
    const inputs = config.inputs || {};
    const mcpMounts = config.mcpMounts || [];

    // Inject stored analytics request ID for Fetch module
    let additionalContext = '';
    if (module.name === 'Fetch App Store Analytics Data') {
        const { getAppStoreAnalyticsRequest } = require('../db');
        try {
            const storedRequest = await getAppStoreAnalyticsRequest(userId);
            if (storedRequest) {
                additionalContext = `

## IMPORTANT: Stored Analytics Request

You have access to a previously created analytics request:
- **Request ID:** ${storedRequest.requestId}
- **App ID:** ${storedRequest.appId}
- **Enabled At:** ${storedRequest.enabledAt}

**Use this request ID** to check for report instances instead of trying to discover it.

WORKFLOW:
1. Use \`get_analytics_report_status\` with requestId="${storedRequest.requestId}"
2. This returns a list of report IDs (e.g., r39-xxx, r154-xxx)
3. For each report ID, use \`get_analytics_report_instances\` to check for CSV files
4. Download the LATEST instance only (sort by processingDate)
5. Parse and integrate the data

If no instances are available yet (empty array), create a status update noting that Apple is still processing (typical 24-48 hours after enabling).`;
            } else {
                additionalContext = `

## NOTE: No Stored Analytics Request Found

The "Enable App Store Analytics Reports" module may not have been run yet, or the request ID wasn't stored.

You can try to discover the request ID by:
1. Using \`list_apps\` to find your app ID
2. Attempting various report IDs (but this may not work without the request ID)

Or wait for the Enable module to be run first.`;
            }
        } catch (err) {
            console.error('[Agent Runner] Failed to get stored analytics request:', err);
        }
    }

    let prompt = `
${goal}
${additionalContext}

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
        } else if (mcpName === 'sentry') {
            // Custom Sentry MCP server - uses direct REST API, no OpenAI required
            // Built in-house to avoid the official server's OpenAI schema bugs
            const encryptedToken = await getSentryToken(userId);
            if (encryptedToken) {
                const token = decryptToken(encryptedToken);
                const serverPath = require('path').join(__dirname, 'sentry-custom-mcp-server.js');
                mcpServers.sentry = {
                    command: 'node',
                    args: [serverPath, `--access-token=${token}`],
                };
                console.log('[Agent Runner] Configured custom Sentry MCP server (direct REST API)');
            } else {
                console.warn('[Agent Runner] Sentry MCP requested but user has no Sentry connection');
            }
        } else if (mcpName === 'appstore_connect') {
            // Custom App Store Connect MCP server - uses JWT authentication
            // Built in-house for App Store Connect API integration
            const connection = await getAppStoreConnectConnection(userId);
            if (connection) {
                const privateKey = decryptToken({
                    encrypted: connection.encrypted_private_key,
                    iv: connection.private_key_iv,
                    authTag: connection.private_key_auth_tag
                });
                const serverPath = require('path').join(__dirname, 'appstore-connect-custom-mcp-server.js');
                mcpServers.appstore_connect = {
                    command: 'node',
                    args: [
                        serverPath,
                        `--key-id=${connection.key_id}`,
                        `--issuer-id=${connection.issuer_id}`,
                        `--private-key=${privateKey}`
                    ],
                };
                console.log('[Agent Runner] Configured custom App Store Connect MCP server (JWT authentication)');
            } else {
                console.warn('[Agent Runner] App Store Connect MCP requested but user has no App Store Connect connection');
            }
        } else if (mcpName === 'meta_ads') {
            // Custom Meta Ads MCP server - uses OAuth access token
            // Built in-house for Meta Marketing API integration
            const connection = await getMetaAdsConnection(userId);
            if (connection) {
                const accessToken = decryptToken({
                    encrypted: connection.metadata.encrypted_token,
                    iv: connection.metadata.token_iv,
                    authTag: connection.metadata.token_auth_tag
                });

                // Get primary ad account ID (required for API calls)
                const primaryAdAccount = connection.metadata.primary_ad_account;
                if (!primaryAdAccount) {
                    console.warn('[Agent Runner] Meta Ads MCP requested but no primary ad account selected. Please select a primary ad account in Connections.');
                } else {
                    const adAccountId = primaryAdAccount.id;
                    const serverPath = require('path').join(__dirname, 'meta-ads-custom-mcp-server.js');
                    mcpServers.meta_ads = {
                        command: 'node',
                        args: [
                            serverPath,
                            `--access-token=${accessToken}`,
                            `--ad-account-id=${adAccountId}`
                        ],
                    };
                    console.log(`[Agent Runner] Configured custom Meta Ads MCP server (ad account: ${primaryAdAccount.name})`);
                }
            } else {
                console.warn('[Agent Runner] Meta Ads MCP requested but user has no Meta Ads connection');
            }
        } else if (mcpName === 'render') {
            // Render MCP - Official HTTP-based MCP server by Render
            // https://render.com/docs/mcp-server
            // SDK supports HTTP transport directly (no stdio bridge needed)
            const encryptedApiKey = await getRenderApiKey(userId);
            if (encryptedApiKey) {
                const apiKey = decryptToken(encryptedApiKey);

                // Get primary service info to pass as context
                const renderConnection = await getRenderConnection(userId);
                const primaryService = renderConnection?.metadata?.primary_service;

                if (primaryService) {
                    console.log(`[Agent Runner] Render primary service: ${primaryService.name} (${primaryService.id})`);
                }

                // Configure Render MCP using HTTP transport
                // See: https://docs.claude.com/en/api/agent-sdk/mcp
                mcpServers.render = {
                    type: 'http',
                    url: 'https://mcp.render.com/mcp',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                    },
                };
                console.log('[Agent Runner] Configured Render MCP server (HTTP transport)');
            } else {
                console.warn('[Agent Runner] Render MCP requested but user has no Render connection');
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

/**
 * Run Data Agent module - collects metrics and updates analytics
 * @param {Object} module - Module configuration
 * @param {number} userId - User ID
 * @param {Object} executionRecord - Execution record
 * @param {number} startTime - Start timestamp
 * @returns {Promise<Object>} Execution result
 */
async function runDataAgentModule(module, userId, executionRecord, startTime) {
    try {
        console.log(`[Agent Runner] 📊 Running data agent module`);

        // Log start
        await saveExecutionLog(executionRecord.id, {
            log_level: 'info',
            stage: 'started',
            message: 'Starting data collection and analytics update',
        });

        // Log collecting
        await saveExecutionLog(executionRecord.id, {
            log_level: 'info',
            stage: 'collecting',
            message: 'Collecting metrics from all integrations',
        });

        // Execute data agent
        const result = await runDataAgent(userId);

        // Log completion
        await saveExecutionLog(executionRecord.id, {
            log_level: 'info',
            stage: 'completed',
            message: `Data agent completed. Analytics updated, anomalies detected: ${result.anomalies_detected}`,
        });

        // Calculate metrics
        const duration = Date.now() - startTime;
        const cost = 0.0; // Data agent doesn't use AI, no cost

        console.log(`[Agent Runner] ✓ Data agent completed`);
        console.log(`   - Duration: ${(duration / 1000).toFixed(2)}s`);
        console.log(`   - Anomalies detected: ${result.anomalies_detected}`);

        // Update execution record
        await updateModuleExecution(executionRecord.id, {
            status: 'completed',
            completed_at: new Date(),
            duration_ms: duration,
            cost_usd: cost,
            metadata: {
                analytics_updated: result.analytics_updated,
                anomalies_detected: result.anomalies_detected,
                metrics_collected: {
                    github: !!result.metrics?.github,
                    gmail: !!result.metrics?.gmail,
                    meta_ads: !!result.metrics?.meta_ads,
                    late_dev: !!result.metrics?.late_dev,
                    modules: !!result.metrics?.modules,
                },
            },
        });

        // Create task summary
        await createTaskSummary(userId, {
            title: 'Data Collection & Analytics Update',
            description: 'Collected metrics from all integrations and updated analytics documents',
            status: 'completed',
            serviceIds: [],
            execution_id: executionRecord.id,
            module_id: module.id,
            cost_usd: cost,
            duration_ms: duration,
            num_turns: 0,
            completed_at: new Date(),
        });

        console.log(`[Agent Runner] ✅ Task summary created for data agent`);

        return {
            success: true,
            execution_id: executionRecord.id,
            duration_ms: duration,
            cost_usd: cost,
            result,
        };

    } catch (error) {
        console.error(`[Agent Runner] ❌ Error in data agent:`, error.message);

        const duration = Date.now() - startTime;

        // Log error
        await saveExecutionLog(executionRecord.id, {
            log_level: 'error',
            stage: 'failed',
            message: `Data agent failed: ${error.message}`,
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

/**
 * Run Vision Gatherer Module
 * Analyzes GitHub repository to generate product vision document
 */
async function runVisionGathererModule(module, userId, executionRecord, startTime) {
    const crypto = require('crypto');
    const fs = require('fs').promises;

    try {
        console.log(`[Agent Runner] 📊 Running Vision Gatherer module`);

        // Get GitHub connection and primary repo
        const connection = await getServiceConnectionByName(userId, 'github');
        if (!connection) {
            throw new Error('GitHub not connected. Please connect your GitHub account first.');
        }

        const primaryRepo = connection.metadata?.primary_repo;
        if (!primaryRepo) {
            throw new Error('No primary repository configured. Please set a primary repository in Connections.');
        }

        console.log(`[Agent Runner] Analyzing repository: ${primaryRepo.full_name}`);

        // Log start
        await saveExecutionLog(executionRecord.id, {
            log_level: 'info',
            stage: 'started',
            message: `Starting codebase analysis for ${primaryRepo.full_name}`,
        });

        // Prepare context with GitHub MCP
        const context = await prepareModuleContext(module, userId);

        // Enhanced prompt for comprehensive vision analysis
        const visionPrompt = `You are a product strategist analyzing the ${primaryRepo.full_name} repository.

Your task is to generate a comprehensive Product Vision document by analyzing the codebase.

Using the GitHub MCP tools available to you:
1. Read the README.md file
2. Examine package.json or similar dependency files
3. Browse key source code files to understand architecture
4. Identify main features and functionality
5. Understand the technology stack

Generate a detailed vision document covering:

## Product Vision

### What We Do
[Clear description of the product's purpose and what problem it solves]

### Target Audience
[Who are the users? What are their needs?]

### Mission
[The core mission and purpose of this project]

### Current Features
[List the main features and capabilities currently implemented]

### Technology Stack
[Languages, frameworks, libraries, and architecture patterns used]

### Code Architecture
[High-level architecture overview - how the code is organized]

### Tone & Values
[Based on README and documentation, what is the project's voice and values?]

IMPORTANT: Return ONLY the markdown-formatted vision document. Do not include any explanations or meta-commentary outside the document.`;

        // Create workspace
        const workspace = path.join(
            process.cwd(),
            'temp',
            'module-executions',
            `${executionRecord.id}-${crypto.randomBytes(4).toString('hex')}`
        );
        await fs.mkdir(workspace, { recursive: true });

        console.log(`[Agent Runner] Workspace created: ${workspace}`);

        // Log analysis start
        await saveExecutionLog(executionRecord.id, {
            log_level: 'info',
            stage: 'analyzing',
            message: 'Claude is analyzing the codebase with GitHub MCP',
        });

        // Execute Claude Agent with GitHub MCP
        const result = await executeTask(visionPrompt, {
            cwd: workspace,
            maxTurns: context.maxTurns || 30,
            mcpServers: context.mcpServers,
            skipFileCollection: true, // Don't collect workspace files
            onProgress: async (progress) => {
                if (progress.stage === 'tool_use') {
                    await saveExecutionLog(executionRecord.id, {
                        log_level: 'info',
                        stage: 'analyzing',
                        message: `Using GitHub tool: ${progress.tool}`,
                        metadata: { tool: progress.tool }
                    });
                }
            }
        });

        // Cleanup workspace
        await fs.rm(workspace, { recursive: true, force: true });

        if (!result.success) {
            throw new Error(result.error || 'Vision analysis failed');
        }

        console.log(`[Agent Runner] Claude analysis complete`);

        // Extract vision from result
        const visionContent = extractVisionFromMessages(result.messages);

        if (!visionContent) {
            throw new Error('Failed to extract vision document from Claude response');
        }

        console.log(`[Agent Runner] Vision document generated (${visionContent.length} characters)`);

        // Save to document store
        await saveExecutionLog(executionRecord.id, {
            log_level: 'info',
            stage: 'saving',
            message: 'Saving vision document to document store',
        });

        const { updateDocument } = require('./document-store');
        await updateDocument(userId, 'vision_md', visionContent);

        console.log(`[Agent Runner] ✓ Vision saved to document store`);

        // Calculate metrics
        const duration = Date.now() - startTime;
        const cost = result.metadata?.cost_usd || 0;
        const turns = result.metadata?.num_turns || 0;

        console.log(`[Agent Runner] ✓ Vision Gatherer completed`);
        console.log(`   - Repository: ${primaryRepo.full_name}`);
        console.log(`   - Duration: ${(duration / 1000).toFixed(2)}s`);
        console.log(`   - Cost: $${cost.toFixed(4)}`);
        console.log(`   - Turns: ${turns}`);

        // Update execution record
        await updateModuleExecution(executionRecord.id, {
            status: 'completed',
            completed_at: new Date(),
            duration_ms: duration,
            cost_usd: cost,
            metadata: {
                repository: primaryRepo.full_name,
                vision_length: visionContent.length,
                turns,
            },
        });

        // Create task summary
        await createTaskSummary(userId, {
            title: 'Repository Vision Analysis',
            description: `Generated comprehensive product vision for ${primaryRepo.full_name}`,
            status: 'completed',
            serviceIds: [],
            execution_id: executionRecord.id,
            module_id: module.id,
            cost_usd: cost,
            duration_ms: duration,
            num_turns: turns,
            completed_at: new Date(),
        });

        console.log(`[Agent Runner] ✅ Task summary created for Vision Gatherer`);

        return {
            success: true,
            execution_id: executionRecord.id,
            duration_ms: duration,
            cost_usd: cost,
            vision_length: visionContent.length,
        };

    } catch (error) {
        console.error(`[Agent Runner] ❌ Vision Gatherer error:`, error.message);

        const duration = Date.now() - startTime;

        // Log error
        await saveExecutionLog(executionRecord.id, {
            log_level: 'error',
            stage: 'failed',
            message: `Vision Gatherer failed: ${error.message}`,
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

/**
 * Extract vision document from Claude's response messages
 */
function extractVisionFromMessages(messages) {
    if (!messages || messages.length === 0) return null;

    // Collect all text content from assistant messages
    let visionText = '';

    const assistantMessages = messages.filter(m => m.type === 'assistant');

    for (const message of assistantMessages) {
        if (message.message?.content) {
            for (const content of message.message.content) {
                if (content.type === 'text' && content.text) {
                    visionText += content.text + '\n\n';
                }
            }
        }
    }

    // Clean up the text
    visionText = visionText.trim();

    // If no text found, check result message
    if (!visionText) {
        const resultMessage = messages.find(m => m.type === 'result');
        if (resultMessage?.result) {
            visionText = resultMessage.result;
        }
    }

    return visionText || null;
}

/**
 * Run Render Analytics Summarizer module (specialized handler)
 * Analyzes Render service metrics and generates business-aware insights
 * @param {Object} module - Module configuration
 * @param {number} userId - User ID
 * @param {Object} executionRecord - Execution record
 * @param {number} startTime - Start timestamp
 * @returns {Promise<Object>} Execution result
 */
async function runRenderAnalyticsModule(module, userId, executionRecord, startTime) {
    const crypto = require('crypto');
    const fs = require('fs').promises;

    try {
        console.log(`[Agent Runner] 📊 Running Render Analytics Summarizer module`);

        // Get Render connection and primary service
        const connection = await getRenderConnection(userId);
        if (!connection) {
            throw new Error('Render not connected. Please connect your Render account first.');
        }

        const primaryService = connection.metadata?.primary_service;
        if (!primaryService) {
            throw new Error('No primary service configured. Please set a primary Render service in Connections.');
        }

        console.log(`[Agent Runner] Analyzing service: ${primaryService.name} (${primaryService.id})`);

        // Log start
        await saveExecutionLog(executionRecord.id, {
            log_level: 'info',
            stage: 'started',
            message: `Starting Render analytics for ${primaryService.name}`,
        });

        // Load vision document for business context
        const { getDocumentStore } = require('./document-store');
        const documents = await getDocumentStore(userId);
        const visionContext = documents?.vision_md || '';

        console.log(`[Agent Runner] Vision context loaded: ${visionContext ? 'Yes' : 'No'}`);

        // Prepare context with Render MCP
        const context = await prepareModuleContext(module, userId);

        // Get primary GitHub repo for code exploration
        const githubConnection = await getServiceConnectionByName(userId, 'github');
        const primaryRepo = githubConnection?.metadata?.primary_repo;

        if (!primaryRepo) {
            console.warn(`[Agent Runner] No primary GitHub repo configured - agent will work without codebase access`);
        } else {
            console.log(`[Agent Runner] Primary repo: ${primaryRepo.full_name}`);
        }

        // Create workspace
        const workspace = path.join(
            process.cwd(),
            'temp',
            'module-executions',
            `${executionRecord.id}-${crypto.randomBytes(4).toString('hex')}`
        );
        await fs.mkdir(workspace, { recursive: true });

        console.log(`[Agent Runner] Workspace created: ${workspace}`);

        // Clone GitHub repository if configured
        let repoPath = null;
        if (primaryRepo) {
            try {
                const { execSync } = require('child_process');
                repoPath = path.join(workspace, 'repo');

                console.log(`[Agent Runner] Cloning repository: ${primaryRepo.full_name}...`);

                await saveExecutionLog(executionRecord.id, {
                    log_level: 'info',
                    stage: 'setup',
                    message: `Cloning repository: ${primaryRepo.full_name}`,
                });

                // Clone repo with depth=1 for faster cloning (just latest commit)
                execSync(`git clone --depth 1 https://github.com/${primaryRepo.full_name} ${repoPath}`, {
                    stdio: 'pipe',
                    timeout: 60000, // 60 second timeout
                });

                console.log(`[Agent Runner] Repository cloned successfully to: ${repoPath}`);

                await saveExecutionLog(executionRecord.id, {
                    log_level: 'info',
                    stage: 'setup',
                    message: 'Repository cloned successfully',
                });
            } catch (error) {
                console.warn(`[Agent Runner] Failed to clone repository: ${error.message}`);
                await saveExecutionLog(executionRecord.id, {
                    log_level: 'warning',
                    stage: 'setup',
                    message: `Failed to clone repository: ${error.message}. Continuing with GitHub MCP only.`,
                });
                repoPath = null; // Reset if cloning failed
            }
        }

        // Build autonomous analytics prompt with vision context (after repo cloning)
        const analyticsPrompt = `You are an autonomous business analyst for "${primaryService.name}".

## Your Mission

Analyze the production database to generate comprehensive business insights. You have access to:
1. **Vision document** - Understand what matters for this business
2. **${repoPath ? 'Local repository clone' : 'GitHub repository'}** - Explore codebase to understand database schema${primaryRepo ? ` (${primaryRepo.full_name})` : ''}${repoPath ? `\n   - **Location:** \`./repo/\` (cloned in your workspace)` : ''}
3. **Production Postgres database** - Query live business metrics via Render MCP

${visionContext ? `## Company Vision\n\n${visionContext}\n\n` : ''}## Available Tools

**${repoPath ? 'Local File Tools (fastest - use these first):' : 'GitHub MCP (explore codebase):'}**${repoPath ? `
- \`Read\` - Read files from ./repo/ directory
- \`Grep\` - Search codebase for patterns
- \`Glob\` - Find files by pattern
- \`Bash\` - Run shell commands in ./repo/ directory

Examples:
- \`Read ./repo/migrations/001-create-users.js\`
- \`Grep "CREATE TABLE" ./repo/migrations/\`
- \`Glob ./repo/migrations/*.js\`
` : `
- Read migrations/ to understand database schema
- Read db.js to see table structures and business logic
- Explore models/ or services/ to understand data relationships
`}
**Render MCP (query production data):**
- \`mcp__render__list_postgres_instances\` - Find production database
- \`mcp__render__get_postgres\` - Get database connection details
- \`mcp__render__query_render_postgres\` - Run read-only SQL queries

## Your Autonomous Process

**Phase 1: Understand the Business**
- Read the vision document carefully to identify key business goals
- What metrics would indicate success for this business?

**Phase 2: Discover Database Schema**${repoPath ? `
- Explore the local repository clone at \`./repo/\`:
  - Use \`Glob\` to find migration files: \`./repo/migrations/*.js\`
  - Use \`Read\` to examine migrations and understand tables
  - Use \`Grep\` to search for table definitions and relationships
  - Look at db.js or schema files for business logic` : `
- Explore GitHub repository${primaryRepo ? ` (${primaryRepo.full_name})` : ''}:
  - Read migrations/ directory to understand tables and columns
  - Read db.js or schema files to see business logic`}
- Query production database \`information_schema\`:
  - \`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'\`
  - \`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'TABLE'\`

**Phase 3: Identify Important Metrics**
Based on vision + schema, autonomously decide what to measure. Consider:
- User activity and growth trends
- Feature usage and adoption patterns
- Execution costs and resource consumption
- Content creation and engagement
- AI generation usage and costs
- Task completion rates and efficiency
- Revenue indicators (if applicable)

**Phase 4: Gather Analytics**
Run SQL queries to collect data:
- Count aggregations over time periods
- SUM costs and durations
- Calculate success/failure rates
- Identify trends (week-over-week, month-over-month)
- Find anomalies or outliers

**Phase 5: Generate Report**
Create a comprehensive markdown report with:
- Executive Summary (3-5 key findings)
- Detailed metric sections based on what you discovered
- Specific numbers, percentages, date ranges
- Trend analysis (↑ growing, ↓ declining, → stable)
- Business context from vision document
- Actionable recommendations with priorities

## Requirements

- **Be autonomous**: Explore, discover, and decide what matters
- **Be thorough**: Cover all important metrics you discovered
- **Be specific**: Include exact numbers, dates, percentages
- **Be contextual**: Relate metrics to vision goals
- **Be actionable**: Provide clear, prioritized recommendations

## Output Format

**CRITICAL:** When you complete your analysis, write the final report to a file called \`analytics-report.md\`.

Use the Write tool to create the report:

\`\`\`
Write(analytics-report.md)
\`\`\`

The report should follow this structure:

# ${primaryService.name} Business Analytics Report
**Generated:** [current date and time]
**Analysis Period:** [date range of data analyzed]
**Database:** [postgres instance analyzed]

## Executive Summary
[3-5 sentences summarizing key findings, trends, and critical insights]

## [Your Analysis Sections]
[Based on what you discovered in the database]

## Key Findings & Metrics
[Bullet points with specific numbers]

## Trends Analysis
[Growth patterns, cost trends, usage patterns]

## Recommendations
[Prioritized, actionable recommendations]

---

**CRITICAL REMINDER:**

1. **IMMEDIATELY** write your report to \`analytics-report.md\` using the Write tool
2. Don't overthink it - just write the report based on the data you collected
3. Include specific numbers, dates, percentages from your queries
4. Make it markdown formatted and professional
5. Cover the key findings without trying to be overly long

IMPORTANT:
- This is production data - handle with care
- Write the report file NOW - don't spend too many turns planning
- Quality over length - focus on insights, not word count
- The report file will be automatically read and saved to the document store`;

        // Log analysis start
        await saveExecutionLog(executionRecord.id, {
            log_level: 'info',
            stage: 'analyzing',
            message: 'Claude is analyzing Render metrics with MCP tools',
        });

        // Execute Claude Agent with Render MCP
        const result = await executeTask(analyticsPrompt, {
            cwd: workspace,
            maxTurns: context.maxTurns || 25,
            mcpServers: context.mcpServers,
            skipFileCollection: true,
            onProgress: async (progress) => {
                if (progress.stage === 'tool_use') {
                    await saveExecutionLog(executionRecord.id, {
                        log_level: 'info',
                        stage: 'analyzing',
                        message: `Using Render tool: ${progress.tool}`,
                        metadata: { tool: progress.tool }
                    });
                }
            }
        });

        if (!result.success) {
            throw new Error(result.error || 'Render analytics analysis failed');
        }

        console.log(`[Agent Runner] Claude analysis complete`);

        // Read the analytics report from the file the agent wrote (BEFORE cleanup!)
        const reportPath = path.join(workspace, 'analytics-report.md');
        let analyticsContent = null;

        try {
            analyticsContent = await fs.readFile(reportPath, 'utf-8');
            console.log(`[Agent Runner] ✓ Analytics report read from file (${analyticsContent.length} characters)`);
        } catch (error) {
            console.error('[Agent Runner] ❌ Failed to read analytics-report.md');
            console.error('[Agent Runner] Error:', error.message);
            throw new Error('Agent did not write analytics-report.md file. The agent must use the Write tool to create this file with the complete report.');
        }

        // Validate report content
        const trimmed = analyticsContent.trim();
        if (!trimmed.startsWith('# ') || trimmed.length < 500) {
            console.error('[Agent Runner] ❌ Invalid report format');
            console.error('[Agent Runner] Report length:', trimmed.length);
            console.error('[Agent Runner] Starts with #:', trimmed.startsWith('# '));
            throw new Error('Analytics report is invalid. Must start with "# " header and be at least 500 characters.');
        }

        console.log(`[Agent Runner] ✓ Report validated`);

        // Calculate metrics first (needed for JSON and task summary)
        const duration = Date.now() - startTime;
        const cost = result.metadata?.cost_usd || 0;
        const turns = result.metadata?.num_turns || 0;

        // Helper function to extract summary from analytics content
        const extractSummary = (content) => {
            // Try to extract Executive Summary section
            const execMatch = content.match(/##\s*Executive\s*Summary\s*\n\n?([^\n]+(?:\n(?!##)[^\n]+)*)/i);
            if (execMatch) {
                return execMatch[1].trim().substring(0, 300);
            }

            // Fallback: Extract first paragraph after main header
            const lines = content.split('\n').filter(l => l.trim());
            for (let i = 0; i < Math.min(10, lines.length); i++) {
                if (!lines[i].startsWith('#') && !lines[i].startsWith('**') && lines[i].length > 50) {
                    return lines[i].trim().substring(0, 300);
                }
            }

            return `Analyzed ${primaryService.name} production database and generated comprehensive business insights`;
        };

        // Save to document store (analytics_md)
        await saveExecutionLog(executionRecord.id, {
            log_level: 'info',
            stage: 'saving',
            message: 'Saving analytics report to document store',
        });

        const { updateDocument } = require('./document-store');
        await updateDocument(userId, 'analytics_md', analyticsContent);

        // Also save structured analytics JSON for programmatic access
        const analyticsJSON = {
            timestamp: new Date().toISOString(),
            service: {
                name: primaryService.name,
                id: primaryService.id,
                type: primaryService.type,
            },
            report_length: analyticsContent.length,
            analysis: {
                database_queried: true,
                github_explored: !!primaryRepo,
                repo_cloned: !!repoPath,
                vision_included: !!visionContext,
                turns_used: turns,
                cost_usd: cost,
            },
            summary: extractSummary(analyticsContent),
            generated_at: new Date().toISOString(),
        };

        await updateDocument(userId, 'analytics_json', analyticsJSON);

        console.log(`[Agent Runner] ✓ Analytics saved to document store (MD + JSON)`);

        console.log(`[Agent Runner] ✓ Render Analytics Summarizer completed`);
        console.log(`   - Service: ${primaryService.name}`);
        console.log(`   - Duration: ${(duration / 1000).toFixed(2)}s`);
        console.log(`   - Cost: $${cost.toFixed(4)}`);
        console.log(`   - Turns: ${turns}`);

        // Update execution record
        await updateModuleExecution(executionRecord.id, {
            status: 'completed',
            completed_at: new Date(),
            duration_ms: duration,
            cost_usd: cost,
            metadata: {
                service_name: primaryService.name,
                service_id: primaryService.id,
                analytics_length: analyticsContent.length,
                turns,
            },
        });

        // Extract key insights from analytics for task summary (using helper defined earlier)
        const summaryDescription = extractSummary(analyticsContent);

        // Create task summary
        await createTaskSummary(userId, {
            title: 'Render Analytics Report Generated',
            description: summaryDescription,
            status: 'completed',
            serviceIds: [connection.id],
            execution_id: executionRecord.id,
            module_id: module.id,
            cost_usd: cost,
            duration_ms: duration,
            num_turns: turns,
            completed_at: new Date(),
        });

        console.log(`[Agent Runner] ✅ Task summary created for Render Analytics`);

        return {
            success: true,
            execution_id: executionRecord.id,
            duration_ms: duration,
            cost_usd: cost,
            analytics_length: analyticsContent.length,
        };

    } catch (error) {
        console.error(`[Agent Runner] ❌ Render Analytics error:`, error.message);

        const duration = Date.now() - startTime;

        // Log error
        await saveExecutionLog(executionRecord.id, {
            log_level: 'error',
            stage: 'failed',
            message: `Render Analytics failed: ${error.message}`,
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
    } finally {
        // Cleanup workspace (happens whether success or failure)
        try {
            await fs.rm(workspace, { recursive: true, force: true });
            console.log(`[Agent Runner] 🧹 Workspace cleaned up`);
        } catch (cleanupError) {
            console.warn(`[Agent Runner] Warning: Failed to cleanup workspace: ${cleanupError.message}`);
        }
    }
}

/**
 * Run App Store Analytics module
 * Fetches App Store Connect analytics and integrates into analytics.md
 */
async function runAppStoreAnalyticsModule(module, userId, executionRecord, startTime) {
    const crypto = require('crypto');
    const fs = require('fs').promises;
    let workspace; // Declare outside try block so finally can access it

    try {
        console.log(`[Agent Runner] 📱 Running App Store Analytics Integrator module`);

        // Get App Store Connect connection
        const { getAppStoreConnectConnection } = require('../db');
        const connection = await getAppStoreConnectConnection(userId);

        if (!connection) {
            throw new Error('App Store Connect not connected. Please connect your App Store Connect account first.');
        }

        const primaryApp = connection.primary_app;
        if (!primaryApp) {
            throw new Error('No primary app configured. Please set a primary app in Connections.');
        }

        console.log(`[Agent Runner] Analyzing app: ${primaryApp.name} (${primaryApp.id})`);

        // Log start
        await saveExecutionLog(executionRecord.id, {
            log_level: 'info',
            stage: 'started',
            message: `Starting App Store analytics for ${primaryApp.name}`,
        });

        // Load existing analytics document if available
        const { getDocumentStore } = require('./document-store');
        const documents = await getDocumentStore(userId);
        const existingAnalytics = documents?.analytics_md || '';

        console.log(`[Agent Runner] Existing analytics found: ${existingAnalytics ? 'Yes' : 'No'}`);

        // Prepare context with App Store Connect MCP
        const context = await prepareModuleContext(module, userId);

        // Create workspace
        const workspace = path.join(
            process.cwd(),
            'temp',
            'module-executions',
            `${executionRecord.id}-${crypto.randomBytes(4).toString('hex')}`
        );
        await fs.mkdir(workspace, { recursive: true });

        console.log(`[Agent Runner] Workspace created: ${workspace}`);

        // If there's existing analytics, save it to workspace for the agent to read
        if (existingAnalytics) {
            await fs.writeFile(path.join(workspace, 'existing-analytics.md'), existingAnalytics);
            console.log(`[Agent Runner] Existing analytics written to workspace for agent access`);
        }

        // Build autonomous analytics prompt
        const analyticsPrompt = `You are an App Store analytics integrator for "${primaryApp.name}".

## IMPORTANT: API Limitations

App Store Connect API v1 does NOT provide downloads, active users, or session data via REST endpoints.
These metrics require the complex async Analytics Reports workflow (not implemented yet).

## What IS Available

- App metadata (name, version, bundle ID, release history)
- Customer reviews and ratings (★ ratings, review text, sentiment)
- App Store versions and states

## Your Task

1. Fetch available App Store data:
   - \`list_apps\` - Confirm app exists
   - \`get_app_analytics\` with appId="${primaryApp.id}" - Get app metadata and version history (NOT downloads/sessions)
   - \`list_customer_reviews\` with appId="${primaryApp.id}" and limit=100 - Get ratings and user feedback

${existingAnalytics ? `2. Read existing analytics:
   - Use \`Read\` to read \`existing-analytics.md\`

3. IMMEDIATELY write updated report to \`analytics-report.md\`:
   - Copy entire existing content
   - Update Executive Summary to mention App Store presence
   - Add "## App Store Performance" section with:
     - App version history
     - ⭐ Star rating and review count
     - Review sentiment analysis (positive/negative themes)
     - Recent user feedback highlights
   - Be honest that downloads/sessions aren't available via API` : `2. Write new report to \`analytics-report.md\`:
   - Executive Summary
   - App Store Performance section
   - Focus on ratings, reviews, and version history`}

**Format Example:**

## App Store Performance
**App:** ${primaryApp.name}
**Bundle ID:** ${primaryApp.bundle_id || 'N/A'}
**Latest Version:** [from get_app_analytics version history]

### User Reception
- **App Store Rating:** [X.X] ⭐ (based on [N] reviews)
- **Recent Reviews:** [Positive: X% | Negative: X%]
- **Common Feedback:**
  - Positive: [themes from 5-star reviews]
  - Negative: [themes from 1-2 star reviews]

### Version History
- [List recent versions with release dates]

### API Limitation Note
Downloads, active users, and session metrics are not available via App Store Connect REST API v1.
These require the async Analytics Reports workflow. Use App Store Connect web interface for full analytics.

**DO IT NOW - fetch the 3 tools, then write the file immediately.**`;


        // Log analysis start
        await saveExecutionLog(executionRecord.id, {
            log_level: 'info',
            stage: 'analyzing',
            message: 'Fetching App Store analytics with MCP tools',
        });

        // Execute the agent
        const result = await executeTask(analyticsPrompt, {
            cwd: workspace,
            maxTurns: context.maxTurns || 50,
            mcpServers: context.mcpServers,
            onProgress: async (progress) => {
                if (progress.stage === 'tool_use' && progress.tool) {
                    console.log(`[Agent Runner] 🔧 Using App Store tool: ${progress.tool}`);
                    await saveExecutionLog(executionRecord.id, {
                        log_level: 'info',
                        stage: 'analyzing',
                        message: `Using App Store tool: ${progress.tool}`,
                        metadata: { tool: progress.tool }
                    });
                }
            }
        });

        if (!result.success) {
            throw new Error(result.error || 'App Store analytics analysis failed');
        }

        console.log(`[Agent Runner] Claude analysis complete`);

        // Read the analytics report
        const reportPath = path.join(workspace, 'analytics-report.md');
        let analyticsContent = null;

        try {
            analyticsContent = await fs.readFile(reportPath, 'utf-8');
            console.log(`[Agent Runner] ✓ Analytics report read from file (${analyticsContent.length} characters)`);
        } catch (error) {
            console.error('[Agent Runner] ❌ Failed to read analytics-report.md');
            throw new Error('Agent did not write analytics-report.md file. The agent must use the Write tool to create this file.');
        }

        // Validate report content
        const trimmed = analyticsContent.trim();
        if (!trimmed.startsWith('# ') || trimmed.length < 500) {
            throw new Error('Analytics report is invalid. Must start with "# " header and be at least 500 characters.');
        }

        console.log(`[Agent Runner] ✓ Report validated`);

        // Calculate metrics
        const duration = Date.now() - startTime;
        const cost = result.metadata?.cost_usd || 0;
        const turns = result.metadata?.num_turns || 0;

        // Save to document store (analytics_md)
        await saveExecutionLog(executionRecord.id, {
            log_level: 'info',
            stage: 'saving',
            message: 'Saving updated analytics report to document store',
        });

        const { updateDocument } = require('./document-store');
        await updateDocument(userId, 'analytics_md', analyticsContent);

        console.log(`[Agent Runner] ✓ App Store Analytics integrated into analytics.md`);

        // Extract summary for task summary
        const extractSummary = (content) => {
            const execMatch = content.match(/##\s*Executive\s*Summary\s*\n\n?([^\n]+(?:\n(?!##)[^\n]+)*)/i);
            if (execMatch) {
                return execMatch[1].trim().substring(0, 300);
            }
            return `Integrated App Store analytics for ${primaryApp.name} into analytics report`;
        };

        const summaryDescription = extractSummary(analyticsContent);

        // Update execution record
        await updateModuleExecution(executionRecord.id, {
            status: 'completed',
            completed_at: new Date(),
            duration_ms: duration,
            cost_usd: cost,
            metadata: {
                app_name: primaryApp.name,
                app_id: primaryApp.id,
                analytics_length: analyticsContent.length,
                had_existing_analytics: !!existingAnalytics,
                turns,
            },
        });

        // Create task summary
        await createTaskSummary(userId, {
            title: `App Store Analytics: ${primaryApp.name}`,
            description: summaryDescription,
            status: 'completed',
            execution_id: executionRecord.id,
            module_id: module.id,
            cost_usd: cost,
            duration_ms: duration,
            num_turns: turns,
            completed_at: new Date(),
        });

        console.log(`[Agent Runner] ✅ App Store Analytics Integrator completed`);
        console.log(`   - App: ${primaryApp.name}`);
        console.log(`   - Duration: ${(duration / 1000).toFixed(2)}s`);
        console.log(`   - Cost: $${cost.toFixed(4)}`);
        console.log(`   - Turns: ${turns}`);

        return {
            success: true,
            execution_id: executionRecord.id,
            duration_ms: duration,
            cost_usd: cost,
            analytics_length: analyticsContent.length,
        };

    } catch (error) {
        console.error(`[Agent Runner] ❌ App Store Analytics error:`, error.message);

        const duration = Date.now() - startTime;

        // Log error
        await saveExecutionLog(executionRecord.id, {
            log_level: 'error',
            stage: 'failed',
            message: `App Store Analytics failed: ${error.message}`,
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
    } finally {
        // Cleanup workspace (only if it was created)
        if (workspace) {
            try {
                await fs.rm(workspace, { recursive: true, force: true });
                console.log(`[Agent Runner] 🧹 Workspace cleaned up`);
            } catch (cleanupError) {
                console.warn(`[Agent Runner] Warning: Failed to cleanup workspace: ${cleanupError.message}`);
            }
        }
    }
}

module.exports = {
    runModule,
    prepareModuleContext,
};
