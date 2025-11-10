#!/usr/bin/env node

/**
 * Update the agent goal for render_analytics routine to remove GitHub cloning instructions
 */

require('dotenv').config();
const { pool } = require('../db');

async function updateRenderAnalyticsGoal() {
    const client = await pool.connect();

    try {
        console.log('Updating render_analytics routine goals...\n');

        // New goal without GitHub cloning instructions
        const newGoal = `Generate a daily analytics snapshot from the production database.

The repository is already cloned locally at ./github-repo - read the files directly to understand the database schema.

Look for:
- Database schema files (migrations/, db.js, models/)
- Table definitions and column names
- API endpoints that show what data exists

Then query the production Render database for key metrics using the Render MCP, and save a report using the Reports MCP.`;

        // Find all render_analytics routines
        const result = await client.query(
            `SELECT id, name, config FROM routines WHERE type = 'render_analytics'`
        );

        console.log(`Found ${result.rows.length} render_analytics routine(s)\n`);

        for (const routine of result.rows) {
            const config = routine.config || {};
            const oldGoal = config.goal || 'N/A';

            // Update the goal
            config.goal = newGoal;

            await client.query(
                'UPDATE routines SET config = $1 WHERE id = $2',
                [JSON.stringify(config), routine.id]
            );

            console.log(`✓ Updated routine: ${routine.name}`);
            console.log(`  Old goal: ${oldGoal.substring(0, 80)}...`);
            console.log(`  New goal: ${newGoal.substring(0, 80)}...\n`);
        }

        console.log('✅ All render_analytics routines updated!');

    } catch (error) {
        console.error('Error updating routines:', error);
        throw error;
    } finally {
        client.release();
    }
}

updateRenderAnalyticsGoal()
    .then(() => {
        console.log('\nDone!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Failed:', error);
        process.exit(1);
    });
