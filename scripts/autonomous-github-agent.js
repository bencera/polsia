#!/usr/bin/env node

/**
 * Autonomous GitHub Agent using Claude Code SDK
 *
 * This script demonstrates a fully autonomous agent that:
 * 1. Clones a GitHub repository
 * 2. Modifies files (landing page footer)
 * 3. Commits and pushes changes back to GitHub
 *
 * The agent uses Bash, Read, Write, Edit tools autonomously.
 *
 * Usage:
 *   node scripts/autonomous-github-agent.js
 *
 * Environment Variables:
 *   GITHUB_TOKEN - GitHub personal access token (or retrieved from DB)
 *   POLSIA_JWT_TOKEN - JWT token for authenticated user
 *   POLSIA_API_URL - Polsia backend URL (default: http://localhost:3000)
 */

require('dotenv').config();
const { Pool } = require('pg');
const { decryptToken } = require('../utils/encryption');
const { executeTask } = require('../services/claude-agent');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

// Configuration
const API_URL = process.env.POLSIA_API_URL || 'http://localhost:3000';
const REPO_URL = 'https://github.com/Polsia-Inc/newco-app';
const REPO_NAME = 'newco-app';

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

/**
 * Get GitHub token for user from database
 */
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

/**
 * Execute autonomous GitHub task
 */
async function executeAutonomousTask() {
    console.log('🤖 Autonomous GitHub Agent with Claude Code SDK\n');
    console.log('=' .repeat(70));
    console.log(`Repository: ${REPO_URL}`);
    console.log('Task: Clone, modify landing page footer, commit & push');
    console.log('=' .repeat(70));
    console.log('');

    const startTime = Date.now();

    try {
        // Get user ID (hardcoded to 1 for this demo, in production would come from JWT)
        const userId = 1;

        console.log('🔐 Retrieving GitHub credentials...');
        const githubToken = await getGitHubToken(userId);
        console.log('✅ GitHub credentials retrieved\n');

        // Create temp workspace
        const workspaceId = crypto.randomBytes(8).toString('hex');
        const workspace = path.join(process.cwd(), 'temp', 'agent-workspace', workspaceId);
        await fs.mkdir(workspace, { recursive: true });
        console.log(`📁 Workspace created: ${workspace}\n`);

        // Prepare the agent prompt
        const agentPrompt = `
You are an autonomous GitHub agent. Your task is to:

1. Clone the repository: ${REPO_URL}
   - Use this authenticated URL: https://x-access-token:${githubToken}@github.com/Polsia-Inc/newco-app.git
   - Clone into the directory: ${REPO_NAME}

2. Navigate into the cloned repository and find the landing page HTML file
   - Search for files containing "landing" or "index.html"
   - Look for footer text containing "Polsia"

3. Modify the footer text
   - Find the copyright text in the footer
   - Change it to: "© 2025 Polsia - Powered by AI"
   - Preserve all HTML formatting and styling

4. Commit and push the changes
   - Configure git: git config user.name "Polsia Agent"
   - Configure git: git config user.email "agent@polsia.ai"
   - Stage changes: git add .
   - Commit with message: "Update footer via autonomous agent"
   - Push to main branch: git push origin main

IMPORTANT NOTES:
- Use the Bash tool for all git commands
- Use Read/Edit tools to modify files
- The GitHub token is already embedded in the clone URL for authentication
- Work in the current directory (${workspace})
- Be thorough and verify each step succeeded before proceeding

Begin by cloning the repository.
`.trim();

        console.log('🚀 Launching autonomous agent...');
        console.log('   Agent will handle: clone → modify → commit → push\n');

        let turnCount = 0;
        let toolsUsed = [];
        let lastMessage = '';

        // Execute the task with Claude Agent SDK
        const result = await executeTask(agentPrompt, {
            cwd: workspace,
            maxTurns: 25,
            onProgress: (progress) => {
                if (progress.stage === 'tool_use') {
                    turnCount++;
                    toolsUsed.push(progress.tool);
                    console.log(`   [Turn ${turnCount}] Using tool: ${progress.tool}`);
                } else if (progress.stage === 'thinking' && progress.message) {
                    lastMessage = progress.message;
                    const preview = progress.message.substring(0, 80);
                    console.log(`   💭 ${preview}${progress.message.length > 80 ? '...' : ''}`);
                }
            }
        });

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log('\n' + '=' .repeat(70));
        console.log('EXECUTION SUMMARY');
        console.log('=' .repeat(70));
        console.log(`Status: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
        console.log(`Duration: ${duration} seconds`);
        console.log(`Turns: ${result.metadata?.turns || turnCount}`);
        console.log(`Cost: $${result.metadata?.totalCost?.toFixed(4) || 'N/A'}`);
        console.log(`Tools used: ${[...new Set(toolsUsed)].join(', ')}`);
        console.log('');

        if (result.success) {
            console.log('📝 Changes made by agent:');
            if (result.files && result.files.length > 0) {
                result.files.forEach((file, idx) => {
                    console.log(`   ${idx + 1}. ${file.path}`);
                });
            } else {
                console.log('   Files modified in repository (committed and pushed)');
            }
            console.log('');
            console.log('✅ Changes have been pushed to GitHub!');
            console.log(`   View at: ${REPO_URL}`);
        } else {
            console.log('❌ Task failed:', result.error);
            console.log('\nLast agent message:', lastMessage);
        }

        console.log('\n' + '=' .repeat(70));
        console.log('🎉 Autonomous agent execution completed!');
        console.log('=' .repeat(70));

        // Cleanup
        console.log('\n🧹 Cleaning up workspace...');
        await fs.rm(workspace, { recursive: true, force: true });
        console.log('✅ Cleanup complete\n');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Run the script
if (require.main === module) {
    executeAutonomousTask().catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { executeAutonomousTask };
