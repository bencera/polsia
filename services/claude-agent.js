/**
 * Claude Code SDK Wrapper
 * General-purpose service for executing coding tasks using Claude Code SDK
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const githubApi = require('./github-api');
const { getGitHubToken } = require('../db');
const { decryptToken } = require('../utils/encryption');

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
 * Format tool use with parameters for better log visibility
 * @param {string} toolName - Name of the tool
 * @param {Object} input - Tool input parameters
 * @returns {string} Formatted string
 */
function formatToolUse(toolName, input = {}) {
  try {
    switch (toolName) {
      case 'Read':
        return `Read(${input.file_path || 'unknown'})`;

      case 'Glob':
        return `Glob(${input.pattern || 'unknown'}${input.path ? ` in ${input.path}` : ''})`;

      case 'Grep':
        return `Grep("${input.pattern || 'unknown'}"${input.path ? ` in ${input.path}` : ''})`;

      case 'Write':
        const lineCount = input.content ? input.content.split('\n').length : 0;
        return `Write(${input.file_path || 'unknown'}) [${lineCount} lines]`;

      case 'Edit':
        return `Edit(${input.file_path || 'unknown'})`;

      case 'Bash':
        const cmd = input.command || 'unknown';
        const shortCmd = cmd.length > 60 ? cmd.substring(0, 60) + '...' : cmd;
        return `Bash(${shortCmd})`;

      case 'Task':
        // Extract sub-agent info from input
        const agentName = input.subagent_type || input.agent || 'unknown-agent';
        const taskDescription = input.description || '';
        const taskPrompt = input.prompt || '';

        // Format for logs
        const shortDesc = taskDescription.length > 40 ? taskDescription.substring(0, 40) + '...' : taskDescription;
        const shortPrompt = taskPrompt.length > 60 ? taskPrompt.substring(0, 60) + '...' : taskPrompt;

        return shortDesc
          ? `🤖 Task("${agentName}"): ${shortDesc}`
          : `🤖 Task("${agentName}"): ${shortPrompt}`;

      case 'mcp__render__query_render_postgres':
        const sql = input.sql || '';
        const shortSql = sql.length > 80 ? sql.substring(0, 80) + '...' : sql;
        return `render:query_postgres("${shortSql}")`;

      case 'mcp__render__list_postgres_instances':
        return `render:list_postgres_instances()`;

      case 'mcp__render__get_postgres':
        return `render:get_postgres(${input.postgresId || 'unknown'})`;

      case 'mcp__render__list_services':
        return `render:list_services()`;

      case 'mcp__render__get_service':
        return `render:get_service(${input.serviceId || 'unknown'})`;

      case 'mcp__render__list_workspaces':
        return `render:list_workspaces()`;

      case 'mcp__render__get_metrics':
        const metrics = input.metricTypes ? input.metricTypes.join(', ') : 'unknown';
        return `render:get_metrics([${metrics}])`;

      case 'mcp__github__create_or_update_file':
        return `github:create_or_update_file(${input.path || 'unknown'})`;

      case 'mcp__github__push_files':
        const fileCount = input.files ? input.files.length : 0;
        return `github:push_files([${fileCount} files])`;

      case 'mcp__github__create_pull_request':
        return `github:create_pull_request("${input.title || 'untitled'}")`;

      case 'mcp__github__search_code':
        return `github:search_code("${input.query || 'unknown'}")`;

      case 'mcp__github__get_file_contents':
        return `github:get_file_contents(${input.path || 'unknown'})`;

      default:
        // Generic format for unknown tools
        if (toolName.startsWith('mcp__')) {
          const shortName = toolName.replace('mcp__', '').replace(/__/g, ':');
          const params = Object.keys(input).slice(0, 2).map(k => `${k}=${input[k]}`).join(', ');
          return params ? `${shortName}(${params})` : shortName;
        }
        return toolName;
    }
  } catch (error) {
    return toolName; // Fallback to just the name if formatting fails
  }
}

/**
 * Create a filesystem restriction hook to prevent agents from accessing files outside their workspace
 * @param {string} allowedDir - The directory agents are restricted to
 * @returns {Function} PreToolUse hook function
 */
