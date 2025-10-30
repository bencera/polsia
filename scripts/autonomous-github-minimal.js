#!/usr/bin/env node

/**
 * Minimal Autonomous GitHub Agent
 *
 * Tests if we can just give high-level instructions and let the agent figure it out
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

async function minimalTest() {
    console.log('🤖 Minimal Autonomous GitHub Agent\n');
    console.log('Testing: Can we just give high-level instructions?\n');

    try {
        const userId = 1;
        const githubToken = await getGitHubToken(userId);

        const workspaceId = crypto.randomBytes(8).toString('hex');
        const workspace = path.join(process.cwd(), 'temp', 'agent-workspace', workspaceId);
        await fs.mkdir(workspace, { recursive: true });

        // MINIMAL PROMPT - just the goal!
        const minimalPrompt = `
Clone the repository https://github.com/Polsia-Inc/newco-app,
modify the footer in the landing page to say something creative about AI,
then commit and push your changes to the main branch.

Use this GitHub token for authentication: ${githubToken}
`.trim();

        console.log('📝 Prompt given to agent:');
        console.log(minimalPrompt);
        console.log('\n🚀 Launching agent with minimal instructions...\n');

        const startTime = Date.now();

        const result = await executeTask(minimalPrompt, {
            cwd: workspace,
            maxTurns: 30,
            onProgress: (progress) => {
                if (progress.stage === 'tool_use') {
                    console.log(`   [Tool] ${progress.tool}`);
                } else if (progress.stage === 'thinking' && progress.message) {
                    const preview = progress.message.substring(0, 60);
                    console.log(`   💭 ${preview}...`);
                }
            }
        });

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log('\n' + '='.repeat(60));
        console.log(`✅ ${result.success ? 'SUCCESS' : 'FAILED'} in ${duration}s`);
        console.log(`Cost: $${result.metadata?.totalCost?.toFixed(4) || 'N/A'}`);
        console.log('='.repeat(60));

        await fs.rm(workspace, { recursive: true, force: true });

    } catch (error) {
        console.error('\n❌ Error:', error.message);
    } finally {
        await pool.end();
    }
}

minimalTest();
