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
    taskExistsForExecution,
} = require('../db');
const { getGitHubToken, getGmailToken, getSlackToken, getSlackTokens, getSentryToken, getAppStoreConnectConnection, getMetaAdsConnection, getRenderApiKey, getRenderConnection } = require('../db');
const { decryptToken } = require('../utils/encryption');
const { generateTaskSummary } = require('./summary-generator');
const { summarizeRecentEmails } = require('./email-summarizer');
const { setupGmailMCPCredentials, cleanupGmailMCPCredentials } = require('./gmail-mcp-setup');
const { runDataAgent } = require('./data-agent');
const { getDocumentStore } = require('./document-store');
const { runAgentWithTask } = require('./agent-executor');

/**
 * Run a module and track its execution
 * @param {number} moduleId - The module ID to execute
 * @param {number} userId - The user ID who owns the module
 * @param {Object} options - Execution options
 * @param {string} options.trigger_type - How was this triggered? ('manual', 'scheduled', 'auto')
 * @param {number} options.agentId - Agent ID (for agent execution)
 * @param {number} options.taskId - Task ID (for agent execution)
 * @returns {Promise<Object>} Execution result
 */
async function runModule(moduleId, userId, options = {}) {
    // Check if this is an agent execution (task-driven)
    if (options.agentId && options.taskId) {
        console.log(`[Agent Runner] Routing to agent executor: Agent ${options.agentId}, Task ${options.taskId}`);
        return await runAgentWithTask(options.agentId, options.taskId, userId, options);
    }

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

        if (module.type === 'all_analytics') {
            return await runAllAnalyticsModule(module, userId, executionRecord, startTime);
        }

        if (module.type === 'analytics_sub_agents') {
            return await runAnalyticsSubAgentsModule(module, userId, executionRecord, startTime);
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

        // 4. Create persistent workspace for this module (same path for session resumption)
        const workspace = path.join(
            process.cwd(),
            'temp',
            'module-sessions',
            `module-${module.id}`
        );
        await fs.mkdir(workspace, { recursive: true });

        console.log(`[Agent Runner] Workspace: ${workspace}`);

        // 5. Check for existing session_id to enable continuous learning
        const resumeSessionId = module.session_id || null;
        if (resumeSessionId) {
            console.log(`[Agent Runner] ♻️  Module has existing session - will resume for continuous learning`);
        } else {
            console.log(`[Agent Runner] 🆕 First run for this module - creating new session`);
        }

        // Track new session ID if this is first run
        let newSessionId = null;

        // 6. Execute task using Claude Agent SDK
        console.log(`[Agent Runner] 🤖 Starting AI execution...`);
        console.log(`[Agent Runner] Prompt: ${context.prompt.substring(0, 100)}...`);

        // Build executeTask options
        const executeOptions = {
            cwd: workspace,
            maxTurns: context.maxTurns || 20,
            mcpServers: context.mcpServers,
            resumeSessionId,  // Pass session ID for resumption
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

                    // Capture session ID for first-time sessions
                    if (progress.sessionId && !resumeSessionId) {
                        newSessionId = progress.sessionId;
                        console.log(`[Agent Runner] 📝 New session ID captured: ${newSessionId}`);
                    }
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
        };

        // Add claudeMd parameter if Brain CEO module (loads vision/goals as system prompt)
        if (context.claudeMd) {
            executeOptions.claudeMd = context.claudeMd;
            console.log('[Agent Runner] Including claudeMd system prompt (vision/goals)');
        }

        const result = await executeTask(context.prompt, executeOptions);

        console.log(`[Agent Runner] ✓ AI execution completed. Success: ${result.success}`);

        // 6. Workspace preserved for session continuity
        console.log(`[Agent Runner] ✓ Workspace preserved for session continuity`);

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
                session_id: result.metadata?.session_id || newSessionId,
                resumed_from_session: !!resumeSessionId,
            },
            error_message: result.success ? null : result.error,
        });

        // 7.1. Save new session ID to module for future runs (continuous learning)
        if (newSessionId && !resumeSessionId && result.success) {
            console.log(`[Agent Runner] 💾 Saving session ID to module for future runs...`);
            const { updateModuleSessionId } = require('../db');
            await updateModuleSessionId(module.id, newSessionId);
            console.log(`[Agent Runner] ✅ Session ID saved - future runs will resume from this session`);
        }

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

        // 8. Create task summary for the feed if successful (fallback if agent didn't post one)
        if (result.success) {
            try {
                // Check if agent already created a dashboard summary via log_activity
                const taskAlreadyExists = await taskExistsForExecution(executionRecord.id);

                if (taskAlreadyExists) {
                    console.log(`[Agent Runner] ℹ️  Agent already posted dashboard summary via log_activity - skipping AI generation`);
                } else {
                    console.log(`[Agent Runner] 📝 No dashboard summary posted by agent - generating AI fallback summary...`);

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

                    console.log(`[Agent Runner] ✅ AI fallback task summary created for user ${userId}`);
                }
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

    // 4. For Brain CEO module, load vision and goals as claudeMd system prompt
    let claudeMd = null;
    if (module.type === 'brain_ceo') {
        console.log('[Agent Runner] Brain CEO module detected - loading vision and goals as claudeMd');
        try {
            const documents = await getDocumentStore(userId);
            if (documents) {
                // Combine vision and goals into a single markdown document
                const visionMd = documents.vision_md || '# Company Vision\n\n(No vision document defined yet)';
                const goalsMd = documents.goals_md || '# Company Goals\n\n(No goals defined yet)';

                claudeMd = `${visionMd}\n\n---\n\n${goalsMd}`;
                console.log(`[Agent Runner] Loaded vision and goals (${claudeMd.length} chars)`);
            } else {
                console.warn('[Agent Runner] No document store found for user - using default vision/goals');
                claudeMd = `# Company Vision\n\n(No vision document defined yet)\n\n---\n\n# Company Goals\n\n(No goals defined yet)`;
            }
        } catch (err) {
            console.error('[Agent Runner] Failed to load document store:', err);
            claudeMd = `# Company Vision\n\n(Error loading vision)\n\n---\n\n# Company Goals\n\n(Error loading goals)`;
        }
    }

    return {
        prompt,
        mcpServers,
        maxTurns,
        claudeMd,
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

    // Add current date for agent context
    const currentDate = new Date();
    const formattedDate = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD
    const fullDateString = currentDate.toDateString(); // e.g., "Tue Nov 05 2025"

    let prompt = `
${goal}
${additionalContext}

## Current Date & Time

**Today's date:** ${fullDateString} (${formattedDate})
**Current time:** ${currentDate.toISOString()}

When searching for "today's" emails or data, use the date **${formattedDate}** in your queries.

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
        } else if (mcpName === 'slack') {
            // Custom Slack MCP - uses both bot and user tokens via Slack Web API
            // Built in-house to work with OAuth tokens (xoxb- and xoxp-)
            const tokens = await getSlackTokens(userId);
            if (tokens) {
                const botToken = decryptToken(tokens.bot);
                const userToken = tokens.user ? decryptToken(tokens.user) : null;

                const serverPath = require('path').join(__dirname, 'slack-custom-mcp-server.js');

                // Security: Pass tokens via environment variables instead of command-line args
                // Command-line args are visible in process listings (ps, pstree)
                // TODO: Consider using temporary credential files with 0600 permissions for even better security
                const env = {
                    SLACK_BOT_TOKEN: botToken,
                };

                if (userToken) {
                    env.SLACK_USER_TOKEN = userToken;
                    console.log('[Agent Runner] Configured custom Slack MCP server with bot AND user tokens (full channel access)');
                } else {
                    console.log('[Agent Runner] Configured custom Slack MCP server with bot token only (limited to channels bot is member of)');
                    console.log('[Agent Runner] 💡 Tip: Reconnect Slack to enable automatic access to all public channels without manual bot invites');
                }

                mcpServers.slack = {
                    command: 'node',
                    args: [serverPath],
                    env: env,
                };
            } else {
                console.warn('[Agent Runner] Slack MCP requested but user has no Slack connection');
            }
        } else if (mcpName === 'sentry') {
            // Custom Sentry MCP server - uses direct REST API, no OpenAI required
            // Built in-house to avoid the official server's OpenAI schema bugs
            const encryptedToken = await getSentryToken(userId);
            if (encryptedToken) {
                const token = decryptToken(encryptedToken);
                const serverPath = require('path').join(__dirname, 'sentry-custom-mcp-server.js');

                // Security: Pass token via environment variable instead of command-line args
                mcpServers.sentry = {
                    command: 'node',
                    args: [serverPath],
                    env: {
                        SENTRY_ACCESS_TOKEN: token,
                    },
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

                // Security: Pass credentials via environment variables instead of command-line args
                mcpServers.appstore_connect = {
                    command: 'node',
                    args: [serverPath],
                    env: {
                        APPSTORE_KEY_ID: connection.key_id,
                        APPSTORE_ISSUER_ID: connection.issuer_id,
                        APPSTORE_PRIVATE_KEY: privateKey,
                    },
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

                    // Security: Pass credentials via environment variables instead of command-line args
                    mcpServers.meta_ads = {
                        command: 'node',
                        args: [serverPath],
                        env: {
                            META_ACCESS_TOKEN: accessToken,
                            META_AD_ACCOUNT_ID: adAccountId,
                        },
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
        } else if (mcpName === 'reports') {
            // Custom Reports MCP server - allows agents to save and query business reports
            // No OAuth tokens needed - uses database directly with user_id scope
            const serverPath = require('path').join(__dirname, 'reports-custom-mcp-server.js');
            mcpServers.reports = {
                command: 'node',
                args: [serverPath, `--user-id=${userId}`],
            };
            console.log('[Agent Runner] Configured Reports MCP server (database-backed)');
        } else if (mcpName === 'tasks') {
            // Custom Task Management MCP server - allows agents to manage task workflow
            // Agents can create suggestions, approve, start, block, resume, and complete tasks
            // No OAuth tokens needed - uses database directly with user_id scope
            const serverPath = require('path').join(__dirname, 'task-management-mcp-server.js');
            const args = [`--user-id=${userId}`];

            // Optionally pass module ID for task assignment context
            if (module && module.id) {
                args.push(`--module-id=${module.id}`);
            }

            mcpServers.tasks = {
                command: 'node',
                args: [serverPath, ...args],
            };
            console.log(`[Agent Runner] Configured Task Management MCP server (database-backed, module: ${module?.id || 'none'})`);
        } else if (mcpName === 'capabilities') {
            // Custom Capabilities MCP server - allows agents to query system capabilities
            // Exposes available modules, their tools, and MCP server catalog
            // No OAuth tokens needed - uses database directly with user_id scope
            const serverPath = require('path').join(__dirname, 'capabilities-custom-mcp-server.js');
            mcpServers.capabilities = {
                command: 'node',
                args: [serverPath, `--user-id=${userId}`],
            };
            console.log('[Agent Runner] Configured Capabilities MCP server (system introspection)');
        }
        // Add more MCP server types here (notion, etc.)
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

        // Create persistent workspace for this module (same path for session resumption)
        // Using module ID instead of execution ID so sessions can resume with same cwd
        const workspace = path.join(
            process.cwd(),
            'temp',
            'module-sessions',
            `module-${module.id}`
        );
        await fs.mkdir(workspace, { recursive: true });

        console.log(`[Agent Runner] Workspace: ${workspace}`);

        // Clone or update GitHub repository if configured
        let repoPath = null;
        if (primaryRepo) {
            try {
                const { execSync } = require('child_process');
                repoPath = path.join(workspace, 'repo');

                // Check if repo already exists (from previous session)
                try {
                    await fs.access(repoPath);
                    console.log(`[Agent Runner] Updating existing repository: ${primaryRepo.full_name}...`);

                    await saveExecutionLog(executionRecord.id, {
                        log_level: 'info',
                        stage: 'setup',
                        message: `Updating repository: ${primaryRepo.full_name}`,
                    });

                    // Pull latest changes
                    execSync(`git -C ${repoPath} pull origin`, {
                        stdio: 'pipe',
                        timeout: 60000,
                    });

                    console.log(`[Agent Runner] Repository updated successfully`);
                } catch {
                    // Repo doesn't exist, clone it
                    console.log(`[Agent Runner] Cloning repository: ${primaryRepo.full_name}...`);

                    await saveExecutionLog(executionRecord.id, {
                        log_level: 'info',
                        stage: 'setup',
                        message: `Cloning repository: ${primaryRepo.full_name}`,
                    });

                    // Clone repo with depth=1 for faster cloning
                    execSync(`git clone --depth 1 https://github.com/${primaryRepo.full_name} ${repoPath}`, {
                        stdio: 'pipe',
                        timeout: 60000,
                    });

                    console.log(`[Agent Runner] Repository cloned successfully to: ${repoPath}`);
                }

                await saveExecutionLog(executionRecord.id, {
                    log_level: 'info',
                    stage: 'setup',
                    message: 'Repository ready',
                });
            } catch (error) {
                console.warn(`[Agent Runner] Failed to setup repository: ${error.message}`);
                await saveExecutionLog(executionRecord.id, {
                    log_level: 'warning',
                    stage: 'setup',
                    message: `Failed to setup repository: ${error.message}. Continuing with GitHub MCP only.`,
                });
                repoPath = null; // Reset if setup failed
            }
        }

        // Build daily analytics prompt focused on today's metrics only
        const today = new Date().toISOString().split('T')[0];
        const analyticsPrompt = `You are a daily metrics reporter for "${primaryService.name}".

**📅 TODAY'S DATE: ${today}**

## Your Task

Generate a daily metrics report for **${today}** - but ONLY if one doesn't exist yet.

---

## ⚠️ CRITICAL FIRST STEP - Check for Existing Report

**BEFORE doing anything else, you MUST check if a report already exists for today:**

1. Use the \`get_reports_by_date\` tool from Reports MCP:
   - report_date: "${today}"
   - report_type: "render_analytics"

2. **If a report EXISTS for ${today}:**
   - Respond: "✓ Report already exists for ${today}. No action needed."
   - STOP immediately - do NOT create a duplicate report
   - This is the correct behavior when running multiple times on the same day

3. **If NO report exists for ${today}:**
   - This is a NEW day (or first run) - proceed to create fresh report
   - Continue with the steps below

---

## Tools Available

**Reports MCP (check/save reports):**
- \`get_reports_by_date\` - Check if report exists for a date
- \`create_report\` - Save new report to database

**Render MCP (query production data):**
- \`list_postgres_instances\` - Find production database
- \`get_postgres\` - Get database connection details
- \`query_render_postgres\` - Run read-only SQL queries

## Process (If No Report Exists)

1. **Find the database**: Use \`list_postgres_instances\` and \`get_postgres\`

2. **Query TODAY'S metrics** (past 24 hours):
   - Total users: \`SELECT COUNT(*) FROM users\`
   - Active modules: \`SELECT COUNT(*) FROM modules WHERE is_active = true\`
   - Executions today: \`SELECT COUNT(*) FROM module_executions WHERE created_at >= NOW() - INTERVAL '24 hours'\`
   - Success rate: \`SELECT status, COUNT(*) FROM module_executions WHERE created_at >= NOW() - INTERVAL '24 hours' GROUP BY status\`
   - Total cost today: \`SELECT SUM(cost_usd) FROM module_executions WHERE created_at >= NOW() - INTERVAL '24 hours'\`

3. **Generate a SHORT report** (under 20 lines) with just the numbers

## Report Format

# Daily Metrics - ${today}
**Database:** [postgres name]

## Key Metrics (24h)
- **Users:** [count]
- **Active Modules:** [count]
- **Executions:** [count] ([X]% success rate)
- **Cost:** $[amount] USD
- **Most Active Module:** [name] ([X] runs)

---

## Final Step - Save Report

Save to Reports database using \`create_report\` tool:
- name: "Daily Metrics Report"
- report_type: "render_analytics"
- report_date: "${today}"
- content: The full markdown report (paste entire report here)
- metadata: { "users": [count], "executions": [count], "cost_usd": [amount] }

**IMPORTANT:**
- TODAY'S DATA ONLY (${today}) - no historical analysis
- KEEP IT SHORT - just the facts
- DO NOT write to files - save directly to database with create_report
- Work fast - don't overthink it`;

        // Log analysis start
        await saveExecutionLog(executionRecord.id, {
            log_level: 'info',
            stage: 'analyzing',
            message: 'Claude is analyzing Render metrics with MCP tools',
        });

        // Check for existing session_id to enable continuous learning
        const resumeSessionId = module.session_id || null;
        if (resumeSessionId) {
            console.log(`[Agent Runner] ♻️  Module has existing session - will resume for continuous learning`);
        } else {
            console.log(`[Agent Runner] 🆕 First run for this module - creating new session`);
        }

        // Track new session ID if this is first run
        let newSessionId = null;

        // Execute Claude Agent with Render MCP
        const result = await executeTask(analyticsPrompt, {
            cwd: workspace,
            maxTurns: context.maxTurns || 25,
            mcpServers: context.mcpServers,
            skipFileCollection: true,
            resumeSessionId,  // Pass session ID for resumption
            onProgress: async (progress) => {
                if (progress.stage === 'tool_use') {
                    await saveExecutionLog(executionRecord.id, {
                        log_level: 'info',
                        stage: 'analyzing',
                        message: `Using Render tool: ${progress.tool}`,
                        metadata: { tool: progress.tool }
                    });
                } else if (progress.stage === 'initialized') {
                    console.log(`[Agent Runner] ✓ Session initialized with model: ${progress.model}`);

                    // Capture session ID for first-time sessions
                    if (progress.sessionId && !resumeSessionId) {
                        newSessionId = progress.sessionId;
                        console.log(`[Agent Runner] 📝 New session ID captured: ${newSessionId}`);
                    }
                }
            }
        });

        if (!result.success) {
            throw new Error(result.error || 'Render analytics analysis failed');
        }

        console.log(`[Agent Runner] Claude analysis complete`);

        // Calculate metrics
        const duration = Date.now() - startTime;
        const cost = result.metadata?.cost_usd || 0;
        const turns = result.metadata?.num_turns || 0;

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
                turns,
                session_id: result.metadata?.session_id || newSessionId,
                resumed_from_session: !!resumeSessionId,
                note: 'Report saved to database via Reports MCP during execution'
            },
        });

        // Save new session ID to module for future runs (continuous learning)
        if (newSessionId && !resumeSessionId && result.success) {
            console.log(`[Agent Runner] 💾 Saving session ID to module for future runs...`);
            const { updateModuleSessionId } = require('../db');
            await updateModuleSessionId(module.id, newSessionId);
            console.log(`[Agent Runner] ✅ Session ID saved - future runs will resume from this session`);
        }

        return {
            success: true,
            execution_id: executionRecord.id,
            duration_ms: duration,
            cost_usd: cost,
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
        // Keep workspace persistent for session resumption
        // Workspace is reused across executions to maintain session continuity
        console.log(`[Agent Runner] ✓ Workspace preserved for session continuity`);
    }
}