function createFilesystemRestrictionHook(allowedDir) {
  const normalizedAllowedDir = path.resolve(allowedDir);

  return async (input) => {
    const toolName = input.tool_name;

    // Block git commands in Bash - agents should use GitHub MCP instead
    if (toolName === 'Bash' && input.tool_input?.command) {
      const command = input.tool_input.command.toLowerCase();
      if (command.includes('git ') || command.startsWith('git')) {
        console.warn(`[Filesystem Guard] 🚫 Blocked git command: ${input.tool_input.command}`);
        return {
          decision: 'block',
          reason: 'Git commands are not allowed via Bash. Please use the GitHub MCP server for git operations on user repositories.'
        };
      }
    }

    // Only check file operation tools
    if (!['Read', 'Write', 'Edit', 'Glob', 'Grep'].includes(toolName)) {
      return { decision: 'approve' };
    }

    // Extract file path from tool input
    let filePath = null;
    if (input.tool_input) {
      filePath = input.tool_input.file_path || input.tool_input.path || null;
    }

    // If no path specified, allow it
    if (!filePath) {
      return { decision: 'approve' };
    }

    // Resolve path (handles both absolute and relative paths, including ..)
    // Relative paths are resolved from the allowed directory (cwd)
    const normalizedPath = path.resolve(allowedDir, filePath);

    // Check if resolved path is within allowed directory
    if (!normalizedPath.startsWith(normalizedAllowedDir)) {
      console.warn(`[Filesystem Guard] 🚫 Blocked ${toolName} access to: ${filePath}`);
      console.warn(`[Filesystem Guard] Resolved to: ${normalizedPath}`);
      console.warn(`[Filesystem Guard] Allowed directory: ${normalizedAllowedDir}`);
      return {
        decision: 'block',
        reason: `File access restricted to workspace directory. Attempted path: ${filePath} (resolved to ${normalizedPath})`
      };
    }

    // Path is within allowed directory
    return { decision: 'approve' };
  };
}

/**
 * Execute a coding task using Claude Code SDK
 * @param {string} prompt - The task description
 * @param {Object} options - Configuration options
 * @param {string} options.cwd - Working directory for file operations
 * @param {number} options.maxTurns - Maximum conversation turns (default: 10)
 * @param {string} options.model - Model to use (default: auto)
 * @param {Object} options.mcpServers - MCP server configurations
 * @param {Function} options.onMessage - Callback for streaming messages
 * @param {Function} options.onProgress - Callback for progress updates
 * @param {boolean} options.skipFileCollection - Skip collecting files after execution (default: false)
 * @returns {Promise<Object>} Result with files, messages, and metadata
 */
