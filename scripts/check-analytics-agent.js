#!/usr/bin/env node

/**
 * Check the Analytics Agent role and configuration
 */

require('dotenv').config();
const { pool } = require('../db');

async function checkAnalyticsAgent() {
    const client = await pool.connect();

    try {
        console.log('Checking Analytics Agent...\n');

        // Find analytics agent
        const result = await client.query(
            `SELECT id, name, agent_type, role, status, config
             FROM agents
             WHERE agent_type = 'analytics' OR name ILIKE '%analytics%'`
        );

        if (result.rows.length === 0) {
            console.log('No analytics agent found.');
            return;
        }

        for (const agent of result.rows) {
            console.log('='.repeat(80));
            console.log(`Agent: ${agent.name}`);
            console.log(`ID: ${agent.id}`);
            console.log(`Type: ${agent.agent_type}`);
            console.log(`Status: ${agent.status}`);
            console.log('\nRole:');
            console.log('-'.repeat(80));
            console.log(agent.role);
            console.log('-'.repeat(80));
            console.log('\nConfig:');
            console.log(JSON.stringify(agent.config, null, 2));
            console.log('='.repeat(80));
            console.log();
        }

    } catch (error) {
        console.error('Error checking agent:', error);
        throw error;
    } finally {
        client.release();
    }
}

checkAnalyticsAgent()
    .then(() => {
        console.log('\nDone!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Failed:', error);
        process.exit(1);
    });
