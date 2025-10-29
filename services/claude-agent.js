/**
 * Claude Code SDK Wrapper
 * General-purpose service for executing coding tasks using Claude Code SDK
 */

const fs = require('fs').promises;
const path = require('path');

// Dynamic import for ES module
let claudeCodeSDK = null;

/**
 * Initialize Claude Agent SDK (lazy loading)
 */
async function initializeSDK() {
  if (!claudeCodeSDK) {
    try {
      claudeCodeSDK = await import('@anthropic-ai/claude-agent-sdk');
      console.log('[Claude Agent] SDK initialized successfully');
    } catch (error) {
      console.error('[Claude Agent] Failed to load SDK:', error.message);
      throw new Error('Claude Agent SDK not available');
    }
  }
  return claudeCodeSDK;
}

/**
 * Execute a coding task using Claude Code SDK
 * @param {string} prompt - The task description
 * @param {Object} options - Configuration options
 * @param {string} options.cwd - Working directory for file operations
 * @param {number} options.maxTurns - Maximum conversation turns (default: 10)
 * @param {string} options.model - Model to use (default: auto)
 * @param {Function} options.onMessage - Callback for streaming messages
 * @param {Function} options.onProgress - Callback for progress updates
 * @returns {Promise<Object>} Result with files, messages, and metadata
 */
async function executeTask(prompt, options = {}) {
  const startTime = Date.now();
  const {
    cwd = process.cwd(),
    maxTurns = 10,
    model,
    onMessage,
    onProgress
  } = options;

  try {
    console.log('[Claude Agent] Starting task execution');
    console.log(`[Claude Agent] Prompt: ${prompt.substring(0, 100)}...`);
    console.log(`[Claude Agent] Working directory: ${cwd}`);

    // Initialize SDK
    const { query } = await initializeSDK();

    // Prepare query options
    const queryOptions = {
      maxTurns,
      cwd,
      permissionMode: 'bypassPermissions'
    };

    if (model) {
      queryOptions.model = model;
    }

    // Track execution state
    const messages = [];
    const files = {};
    let totalCost = 0;
    let finalResult = null;
    let turnCount = 0;

    // Execute query with streaming
    console.log('[Claude Agent] Executing query...');

    for await (const message of query({
      prompt,
      options: queryOptions
    })) {
      messages.push(message);

      // Emit message to callback
      if (onMessage) {
        onMessage(message);
      }

      // Process different message types
      switch (message.type) {
        case 'system':
          if (message.subtype === 'init') {
            console.log(`[Claude Agent] Session initialized with model: ${message.model}`);
            if (onProgress) {
              onProgress({
                stage: 'initialized',
                model: message.model,
                sessionId: message.session_id
              });
            }
          }
          break;

        case 'assistant':
          // Track assistant messages
          if (message.message?.content) {
            message.message.content.forEach(content => {
              if (content.type === 'text') {
                console.log(`[Claude Agent] Assistant: ${content.text.substring(0, 100)}...`);
                if (onProgress) {
                  onProgress({
                    stage: 'thinking',
                    message: content.text
                  });
                }
              } else if (content.type === 'tool_use') {
                turnCount++;
                console.log(`[Claude Agent] Tool use: ${content.name}`);
                if (onProgress) {
                  onProgress({
                    stage: 'tool_use',
                    tool: content.name,
                    turnCount
                  });
                }
              }
            });
          }
          break;

        case 'result':
          finalResult = message;
          totalCost = message.total_cost_usd || 0;
          console.log(`[Claude Agent] Task completed in ${message.duration_ms}ms`);
          console.log(`[Claude Agent] Cost: $${totalCost.toFixed(6)}`);
          console.log(`[Claude Agent] Turns used: ${message.num_turns}`);

          if (message.is_error) {
            throw new Error(`Task failed: ${message.result}`);
          }

          if (onProgress) {
            onProgress({
              stage: 'completed',
              cost: totalCost,
              duration: message.duration_ms
            });
          }
          break;
      }
    }

    // Collect generated files
    const generatedFiles = await collectFiles(cwd);

    const duration = Date.now() - startTime;

    return {
      success: true,
      files: generatedFiles,
      messages,
      metadata: {
        duration_ms: duration,
        sdk_duration_ms: finalResult?.duration_ms,
        num_turns: finalResult?.num_turns || turnCount,
        cost_usd: totalCost,
        model: finalResult?.model,
        session_id: finalResult?.session_id,
        messages_count: messages.length
      }
    };

  } catch (error) {
    console.error('[Claude Agent] Error:', error);
    return {
      success: false,
      error: error.message || 'Task execution failed',
      files: {},
      messages: [],
      metadata: {
        duration_ms: Date.now() - startTime
      }
    };
  }
}

/**
 * Collect generated files from working directory
 * @param {string} dir - Directory to scan
 * @returns {Promise<Object>} Map of relative paths to file contents
 */
async function collectFiles(dir) {
  const files = {};

  try {
    const items = await fs.readdir(dir);

    for (const item of items) {
      // Skip common non-source directories
      if (['node_modules', '.git', 'dist', 'build'].includes(item)) {
        continue;
      }

      const fullPath = path.join(dir, item);
      const stat = await fs.stat(fullPath);

      if (stat.isFile()) {
        // Only collect source files
        const ext = path.extname(item);
        if (['.js', '.jsx', '.ts', '.tsx', '.json', '.md'].includes(ext)) {
          const content = await fs.readFile(fullPath, 'utf8');
          files[item] = content;
          console.log(`[Claude Agent] Collected file: ${item} (${content.length} bytes)`);
        }
      } else if (stat.isDirectory()) {
        // Recursively collect from subdirectories
        const subFiles = await collectFiles(fullPath);
        for (const [subPath, content] of Object.entries(subFiles)) {
          files[path.join(item, subPath)] = content;
        }
      }
    }
  } catch (error) {
    console.error('[Claude Agent] Error collecting files:', error.message);
  }

  return files;
}

/**
 * Simple wrapper for quick code generation tasks
 * @param {string} prompt - What to generate
 * @param {string} outputDir - Where to save files
 * @returns {Promise<Object>} Result object
 */
async function generateCode(prompt, outputDir = './temp') {
  console.log(`[Claude Agent] Generating code in: ${outputDir}`);

  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  return executeTask(prompt, {
    cwd: outputDir,
    maxTurns: 10,
    onProgress: (progress) => {
      console.log(`[Claude Agent] Progress: ${progress.stage}`);
    }
  });
}

/**
 * Edit existing code files
 * @param {string} editRequest - What changes to make
 * @param {string} projectDir - Directory with existing code
 * @returns {Promise<Object>} Result object
 */
async function editCode(editRequest, projectDir) {
  console.log(`[Claude Agent] Editing code in: ${projectDir}`);

  return executeTask(editRequest, {
    cwd: projectDir,
    maxTurns: 8,
    onProgress: (progress) => {
      console.log(`[Claude Agent] Progress: ${progress.stage}`);
    }
  });
}

module.exports = {
  executeTask,
  generateCode,
  editCode,
  initializeSDK
};
