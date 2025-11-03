require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function checkExecutionLogs() {
  const executionId = process.argv[2] || 82;

  const client = await pool.connect();
  try {
    console.log(`\n=== EXECUTION LOGS FOR ID: ${executionId} ===\n`);

    const result = await client.query(
      `SELECT log_level, stage, message, metadata, created_at
       FROM execution_logs
       WHERE execution_id = $1
       ORDER BY created_at DESC
       LIMIT 30`,
      [executionId]
    );

    if (result.rows.length === 0) {
      console.log('No logs found');
    } else {
      result.rows.reverse().forEach((log, i) => {
        console.log(`[${i + 1}] ${log.created_at.toISOString().substring(11, 19)} | ${log.log_level.toUpperCase()} | ${log.stage || 'N/A'}`);
        console.log(`    ${log.message}`);
        if (log.metadata && Object.keys(log.metadata).length > 0) {
          console.log(`    Metadata:`, log.metadata);
        }
        console.log();
      });
    }

    // Check execution status
    const execResult = await client.query(
      'SELECT status, error_message, duration_ms, cost_usd, metadata FROM module_executions WHERE id = $1',
      [executionId]
    );

    if (execResult.rows.length > 0) {
      console.log('=== EXECUTION STATUS ===');
      console.log(execResult.rows[0]);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

checkExecutionLogs();
