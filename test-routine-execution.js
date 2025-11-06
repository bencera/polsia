/**
 * Test script to trigger a routine execution
 */

require('dotenv').config();
const { pool } = require('./db');
const { runRoutine } = require('./services/routine-executor');

async function testRoutineExecution() {
    const client = await pool.connect();
    try {
        // Get first active routine
        const result = await client.query(`
            SELECT r.*, a.name as agent_name
            FROM routines r
            INNER JOIN agents a ON r.agent_id = a.id
            WHERE r.status = 'active'
            LIMIT 1
        `);

        if (result.rows.length === 0) {
            console.log('No active routines found');
            return;
        }

        const routine = result.rows[0];
        console.log(`\n🧪 Testing routine execution:`);
        console.log(`  Routine: ${routine.name} (ID: ${routine.id})`);
        console.log(`  Agent: ${routine.agent_name}`);
        console.log(`  User ID: ${routine.user_id}\n`);

        // Trigger execution
        console.log('⚡ Triggering routine...\n');
        const execution = await runRoutine(routine.id, routine.user_id, {
            trigger_type: 'manual_test'
        });

        console.log('\n✅ Execution triggered:');
        console.log(`  Execution ID: ${execution.id}`);
        console.log(`  Status: ${execution.status}`);

        // Wait a bit and check status
        console.log('\n⏳ Waiting 5 seconds to check status...\n');
        await new Promise(resolve => setTimeout(resolve, 5000));

        const statusResult = await client.query(`
            SELECT status, error_message
            FROM module_executions
            WHERE id = $1
        `, [execution.id]);

        const status = statusResult.rows[0];
        console.log('📊 Final status:');
        console.log(`  Status: ${status.status}`);
        if (status.error_message) {
            console.log(`  Error: ${status.error_message}`);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
    } finally {
        client.release();
        await pool.end();
        process.exit(0);
    }
}

testRoutineExecution();
