#!/usr/bin/env node

/**
 * Check execution logs in database
 */

require('dotenv').config();
const { pool } = require('../db');

async function checkLogs() {
    const client = await pool.connect();
    try {
        // Check recent executions
        console.log('\n📊 Recent Executions:');
        const executions = await client.query(`
            SELECT id, module_id, status, started_at, completed_at
            FROM module_executions
            ORDER BY id DESC
            LIMIT 5
        `);
        console.table(executions.rows);

        // Check logs for each execution
        console.log('\n📝 Logs per Execution:');
        const logCounts = await client.query(`
            SELECT execution_id, COUNT(*) as log_count
            FROM execution_logs
            GROUP BY execution_id
            ORDER BY execution_id DESC
            LIMIT 10
        `);
        console.table(logCounts.rows);

        // Show sample logs from latest execution
        if (executions.rows.length > 0) {
            const latestExecutionId = executions.rows[0].id;
            console.log(`\n📋 Sample logs from execution ${latestExecutionId}:`);
            const sampleLogs = await client.query(`
                SELECT timestamp, log_level, stage, message
                FROM execution_logs
                WHERE execution_id = $1
                ORDER BY timestamp DESC
                LIMIT 10
            `, [latestExecutionId]);
            console.table(sampleLogs.rows);
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        client.release();
        process.exit(0);
    }
}

checkLogs();
