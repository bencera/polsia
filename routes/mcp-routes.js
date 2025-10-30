/**
 * MCP Routes - Expose MCP servers via HTTP
 *
 * Routes for hosting third-party MCP servers (like GitHub)
 * at mcp.polsia.ai/github, etc.
 */

const express = require('express');
const { MCPHttpBridge } = require('../services/mcp-http-bridge');
const { getGitHubToken } = require('../db');
const { decryptToken } = require('../utils/encryption');

const router = express.Router();

// Store active MCP bridges per user
const mcpBridges = new Map();

/**
 * Get or create MCP bridge for a user
 */
async function getMCPBridge(userId, serverType, token) {
    const key = `${userId}:${serverType}`;

    if (mcpBridges.has(key)) {
        return mcpBridges.get(key);
    }

    // Create new bridge based on server type
    let bridge;

    if (serverType === 'github') {
        bridge = new MCPHttpBridge('npx', ['-y', '@modelcontextprotocol/server-github'], {
            GITHUB_PERSONAL_ACCESS_TOKEN: token
        });
    } else {
        throw new Error(`Unknown MCP server type: ${serverType}`);
    }

    // Start the bridge
    await bridge.start();

    // Store it
    mcpBridges.set(key, bridge);

    // Clean up on process exit
    process.on('SIGTERM', () => {
        bridge.stop();
    });

    return bridge;
}

/**
 * GitHub MCP Server Routes
 */

// List available tools
router.post('/github/tools/list', async (req, res) => {
    try {
        const userId = req.user.id;

        // Get user's GitHub token
        const encryptedToken = await getGitHubToken(userId);
        if (!encryptedToken) {
            return res.status(401).json({ error: 'GitHub not connected' });
        }

        const token = decryptToken(encryptedToken);

        // Get or create MCP bridge
        const bridge = await getMCPBridge(userId, 'github', token);

        // Get tools
        const tools = await bridge.listTools();

        res.json(tools);
    } catch (error) {
        console.error('[MCP Routes] Error listing tools:', error);
        res.status(500).json({ error: error.message });
    }
});

// Call a tool
router.post('/github/tools/call', async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, arguments: args } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Tool name required' });
        }

        // Get user's GitHub token
        const encryptedToken = await getGitHubToken(userId);
        if (!encryptedToken) {
            return res.status(401).json({ error: 'GitHub not connected' });
        }

        const token = decryptToken(encryptedToken);

        // Get or create MCP bridge
        const bridge = await getMCPBridge(userId, 'github', token);

        // Call tool
        const result = await bridge.callTool(name, args);

        res.json(result);
    } catch (error) {
        console.error('[MCP Routes] Error calling tool:', error);
        res.status(500).json({ error: error.message });
    }
});

// Generic MCP endpoint (for SDK compatibility)
router.post('/github/mcp', async (req, res) => {
    try {
        const userId = req.user.id;
        const { method, params } = req.body;

        // Get user's GitHub token
        const encryptedToken = await getGitHubToken(userId);
        if (!encryptedToken) {
            return res.status(401).json({ error: 'GitHub not connected' });
        }

        const token = decryptToken(encryptedToken);

        // Get or create MCP bridge
        const bridge = await getMCPBridge(userId, 'github', token);

        // Send JSON-RPC request
        const result = await bridge.sendJsonRpc(method, params);

        res.json({ result });
    } catch (error) {
        console.error('[MCP Routes] Error in MCP request:', error);
        res.status(500).json({ error: error.message });
    }
});

// Health check
router.get('/github/health', (req, res) => {
    res.json({ status: 'ok', server: 'github-mcp' });
});

module.exports = router;
