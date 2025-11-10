#!/usr/bin/env node

/**
 * Remove GitHub MCP from Analytics Agent config
 */

require('dotenv').config();
const { pool } = require('../db');

async function removeGitHubFromAgent() {
    const client = await pool.connect();

    try {
        console.log('Removing GitHub MCP from Analytics Agent config...\n');

        // Get current config
        const result = await client.query(
            `SELECT id, name, config FROM agents WHERE agent_type = 'analytics_agent' OR name = 'Analytics Agent'`
        );

        if (result.rows.length === 0) {
            console.log('No analytics agent found.');
            return;
        }

        for (const agent of result.rows) {
            const config = agent.config || {};
            const oldMcpMounts = config.mcpMounts || [];

            console.log(`Agent: ${agent.name}`);
            console.log(`Old MCP mounts: [${oldMcpMounts.join(', ')}]`);

            // Remove github
            const newMcpMounts = oldMcpMounts.filter(mount => mount !== 'github');
            config.mcpMounts = newMcpMounts;

            await client.query(
                'UPDATE agents SET config = $1 WHERE id = $2',
                [JSON.stringify(config), agent.id]
            );

            console.log(`New MCP mounts: [${newMcpMounts.join(', ')}]`);
            console.log('✓ Updated\n');
        }

        console.log('✅ All agents updated!');

    } catch (error) {
        console.error('Error updating agent:', error);
        throw error;
    } finally {
        client.release();
    }
}

removeGitHubFromAgent()
    .then(() => {
        console.log('\nDone!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Failed:', error);
        process.exit(1);
    });
