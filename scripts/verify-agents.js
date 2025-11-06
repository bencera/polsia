#!/usr/bin/env node

/**
 * Quick verification script for agents system
 */

const { pool } = require('../db');

async function verify() {
    try {
        console.log('🔍 Verifying agents system...\n');

        // Check agents table
        const agents = await pool.query('SELECT id, name, agent_type, status FROM agents ORDER BY id');
        console.log(`✅ Agents table: ${agents.rows.length} agents found`);
        agents.rows.forEach(a => {
            console.log(`   - [${a.id}] ${a.name} (${a.agent_type}) - ${a.status}`);
        });
        console.log();

        // Check tasks table has assigned_to_agent_id column
        const columns = await pool.query(`
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'tasks' AND column_name IN ('assigned_to_agent_id', 'assigned_to_module_id')
            ORDER BY column_name
        `);
        console.log(`✅ Tasks table columns: ${columns.rows.length} assignment columns found`);
        columns.rows.forEach(c => {
            console.log(`   - ${c.column_name} (${c.data_type})`);
        });
        console.log();

        // Check Brain CEO module exists
        const brainCeo = await pool.query("SELECT id, name, type FROM modules WHERE type = 'brain_ceo'");
        console.log(`✅ Brain CEO module: ${brainCeo.rows.length > 0 ? 'Found' : 'NOT FOUND'}`);
        if (brainCeo.rows.length > 0) {
            console.log(`   - [${brainCeo.rows[0].id}] ${brainCeo.rows[0].name}`);
        }
        console.log();

        console.log('🎉 Agents system verification complete!\n');

    } catch (error) {
        console.error('❌ Verification failed:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

verify();