/**
 * Run App Store Analytics module
 * Fetches App Store Connect analytics and integrates into analytics.md
 */
async function runAppStoreAnalyticsModule(module, userId, executionRecord, startTime) {
    const fs = require('fs').promises;

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

        // Prepare context with App Store Connect MCP + Reports MCP
        const context = await prepareModuleContext(module, userId);

        // Create persistent workspace for this module (same path for session resumption)
        const workspace = path.join(
            process.cwd(),
            'temp',
            'module-sessions',
            `module-${module.id}`
        );
        await fs.mkdir(workspace, { recursive: true });

        console.log(`[Agent Runner] Workspace: ${workspace}`);

        // Build analytics prompt with Reports MCP
        const today = new Date().toISOString().split('T')[0];
        const analyticsPrompt = `You are an App Store analytics reporter for "${primaryApp.name}".

**📅 TODAY'S DATE: ${today}**

## Your Task

Generate an App Store analytics report for **${today}** - but ONLY if one doesn't exist yet.

---

## ⚠️ CRITICAL FIRST STEP - Check for Existing Report

**BEFORE doing anything else, you MUST check if a report already exists for today:**

1. Use the \`get_reports_by_date\` tool from Reports MCP:
   - report_date: "${today}"
   - report_type: "appstore_analytics"

2. **If a report EXISTS for ${today}:**
   - Respond: "✓ Report already exists for ${today}. No action needed."
   - STOP immediately - do NOT create a duplicate report

3. **If NO report exists for ${today}:**
   - This is a NEW day (or first run) - proceed to create fresh report

---

## Tools Available

**Reports MCP (check/save reports):**
- \`get_reports_by_date\` - Check if report exists for a date
- \`create_report\` - Save new report to database

**App Store Connect MCP (query app data):**
- \`list_apps\` - Confirm app exists
- \`get_app_analytics\` - Get app metadata and version history
- \`list_customer_reviews\` - Get ratings and user feedback

## IMPORTANT: API Limitations

App Store Connect API v1 does NOT provide downloads, active users, or session data via REST endpoints.
These metrics require the complex async Analytics Reports workflow.

## What IS Available

- App metadata (name, version, bundle ID, release history)
- Customer reviews and ratings (★ ratings, review text, sentiment)
- App Store versions and states

## Process (If No Report Exists)

1. Fetch available App Store data:
   - \`list_apps\` - Confirm app exists
   - \`get_app_analytics\` with appId="${primaryApp.id}" - Get app metadata and version history
   - \`list_customer_reviews\` with appId="${primaryApp.id}" and limit=100 - Get ratings and feedback

2. Generate a report with this structure:

# App Store Analytics - ${today}
**App:** ${primaryApp.name}
**Bundle ID:** ${primaryApp.bundle_id || 'N/A'}

## App Store Performance

### Version Info
- **Latest Version:** [from get_app_analytics]
- **Release Date:** [date]

### User Reception
- **App Store Rating:** [X.X] ⭐ (based on [N] reviews)
- **Recent Reviews:** [Positive: X% | Negative: X%]
- **Common Feedback:**
  - Positive: [themes from 5-star reviews]
  - Negative: [themes from 1-2 star reviews]

### Recent Version History
- [List recent versions with release dates]

### API Limitation Note
Downloads, active users, and session metrics are not available via App Store Connect REST API v1.
These require the async Analytics Reports workflow.

## Final Step - Save Report

Save to Reports database using \`create_report\` tool:
- name: "App Store Analytics Report"
- report_type: "appstore_analytics"
- report_date: "${today}"
- content: The full markdown report
- metadata: { "app_name": "${primaryApp.name}", "app_id": "${primaryApp.id}", "rating": [X.X], "review_count": [N] }

**IMPORTANT:**
- TODAY'S DATA ONLY (${today})
- DO NOT write to files - save directly to database with create_report
- Work efficiently`;

        // Log analysis start
        await saveExecutionLog(executionRecord.id, {
            log_level: 'info',
            stage: 'analyzing',
            message: 'Fetching App Store analytics with MCP tools',
        });

        // Check for existing session_id to enable continuous learning
        const resumeSessionId = module.session_id || null;
        if (resumeSessionId) {
            console.log(`[Agent Runner] ♻️  Module has existing session - will resume for continuous learning`);
        } else {
            console.log(`[Agent Runner] 🆕 First run for this module - creating new session`);
        }

        // Track new session ID if this is first run
        let newSessionId = null;

        // Execute the agent
        const result = await executeTask(analyticsPrompt, {
            cwd: workspace,
            maxTurns: context.maxTurns || 50,
            mcpServers: context.mcpServers,
            skipFileCollection: true,
            resumeSessionId,
            onProgress: async (progress) => {
                if (progress.stage === 'tool_use' && progress.tool) {
                    console.log(`[Agent Runner] 🔧 Using tool: ${progress.tool}`);
                    await saveExecutionLog(executionRecord.id, {
                        log_level: 'info',
                        stage: 'analyzing',
                        message: `Using tool: ${progress.tool}`,
                        metadata: { tool: progress.tool }
                    });
                } else if (progress.stage === 'initialized') {
                    console.log(`[Agent Runner] ✓ Session initialized with model: ${progress.model}`);

                    // Capture session ID for first-time sessions
                    if (progress.sessionId && !resumeSessionId) {
                        newSessionId = progress.sessionId;
                        console.log(`[Agent Runner] 📝 New session ID captured: ${newSessionId}`);
                    }
                }
            }
        });

        if (!result.success) {
            throw new Error(result.error || 'App Store analytics analysis failed');
        }

        console.log(`[Agent Runner] Claude analysis complete`);

        // Calculate metrics
        const duration = Date.now() - startTime;
        const cost = result.metadata?.cost_usd || 0;
        const turns = result.metadata?.num_turns || 0;

        console.log(`[Agent Runner] ✅ App Store Analytics Integrator completed`);
        console.log(`   - App: ${primaryApp.name}`);
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
                app_name: primaryApp.name,
                app_id: primaryApp.id,
                turns,
                session_id: result.metadata?.session_id || newSessionId,
                resumed_from_session: !!resumeSessionId,
                note: 'Report saved to database via Reports MCP during execution'
            },
        });

        // Save new session ID to module for future runs (continuous learning)
        if (newSessionId && !resumeSessionId && result.success) {
            console.log(`[Agent Runner] 💾 Saving session ID to module for future runs...`);
            const { updateModuleSessionId } = require('../db');
            await updateModuleSessionId(module.id, newSessionId);
            console.log(`[Agent Runner] ✅ Session ID saved - future runs will resume from this session`);
        }

        // Keep workspace persistent for session resumption
        console.log(`[Agent Runner] ✓ Workspace preserved for session continuity`);

        return {
            success: true,
            execution_id: executionRecord.id,
            duration_ms: duration,
            cost_usd: cost,
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
    }
}

