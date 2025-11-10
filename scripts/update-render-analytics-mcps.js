#!/usr/bin/env node

/**
 * Remove GitHub MCP from render_analytics routines
 */

require('dotenv').config();
const { pool } = require('../db');

async function updateRenderAnalyticsMCPs() {
    const client = await pool.connect();

    try {
        console.log('Updating render_analytics routine MCP mounts...\n');

        // Find all render_analytics routines
        const result = await client.query(
            `SELECT id, name, config FROM routines WHERE type = 'render_analytics'`
        );

        console.log(`Found ${result.rows.length} render_analytics routine(s)\n`);

        for (const routine of result.rows) {
            const config = routine.config || {};
            const oldMcpMounts = config.mcpMounts || [];

            // Remove 'github' from mcpMounts
            const newMcpMounts = oldMcpMounts.filter(mount => mount !== 'github');

            if (oldMcpMounts.length !== newMcpMounts.length) {
                config.mcpMounts = newMcpMounts;

                await client.query(
                    'UPDATE routines SET config = $1 WHERE id = $2',
                    [JSON.stringify(config), routine.id]
                );

                console.log(`✓ Updated routine: ${routine.name}`);
                console.log(`  Old MCPs: [${oldMcpMounts.join(', ')}]`);
                console.log(`  New MCPs: [${newMcpMounts.join(', ')}]\n`);
            } else {
                console.log(`- No change needed for: ${routine.name}`);
                console.log(`  MCPs: [${oldMcpMounts.join(', ')}]\n`);
            }
        }

        console.log('✅ All render_analytics routines checked!');

    } catch (error) {
        console.error('Error updating routines:', error);
        throw error;
    } finally {
        client.release();
    }
}

updateRenderAnalyticsMCPs()
    .then(() => {
        console.log('\nDone!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Failed:', error);
        process.exit(1);
    });