async function executeTask(prompt, options = {}) {
  const startTime = Date.now();
  const {
    cwd = process.cwd(),
    maxTurns = 10,
    model,
    mcpServers,
    agents,
    onMessage,
    onProgress,
    skipFileCollection = false,
    resumeSessionId = null  // Allow resuming from previous session
  } = options;

  // Track current sub-agent context for better logging
  let currentSubAgent = null;
  let currentTaskToolId = null; // Track the Task tool_use_id to know when sub-agent actually completes
  const getLogPrefix = () => currentSubAgent ? `[${currentSubAgent}]` : '[Claude Agent]';

  try {
    console.log('[Claude Agent] Starting task execution');
    console.log(`[Claude Agent] Prompt: ${prompt.substring(0, 100)}...`);
    console.log(`[Claude Agent] Working directory: ${cwd}`);
    console.log(`[Claude Agent] 🔒 Filesystem restriction enabled - agents restricted to: ${cwd}`);

    // Initialize SDK
    const { query } = await initializeSDK();

    // Prepare query options
    const queryOptions = {
      maxTurns,
      cwd,
      permissionMode: 'bypassPermissions',
      hooks: {
        PreToolUse: [{
          hooks: [createFilesystemRestrictionHook(cwd)]
        }]
      }
    };

    if (model) {
      queryOptions.model = model;
    }

    // Resume from previous session if provided and it exists on disk
    if (resumeSessionId) {
      // Check if session exists in .claude/sessions directory
      const sessionPath = path.join(cwd, '.claude', 'sessions', resumeSessionId);
      try {
        await fs.access(sessionPath);
        queryOptions.resume = resumeSessionId;
        console.log(`[Claude Agent] ♻️  Resuming session: ${resumeSessionId}`);
      } catch (error) {
        console.log(`[Claude Agent] ⚠️  Session ${resumeSessionId.substring(0, 8)}... not found on disk, starting new session`);
        // Don't set resume option - will create a new session instead
      }
    } else {
      console.log('[Claude Agent] 🆕 Starting new session');
    }

    if (mcpServers) {
      queryOptions.mcpServers = mcpServers;
      console.log('[Claude Agent] MCP servers configured:', Object.keys(mcpServers).join(', '));
    }

    if (agents) {
      queryOptions.agents = agents;
      console.log('[Claude Agent] Sub-agents configured:', Object.keys(agents).join(', '));
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
                sessionId: message.session_id || message.sessionId
              });
            }
          }
          break;

        case 'assistant':
          // Track assistant messages
          if (message.message?.content) {
            message.message.content.forEach(content => {
              if (content.type === 'text') {
                console.log(`${getLogPrefix()} Assistant: ${content.text.substring(0, 100)}...`);
                if (onProgress) {
                  onProgress({
                    stage: 'thinking',
                    message: content.text,
                    subAgent: currentSubAgent
                  });
                }
              } else if (content.type === 'tool_use') {
                turnCount++;

                // Track sub-agent invocations
                if (content.name === 'Task' && content.input?.subagent_type) {
                  currentSubAgent = content.input.subagent_type;
                  currentTaskToolId = content.id; // Store the Task tool_use_id
                  console.log(`\n🤖 [${currentSubAgent}] Sub-agent starting...`);
                }

                // Format tool use with parameters for better visibility
                const toolDetails = formatToolUse(content.name, content.input);
                console.log(`${getLogPrefix()} ⏺ ${toolDetails}`);

                if (onProgress) {
                  onProgress({
                    stage: 'tool_use',
                    tool: content.name,
                    details: toolDetails,
                    turnCount,
                    subAgent: currentSubAgent
                  });
                }
              }
            });
          }
          break;

        case 'user':
          // Track tool results (responses from tools)
          if (message.message?.content) {
            message.message.content.forEach(content => {
              if (content.type === 'tool_result') {
                const toolId = content.tool_use_id || 'unknown';

                if (content.content) {
                  const resultText = Array.isArray(content.content)
                    ? content.content.map(c => c.text || '').join(' ')
                    : (typeof content.content === 'string' ? content.content : JSON.stringify(content.content));

                  const shortResult = resultText.length > 150 ? resultText.substring(0, 150) + '...' : resultText;
                  console.log(`${getLogPrefix()} ✓ Tool result [${toolId.substring(0, 8)}]: ${shortResult}`);

                  // Check if this is the Task tool result (sub-agent actually finished)
                  if (currentSubAgent && toolId === currentTaskToolId) {
                    console.log(`🤖 [${currentSubAgent}] Sub-agent completed\n`);
                    currentSubAgent = null;
                    currentTaskToolId = null;
                  }
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

    // Collect generated files (skip if not needed for performance)
    let generatedFiles = {};
    if (!skipFileCollection) {
      generatedFiles = await collectFiles(cwd);
      console.log(`[Claude Agent] ✅ Collected ${Object.keys(generatedFiles).length} generated files`);
    } else {
      console.log('[Claude Agent] ⏭️  Skipping file collection (not needed for this task)');
    }

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
          // Removed verbose logging - just collect silently
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

/**
 * Execute a task on a GitHub repository
 * @param {string} userId - User ID to get GitHub token from
 * @param {string} repoUrl - GitHub repository URL (e.g., "https://github.com/owner/repo")
 * @param {string} prompt - Task description/instructions
 * @param {Object} options - Configuration options
 * @param {boolean} options.autoPush - Automatically commit and push changes (default: false)
 * @param {string} options.commitMessage - Custom commit message
 * @param {string} options.branch - Branch to work on (default: default branch)
 * @param {boolean} options.createBranch - Create a new branch for changes (default: false)
 * @param {string} options.newBranchName - Name for new branch (required if createBranch=true)
 * @param {number} options.maxTurns - Maximum conversation turns
 * @param {Function} options.onProgress - Callback for progress updates
 * @returns {Promise<Object>} Result with files, changes, and metadata
 */
async function executeTaskWithGitHub(userId, repoUrl, prompt, options = {}) {
  const startTime = Date.now();
  const {
    autoPush = false,
    commitMessage = 'Changes by Polsia AI Agent',
    branch,
    createBranch = false,
    newBranchName,
    maxTurns = 10,
    skipCleanup = false,
    onProgress
  } = options;

  let repoDir = null;
  let token = null;

  try {
    console.log('[Claude Agent + GitHub] Starting GitHub repository task');
    console.log(`[Claude Agent + GitHub] Repository: ${repoUrl}`);

    // Step 1: Get and decrypt GitHub token
    if (onProgress) onProgress({ stage: 'authenticating', message: 'Retrieving GitHub credentials' });

    const encryptedToken = await getGitHubToken(userId);
    if (!encryptedToken) {
      throw new Error('No GitHub account connected. Please connect your GitHub account first.');
    }

    token = decryptToken(encryptedToken);
    console.log('[Claude Agent + GitHub] GitHub token retrieved successfully');

    // Step 2: Clone repository
    if (onProgress) onProgress({ stage: 'cloning', message: 'Cloning repository from GitHub' });

    const repoId = crypto.randomBytes(8).toString('hex');
    repoDir = path.join(process.cwd(), 'temp', 'repos', repoId);
    await fs.mkdir(repoDir, { recursive: true });

    await githubApi.cloneRepository(token, repoUrl, repoDir, branch);
    console.log(`[Claude Agent + GitHub] Repository cloned to: ${repoDir}`);

    // Step 3: Create new branch if requested
    if (createBranch) {
      if (!newBranchName) {
        throw new Error('newBranchName is required when createBranch is true');
      }

      if (onProgress) onProgress({ stage: 'branching', message: `Creating branch: ${newBranchName}` });

      // Parse owner and repo from URL
      const urlMatch = repoUrl.match(/github\.com\/([^\/]+)\/([^\/\.]+)/);
      if (!urlMatch) {
        throw new Error('Invalid GitHub repository URL');
      }
      const [, owner, repo] = urlMatch;

      await githubApi.createBranch(token, owner, repo, newBranchName, branch);
      console.log(`[Claude Agent + GitHub] Created branch: ${newBranchName}`);
    }

    // Step 4: Execute Claude Agent task in the repository
    if (onProgress) onProgress({ stage: 'executing', message: 'Running AI task on repository' });

    const result = await executeTask(prompt, {
      cwd: repoDir,
      maxTurns,
      onProgress: (taskProgress) => {
        if (onProgress) {
          onProgress({
            stage: 'executing',
            substage: taskProgress.stage,
            ...taskProgress
          });
        }
      }
    });

    if (!result.success) {
      throw new Error(result.error || 'Task execution failed');
    }

    console.log('[Claude Agent + GitHub] Task completed successfully');

    // Step 5: Commit and push changes if requested
    let pushed = false;
    if (autoPush) {
      if (onProgress) onProgress({ stage: 'pushing', message: 'Committing and pushing changes to GitHub' });

      try {
        await githubApi.pushChanges(
          token,
          repoDir,
          commitMessage,
          createBranch ? newBranchName : branch
        );
        pushed = true;
        console.log('[Claude Agent + GitHub] Changes pushed to GitHub successfully');
      } catch (pushError) {
        console.error('[Claude Agent + GitHub] Failed to push changes:', pushError.message);
        // Don't fail the entire task if push fails - user can still see changes
        result.pushError = pushError.message;
      }
    }

    // Step 6: Cleanup temporary directory (unless skipCleanup is true)
    if (!skipCleanup) {
      if (onProgress) onProgress({ stage: 'cleanup', message: 'Cleaning up temporary files' });
      await cleanupRepo(repoDir);
    } else {
      console.log(`[Claude Agent + GitHub] Skipping cleanup - files preserved at: ${repoDir}`);
    }

    const duration = Date.now() - startTime;

    return {
      success: true,
      files: result.files,
      messages: result.messages,
      metadata: {
        ...result.metadata,
        total_duration_ms: duration,
        repository: repoUrl,
        branch: createBranch ? newBranchName : branch,
        pushed,
        commit_message: autoPush ? commitMessage : null,
        repoDir: skipCleanup ? repoDir : null
      }
    };

  } catch (error) {
    console.error('[Claude Agent + GitHub] Error:', error);

    // Cleanup on error
    if (repoDir) {
      await cleanupRepo(repoDir);
    }

    return {
      success: false,
      error: error.message || 'GitHub task execution failed',
      files: {},
      messages: [],
      metadata: {
        duration_ms: Date.now() - startTime,
        repository: repoUrl
      }
    };
  }
}

/**
 * Read code from a GitHub repository without making changes
 * @param {string} userId - User ID to get GitHub token from
 * @param {string} repoUrl - GitHub repository URL
 * @param {string} filePath - Path to file in repository (optional, reads all if not specified)
 * @param {Object} options - Configuration options
 * @param {string} options.branch - Branch to read from (default: default branch)
 * @returns {Promise<Object>} Repository contents
 */
async function readGitHubRepository(userId, repoUrl, filePath = null, options = {}) {
  const { branch } = options;

  try {
    console.log('[Claude Agent + GitHub] Reading repository');
    console.log(`[Claude Agent + GitHub] Repository: ${repoUrl}`);

    // Get and decrypt GitHub token
    const encryptedToken = await getGitHubToken(userId);
    if (!encryptedToken) {
      throw new Error('No GitHub account connected');
    }

    const token = decryptToken(encryptedToken);

    // Parse owner and repo from URL
    const urlMatch = repoUrl.match(/github\.com\/([^\/]+)\/([^\/\.]+)/);
    if (!urlMatch) {
      throw new Error('Invalid GitHub repository URL');
    }
    const [, owner, repo] = urlMatch;

    // Get repository info
    const repoInfo = await githubApi.getRepository(token, owner, repo);

    if (filePath) {
      // Get specific file
      const fileContent = await githubApi.getContents(token, owner, repo, filePath, branch);
      return {
        success: true,
        type: 'file',
        path: filePath,
        content: fileContent,
        repository: repoInfo
      };
    } else {
      // Clone repository for full access
      const repoId = crypto.randomBytes(8).toString('hex');
      const repoDir = path.join(process.cwd(), 'temp', 'repos', repoId);
      await fs.mkdir(repoDir, { recursive: true });

      await githubApi.cloneRepository(token, repoUrl, repoDir, branch);

      // Collect all files
      const files = await collectFiles(repoDir);

      // Cleanup
      await cleanupRepo(repoDir);

      return {
        success: true,
        type: 'repository',
        files,
        repository: repoInfo
      };
    }

  } catch (error) {
    console.error('[Claude Agent + GitHub] Error reading repository:', error);
    return {
      success: false,
      error: error.message || 'Failed to read repository'
    };
  }
}

/**
 * Cleanup temporary repository directory
 * @param {string} repoDir - Directory to remove
 */
async function cleanupRepo(repoDir) {
  try {
    await fs.rm(repoDir, { recursive: true, force: true });
    console.log(`[Claude Agent + GitHub] Cleaned up: ${repoDir}`);
  } catch (error) {
    console.error(`[Claude Agent + GitHub] Failed to cleanup ${repoDir}:`, error.message);
  }
}

module.exports = {
  executeTask,
  generateCode,
  editCode,
  executeTaskWithGitHub,
  readGitHubRepository,
  initializeSDK
};