/**
 * Run All Analytics module
 * Aggregates metrics from all connected sources into unified analytics files
 */
async function runAllAnalyticsModule(module, userId, executionRecord, startTime) {
    const crypto = require('crypto');
    const fs = require('fs').promises;
    let workspace;

    try {
        console.log(`[Agent Runner] 📊 Running All Analytics module`);

        await saveExecutionLog(executionRecord.id, {
            log_level: 'info',
            stage: 'started',
            message: 'Starting comprehensive analytics aggregation',
        });

        // Check which services are connected
        const { getServiceConnectionsByUserId } = require('../db');
        const allConnections = await getServiceConnectionsByUserId(userId);

        const availableServices = {};
        const requestedServices = ['slack', 'meta_ads', 'appstore_connect', 'sentry', 'gmail', 'render', 'github'];

        for (const serviceName of requestedServices) {
            const connection = allConnections.find(c => c.service_name === serviceName);
            availableServices[serviceName] = !!connection;
        }

        const connectedServices = Object.keys(availableServices).filter(s => availableServices[s]);
        const missingServices = Object.keys(availableServices).filter(s => !availableServices[s]);

        console.log(`[Agent Runner] Connected services: ${connectedServices.join(', ')}`);
        console.log(`[Agent Runner] Missing services: ${missingServices.join(', ')}`);

        await saveExecutionLog(executionRecord.id, {
            log_level: 'info',
            stage: 'setup',
            message: `Available data sources: ${connectedServices.join(', ')}`,
            metadata: { connectedServices, missingServices },
        });

        // Prepare context with all available MCPs
        const context = await prepareModuleContext(module, userId);

        // Use all configured MCP servers (prepareModuleContext already filtered them)
        const filteredMcpServers = context.mcpServers || {};

        console.log(`[Agent Runner] MCP servers configured: ${Object.keys(filteredMcpServers).length}`);
        console.log(`[Agent Runner] MCP server keys: ${Object.keys(filteredMcpServers).join(', ')}`);

        // Create workspace
        workspace = path.join(
            process.cwd(),
            'temp',
            'module-executions',
            `${executionRecord.id}-${crypto.randomBytes(4).toString('hex')}`
        );
        await fs.mkdir(workspace, { recursive: true });

        console.log(`[Agent Runner] Workspace created: ${workspace}`);

        // Build comprehensive analytics prompt
        const analyticsPrompt = `You are a comprehensive business analytics aggregator. Your mission is to collect key business metrics from all available data sources and create two files: analytics.md and analytics.json.

## Available Data Sources

You have access to the following services:
${connectedServices.map(s => `✅ ${s}`).join('\n')}

${missingServices.length > 0 ? `\nNOT CONNECTED (skip these):\n${missingServices.map(s => `❌ ${s}`).join('\n')}` : ''}

## Your Workflow

### Step 1: Collect Metrics from Each Available Source

${connectedServices.includes('slack') ? `**Slack:**
- Use list_channels to get all channels
- Use get_channel_history for past 24 hours
- Count total messages analyzed
- Identify action items and blockers from conversations
- Count active channels

` : ''}${connectedServices.includes('meta_ads') ? `**Meta Ads:**
- Use get_ad_account_insights with datePreset="last_7d"
- Get total spend, ROAS, impressions, clicks
- Use list_campaigns to count active campaigns
- Calculate key metrics (CPA, CTR)

` : ''}${connectedServices.includes('appstore_connect') ? `**App Store Connect:**
- Use get_analytics_report_instances to find latest report
- Use download_analytics_report to get metrics
- Extract downloads, revenue, active devices, sessions

` : ''}${connectedServices.includes('sentry') ? `**Sentry:**
- Use list_organizations and list_projects
- Use list_issues with query='is:unresolved'
- Count total bugs and critical bugs (high event count)
- Count projects monitored

` : ''}${connectedServices.includes('gmail') ? `**Gmail:**
- Use search_emails to find unread emails
- Analyze and count urgent/important emails
- Track total unread count

` : ''}${connectedServices.includes('render') ? `**Render Database:**
- First use mcp__render__list_postgres_instances to find the database
- Then use mcp__render__query_render_postgres with the postgresId to run SQL queries
- Query for: active users, new users this week, module executions (7d), AI costs (7d)
- Example queries:
  - \`SELECT COUNT(*) FROM users\` (total users)
  - \`SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '7 days'\` (new users)
  - \`SELECT COUNT(*), COALESCE(SUM(cost_usd), 0) FROM module_executions WHERE created_at > NOW() - INTERVAL '7 days'\` (executions and cost)
- **IMPORTANT**: Extract the postgresId from list_postgres_instances first!

` : ''}
### Step 2: Create analytics.md

**IMPORTANT**: Write files to the CURRENT WORKING DIRECTORY using RELATIVE paths only!
- Use \`Write("analytics.md")\` NOT \`Write("/Users/.../analytics.md")\`
- Use \`Write("analytics.json")\` NOT \`Write("/Users/.../analytics.json")\`

Write a **factual, concise** product analytics summary to analytics.md using the Write tool:

\`\`\`markdown
# Product Analytics Summary
**Generated**: ${new Date().toISOString()}
**Data Sources**: ${connectedServices.join(', ')}

## Executive Summary
[3-5 key findings about current product state - factual, no fluff]

## Product Metrics
- Active Users: [number or N/A]
- New Users (this week): [number or N/A]
- App Downloads: [number or N/A]
- Active Devices: [number or N/A]

## Revenue & Marketing
- Ad Spend (7d): $[amount or N/A]
- ROAS: [number or N/A]
- App Revenue: $[amount or N/A]
- Active Campaigns: [number or N/A]

## Product Health
- Critical Bugs: [number or N/A]
- Total Unresolved Bugs: [number or N/A]
- Sentry Projects: [number or N/A]

## Infrastructure & Operations
- Module Executions (7d): [number or N/A]
- AI API Costs (7d): $[amount or N/A]
- Slack Messages Analyzed: [number or N/A]

## Team Activity
- Blockers Identified: [number or N/A]
- Action Items: [number or N/A]
- Urgent Emails: [number or N/A]
- Important Emails: [number or N/A]

## Data Source Status
- ✅ Available: ${connectedServices.join(', ')}
${missingServices.length > 0 ? `- ❌ Not Connected: ${missingServices.join(', ')}` : ''}
\`\`\`

### Step 3: Create analytics.json

Write a **flat JSON object with business metrics only** to analytics.json using the Write tool:

\`\`\`json
{
  "timestamp": "${new Date().toISOString()}",
  "active_users": 150,
  "new_users_this_week": 23,
  "app_downloads": 342,
  "app_revenue_usd": 1250.50,
  "active_devices": 890,
  "ad_spend_usd": 450.00,
  "roas": 2.78,
  "active_campaigns": 5,
  "ad_impressions": 125000,
  "ad_clicks": 3400,
  "critical_bugs": 3,
  "total_bugs": 15,
  "sentry_projects": 2,
  "module_executions_7d": 89,
  "ai_cost_usd_7d": 45.20,
  "slack_messages_analyzed": 456,
  "slack_blockers": 7,
  "slack_action_items": 23,
  "urgent_emails": 5,
  "important_emails": 12,
  "unread_emails": 34
}
\`\`\`

**Use null for unavailable metrics** (not 0 unless truly zero).

## Critical Requirements

1. **Write both files**: Use Write tool with RELATIVE PATHS ONLY
   - Write("analytics.md") ✅
   - Write("analytics.json") ✅
   - Write("/Users/benbroca/analytics.md") ❌ WRONG
2. **Graceful degradation**: Skip unavailable services, use null for missing metrics
3. **Factual only**: No recommendations, just current state
4. **Business metrics**: Focus on numbers that matter to business health
5. **Latest data**: Use most recent time periods (today, past 7 days, this week)

**WRITE THE FILES NOW!** Don't overthink, just collect data and write both files to the CURRENT WORKING DIRECTORY.`;

        await saveExecutionLog(executionRecord.id, {
            log_level: 'info',
            stage: 'analyzing',
            message: 'Claude is aggregating analytics from all sources',
        });

        // Execute Claude Agent
        const result = await executeTask(analyticsPrompt, {
            cwd: workspace,
            maxTurns: context.maxTurns || 200,
            mcpServers: filteredMcpServers,
            skipFileCollection: true,
            onProgress: async (progress) => {
                if (progress.stage === 'tool_use') {
                    await saveExecutionLog(executionRecord.id, {
                        log_level: 'info',
                        stage: 'analyzing',
                        message: `Using tool: ${progress.tool}`,
                        metadata: { tool: progress.tool }
                    });
                }
            }
        });

        if (!result.success) {
            throw new Error(result.error || 'Analytics aggregation failed');
        }

        console.log(`[Agent Runner] Claude analysis complete`);

        // Read both files
        const mdPath = path.join(workspace, 'analytics.md');
        const jsonPath = path.join(workspace, 'analytics.json');

        let analyticsMarkdown = null;
        let analyticsJson = null;

        try {
            analyticsMarkdown = await fs.readFile(mdPath, 'utf-8');
            console.log(`[Agent Runner] ✓ analytics.md read (${analyticsMarkdown.length} characters)`);
        } catch (error) {
            throw new Error('Agent did not write analytics.md file. The agent must use the Write tool.');
        }

        try {
            const jsonContent = await fs.readFile(jsonPath, 'utf-8');
            analyticsJson = JSON.parse(jsonContent);
            console.log(`[Agent Runner] ✓ analytics.json read and parsed`);
        } catch (error) {
            throw new Error('Agent did not write analytics.json file or JSON is invalid.');
        }

        // Validate markdown
        const trimmed = analyticsMarkdown.trim();
        if (!trimmed.startsWith('# ') || trimmed.length < 200) {
            throw new Error('analytics.md is invalid. Must start with "# " and be at least 200 characters.');
        }

        // Calculate metrics
        const duration = Date.now() - startTime;
        const cost = result.metadata?.cost_usd || 0;
        const turns = result.metadata?.num_turns || 0;

        // Save to document store
        await saveExecutionLog(executionRecord.id, {
            log_level: 'info',
            stage: 'saving',
            message: 'Saving analytics to document store',
        });

        const { updateDocument } = require('./document-store');
        await updateDocument(userId, 'analytics_md', analyticsMarkdown);
        await updateDocument(userId, 'analytics_json', analyticsJson);

        console.log(`[Agent Runner] ✓ Analytics saved to document store (MD + JSON)`);

        // Update execution record
        await updateModuleExecution(executionRecord.id, {
            status: 'completed',
            completed_at: new Date(),
            duration_ms: duration,
            cost_usd: cost,
            metadata: {
                sources_connected: connectedServices,
                sources_missing: missingServices,
                analytics_md_length: analyticsMarkdown.length,
                turns,
            },
        });

        // Create task summary
        await createTaskSummary(userId, {
            title: 'All Analytics Dashboard Updated',
            description: `Aggregated business metrics from ${connectedServices.length} data sources: ${connectedServices.join(', ')}`,
            status: 'completed',
            serviceIds: allConnections.filter(c => connectedServices.includes(c.service_name)).map(c => c.id),
            execution_id: executionRecord.id,
            module_id: module.id,
            cost_usd: cost,
            duration_ms: duration,
            num_turns: turns,
            completed_at: new Date(),
        });

        console.log(`[Agent Runner] ✅ All Analytics module completed`);
        console.log(`   - Sources: ${connectedServices.length}/${requestedServices.length}`);
        console.log(`   - Duration: ${(duration / 1000).toFixed(2)}s`);
        console.log(`   - Cost: $${cost.toFixed(4)}`);
        console.log(`   - Turns: ${turns}`);

        return {
            success: true,
            execution_id: executionRecord.id,
            duration_ms: duration,
            cost_usd: cost,
            sources_connected: connectedServices.length,
        };

    } catch (error) {
        console.error(`[Agent Runner] ❌ All Analytics error:`, error.message);

        const duration = Date.now() - startTime;

        await saveExecutionLog(executionRecord.id, {
            log_level: 'error',
            stage: 'failed',
            message: `All Analytics failed: ${error.message}`,
        });

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

/**
 * Run Analytics Sub-Agents Demo module
 * Demonstrates sub-agent pattern: orchestrator delegates to specialized agents
 */
async function runAnalyticsSubAgentsModule(module, userId, executionRecord, startTime) {
    const crypto = require('crypto');
    const fs = require('fs').promises;
    let workspace;

    try {
        console.log(`[Agent Runner] 📊 Running Analytics Sub-Agents Demo module`);

        await saveExecutionLog(executionRecord.id, {
            log_level: 'info',
            stage: 'started',
            message: 'Starting sub-agent orchestration demo',
        });

        // 1. Create workspace
        workspace = path.join(
            process.cwd(),
            'temp',
            'module-executions',
            `${executionRecord.id}-${crypto.randomBytes(4).toString('hex')}`
        );
        await fs.mkdir(workspace, { recursive: true });

        console.log(`[Agent Runner] Workspace created: ${workspace}`);

        // 2. Create .claude/agents/ directory in workspace
        const agentsDir = path.join(workspace, '.claude', 'agents');
        await fs.mkdir(agentsDir, { recursive: true });

        console.log(`[Agent Runner] Created .claude/agents/ directory in workspace`);

        await saveExecutionLog(executionRecord.id, {
            log_level: 'info',
            stage: 'setup',
            message: 'Created .claude/agents/ directory for sub-agent discovery',
        });

        // 3. Parse agent markdown files and create agent definitions
        const renderAgentTemplate = path.join(process.cwd(), 'services', 'sub-agents', 'render-analytics.md');
        const sentryAgentTemplate = path.join(process.cwd(), 'services', 'sub-agents', 'sentry-bug-checker.md');

        const renderAgentContent = await fs.readFile(renderAgentTemplate, 'utf-8');
        const sentryAgentContent = await fs.readFile(sentryAgentTemplate, 'utf-8');

        // Parse markdown frontmatter and content
        const parseAgentMarkdown = (content) => {
            const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
            if (!frontmatterMatch) {
                throw new Error('Invalid agent markdown: missing frontmatter');
            }

            const frontmatter = {};
            const frontmatterLines = frontmatterMatch[1].split('\n');
            for (const line of frontmatterLines) {
                const [key, ...valueParts] = line.split(':');
                if (key && valueParts.length > 0) {
                    const value = valueParts.join(':').trim();
                    frontmatter[key.trim()] = value;
                }
            }

            const prompt = frontmatterMatch[2].trim();

            return {
                description: frontmatter.description || '',
                tools: frontmatter.tools ? frontmatter.tools.split(',').map(t => t.trim()) : undefined,
                prompt,
                model: frontmatter.model || 'sonnet'
            };
        };

        const renderAgent = parseAgentMarkdown(renderAgentContent);
        const sentryAgent = parseAgentMarkdown(sentryAgentContent);

        const agents = {
            'render-analytics': renderAgent,
            'sentry-bug-checker': sentryAgent
        };

        console.log(`[Agent Runner] Parsed render-analytics agent definition`);
        console.log(`[Agent Runner] Parsed sentry-bug-checker agent definition`);

        await saveExecutionLog(executionRecord.id, {
            log_level: 'info',
            stage: 'setup',
            message: 'Parsed 2 sub-agent definitions',
            metadata: { agents: ['render-analytics', 'sentry-bug-checker'] },
        });

        // 4. Clone GitHub repository if available (for render-analytics sub-agent)
        const { getServiceConnectionByName } = require('../db');
        const githubConnection = await getServiceConnectionByName(userId, 'github');
        const primaryRepo = githubConnection?.metadata?.primary_repo;

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

                execSync(`git clone --depth 1 https://github.com/${primaryRepo.full_name} ${repoPath}`, {
                    stdio: 'pipe',
                    timeout: 60000,
                });

                console.log(`[Agent Runner] Repository cloned successfully`);

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
                    message: `Failed to clone repository: ${error.message}. Continuing without repo.`,
                });
                repoPath = null;
            }
        } else {
            console.log(`[Agent Runner] No primary GitHub repo configured - sub-agents will work without it`);
        }

        // 5. Prepare MCP servers
        const context = await prepareModuleContext(module, userId);

        console.log(`[Agent Runner] MCP servers configured: ${Object.keys(context.mcpServers || {}).length}`);

        // 6. Build orchestrator prompt
        const orchestratorPrompt = context.prompt || module.config.goal || `
You are the main orchestrator for analytics aggregation using sub-agents.

## Your Mission
Coordinate 2 specialized sub-agents to gather comprehensive analytics, then synthesize their reports.

## Available Sub-Agents
1. **render-analytics** - Analyzes Render production database
2. **sentry-bug-checker** - Scans Sentry for bugs

## Your Workflow
1. Task(agent="render-analytics", prompt="Analyze production database and generate comprehensive report")
2. Task(agent="sentry-bug-checker", prompt="Scan Sentry projects and generate bug report")
3. Synthesize both reports into unified analytics.md
4. Use Write("analytics.md") to save

Remember: Use relative path "analytics.md" not absolute path.
`;

        await saveExecutionLog(executionRecord.id, {
            log_level: 'info',
            stage: 'orchestrating',
            message: 'Starting orchestrator agent with sub-agent delegation',
        });

        // 7. Execute orchestrator agent
        const result = await executeTask(orchestratorPrompt, {
            cwd: workspace,
            maxTurns: context.maxTurns || 200,
            mcpServers: context.mcpServers,
            agents, // Pass sub-agent definitions
            skipFileCollection: true,
            onProgress: async (progress) => {
                if (progress.stage === 'tool_use') {
                    await saveExecutionLog(executionRecord.id, {
                        log_level: 'info',
                        stage: 'orchestrating',
                        message: `Tool: ${progress.tool}`,
                        metadata: { tool: progress.tool, turn: progress.turnCount }
                    });
                }
            }
        });

        if (!result.success) {
            throw new Error(result.error || 'Sub-agent orchestration failed');
        }

        console.log(`[Agent Runner] Orchestrator agent completed`);

        // 8. Read analytics.md file
        const analyticsPath = path.join(workspace, 'analytics.md');
        let analyticsContent = null;

        try {
            analyticsContent = await fs.readFile(analyticsPath, 'utf-8');
            console.log(`[Agent Runner] ✓ analytics.md read (${analyticsContent.length} characters)`);
        } catch (error) {
            throw new Error('Orchestrator did not write analytics.md file. The orchestrator must synthesize sub-agent reports and use Write tool.');
        }

        // Validate report
        const trimmed = analyticsContent.trim();
        if (!trimmed.startsWith('# ') || trimmed.length < 200) {
            throw new Error('analytics.md is invalid. Must start with "# " and be at least 200 characters.');
        }

        console.log(`[Agent Runner] ✓ Report validated`);

        // 9. Calculate metrics
        const duration = Date.now() - startTime;
        const cost = result.metadata?.cost_usd || 0;
        const turns = result.metadata?.num_turns || 0;

        // 10. Save to document store
        await saveExecutionLog(executionRecord.id, {
            log_level: 'info',
            stage: 'saving',
            message: 'Saving synthesized analytics to document store',
        });

        const { updateDocument } = require('./document-store');
        await updateDocument(userId, 'analytics_md', analyticsContent);

        console.log(`[Agent Runner] ✓ Analytics saved to document store`);

        // 11. Update execution record
        await updateModuleExecution(executionRecord.id, {
            status: 'completed',
            completed_at: new Date(),
            duration_ms: duration,
            cost_usd: cost,
            metadata: {
                sub_agents_used: ['render-analytics', 'sentry-bug-checker'],
                analytics_md_length: analyticsContent.length,
                repo_cloned: !!repoPath,
                turns,
            },
        });

        // 12. Create task summary
        await createTaskSummary(userId, {
            title: 'Sub-Agent Analytics Demo Completed',
            description: `Orchestrator successfully coordinated 2 specialized sub-agents (Render Analytics + Sentry Bug Checker) and synthesized their reports into unified analytics.`,
            status: 'completed',
            serviceIds: [],
            execution_id: executionRecord.id,
            module_id: module.id,
            cost_usd: cost,
            duration_ms: duration,
            num_turns: turns,
            completed_at: new Date(),
        });

        console.log(`[Agent Runner] ✅ Analytics Sub-Agents Demo completed`);
        console.log(`   - Duration: ${(duration / 1000).toFixed(2)}s`);
        console.log(`   - Cost: $${cost.toFixed(4)}`);
        console.log(`   - Turns: ${turns}`);
        console.log(`   - Sub-agents: render-analytics, sentry-bug-checker`);

        return {
            success: true,
            execution_id: executionRecord.id,
            duration_ms: duration,
            cost_usd: cost,
            sub_agents_used: 2,
        };

    } catch (error) {
        console.error(`[Agent Runner] ❌ Analytics Sub-Agents error:`, error.message);

        const duration = Date.now() - startTime;

        await saveExecutionLog(executionRecord.id, {
            log_level: 'error',
            stage: 'failed',
            message: `Sub-agent orchestration failed: ${error.message}`,
        });

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
