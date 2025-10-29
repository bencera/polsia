/**
 * Agent API Routes
 * Endpoints for executing Claude Code SDK tasks
 */

const express = require('express');
const router = express.Router();
const { executeTask, generateCode, editCode } = require('../services/claude-agent');
const path = require('path');
const fs = require('fs').promises;

/**
 * POST /api/agent/execute
 * Execute a coding task with Claude Code SDK
 *
 * Body:
 * - prompt: string (required) - The task to execute
 * - cwd: string (optional) - Working directory (defaults to temp)
 * - maxTurns: number (optional) - Max conversation turns
 * - model: string (optional) - Model to use
 */
router.post('/execute', async (req, res) => {
  try {
    const { prompt, cwd, maxTurns, model } = req.body;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required'
      });
    }

    console.log(`[Agent API] Received execute request: ${prompt.substring(0, 100)}...`);

    // Default to temp directory if not specified
    const workingDir = cwd || path.join(process.cwd(), 'temp', Date.now().toString());

    // Ensure directory exists
    await fs.mkdir(workingDir, { recursive: true });

    // Execute task with progress tracking
    const result = await executeTask(prompt, {
      cwd: workingDir,
      maxTurns: maxTurns || 10,
      model,
      onProgress: (progress) => {
        console.log(`[Agent API] Progress: ${JSON.stringify(progress)}`);
        // In a real app, you'd emit this via WebSocket or SSE
      }
    });

    res.json(result);

  } catch (error) {
    console.error('[Agent API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Task execution failed'
    });
  }
});

/**
 * POST /api/agent/generate
 * Generate code files from a prompt
 *
 * Body:
 * - prompt: string (required) - What to generate
 * - outputDir: string (optional) - Where to save files
 */
router.post('/generate', async (req, res) => {
  try {
    const { prompt, outputDir } = req.body;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required'
      });
    }

    console.log(`[Agent API] Generate request: ${prompt.substring(0, 100)}...`);

    const targetDir = outputDir || path.join(process.cwd(), 'temp', `gen-${Date.now()}`);
    const result = await generateCode(prompt, targetDir);

    res.json(result);

  } catch (error) {
    console.error('[Agent API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Code generation failed'
    });
  }
});

/**
 * POST /api/agent/edit
 * Edit existing code files
 *
 * Body:
 * - editRequest: string (required) - What changes to make
 * - projectDir: string (required) - Directory with existing code
 */
router.post('/edit', async (req, res) => {
  try {
    const { editRequest, projectDir } = req.body;

    if (!editRequest || !projectDir) {
      return res.status(400).json({
        success: false,
        error: 'editRequest and projectDir are required'
      });
    }

    console.log(`[Agent API] Edit request: ${editRequest.substring(0, 100)}...`);

    // Verify directory exists
    try {
      await fs.access(projectDir);
    } catch {
      return res.status(400).json({
        success: false,
        error: 'Project directory does not exist'
      });
    }

    const result = await editCode(editRequest, projectDir);

    res.json(result);

  } catch (error) {
    console.error('[Agent API] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Code editing failed'
    });
  }
});

/**
 * GET /api/agent/health
 * Check if the agent service is available
 */
router.get('/health', async (req, res) => {
  try {
    const { initializeSDK } = require('../services/claude-agent');
    await initializeSDK();

    res.json({
      success: true,
      message: 'Claude Code SDK is available',
      sdk_version: '2.0.28'
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      error: 'Claude Code SDK not available',
      message: error.message
    });
  }
});

module.exports = router;
