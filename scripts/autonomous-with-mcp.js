#!/usr/bin/env node

/**
 * Autonomous GitHub Agent using Official GitHub MCP Server
 *
 * This demonstrates using the official GitHub MCP server hosted on Polsia infrastructure
 * The agent uses MCP tools (create_or_update_file, push_files, etc.) instead of Bash
 */

require('dotenv').config();
const { Pool } = require('pg');
const { decryptToken } = require('../utils/encryption');
const { executeTask } = require('../services/claude-agent');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function getGitHubToken(userId) {
    const result = await pool.query(
        `SELECT metadata FROM service_connections
         WHERE user_id = $1 AND service_name = 'github' AND status = 'connected'`,
        [userId]
    );

    if (result.rows.length === 0) {
        throw new Error('GitHub account not connected');
    }

    const metadata = result.rows[0].metadata;
    return decryptToken({
        encrypted: metadata.encrypted_token,
        iv: metadata.token_iv,
        authTag: metadata.token_auth_tag
    });
}

async function runWithMCP() {
    console.log('🤖 Autonomous Agent with Official GitHub MCP Server\n');
    console.log('='.repeat(70));
    console.log('Using: Official GitHub MCP (via Polsia MCP proxy)');
    console.log('Repository: Polsia-Inc/newco-app');
    console.log('='.repeat(70));
    console.log('');

    try {
        const userId = 1;
        const githubToken = await getGitHubToken(userId);
        console.log('✅ GitHub credentials retrieved\n');

        const workspace = path.join(process.cwd(), 'temp', 'agent-workspace', crypto.randomBytes(8).toString('hex'));
        await fs.mkdir(workspace, { recursive: true });

        // IMPORTANT: This is a HIGH-LEVEL prompt
        // The agent should figure out to use MCP tools instead of Bash
        const prompt = `
        
You have access to GitHub MCP tools that let you directly interact with GitHub repositories.

Task: Find any security issue and fix it.

Repository: Polsia-Inc/newco-app
Branch: main

`.trim();

        console.log('🚀 Launching agent with MCP tools...\n');

        const startTime = Date.now();
        let toolsUsed = new Set();

        // Configure GitHub MCP server (stdio transport)
        // The SDK will spawn npx and pass the GitHub token via env
        const mcpServers = {
            github: {
                command: 'npx',
                args: ['-y', '@modelcontextprotocol/server-github'],
                env: {
                    GITHUB_PERSONAL_ACCESS_TOKEN: githubToken
                }
            }
        };

        const result = await executeTask(prompt, {
            cwd: workspace,
            maxTurns: 20,
            mcpServers,
            onProgress: (progress) => {
                if (progress.stage === 'tool_use') {
                    toolsUsed.add(progress.tool);
                    console.log(`   [Tool] ${progress.tool}`);
                } else if (progress.stage === 'thinking' && progress.message) {
                    const preview = progress.message.substring(0, 70);
                    console.log(`   💭 ${preview}...`);
                }
            }
        });

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log('\n' + '='.repeat(70));
        console.log('EXECUTION SUMMARY');
        console.log('='.repeat(70));
        console.log(`Status: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
        console.log(`Duration: ${duration}s`);
        console.log(`Cost: $${result.metadata?.totalCost?.toFixed(4) || 'N/A'}`);
        console.log(`Tools used: ${Array.from(toolsUsed).join(', ')}`);

        if (result.success) {
            console.log('\n✅ Task completed using GitHub MCP tools!');
            console.log('   View changes at: https://github.com/Polsia-Inc/newco-app');
        } else {
            console.log('\n❌ Task failed:', result.error);
        }

        console.log('='.repeat(70));

        await fs.rm(workspace, { recursive: true, force: true });

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error(error.stack);
    } finally {
        await pool.end();
    }
}

runWithMCP();
