const { pool } = require('./db');

async function checkSchema() {
    try {
        const result = await pool.query(`
            SELECT id, name, agent_type, execution_mode, schedule_frequency, last_run_at, next_run_at
            FROM agents
            ORDER BY id
            LIMIT 3
        `);

        console.log('Sample agents with new execution_mode fields:\n');
        result.rows.forEach(agent => {
            console.log(`ID ${agent.id}: ${agent.name}`);
            console.log(`  - agent_type: ${agent.agent_type}`);
            console.log(`  - execution_mode: ${agent.execution_mode}`);
            console.log(`  - schedule_frequency: ${agent.schedule_frequency || '(none)'}`);
            console.log(`  - last_run_at: ${agent.last_run_at || '(never)'}`);
            console.log(`  - next_run_at: ${agent.next_run_at || '(not scheduled)'}`);
            console.log();
        });

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkSchema();
