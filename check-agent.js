const { pool } = require('./db');

async function checkAgent() {
    try {
        const result = await pool.query(
            "SELECT id, name, agent_type, user_id, status FROM agents WHERE agent_type = 'donation_thanker'"
        );

        console.log('Donation Thanker agents found:', result.rows.length);
        console.log(result.rows);

        // Also check all agents
        const allAgents = await pool.query('SELECT id, name, agent_type, user_id FROM agents ORDER BY id');
        console.log('\nAll agents:');
        allAgents.rows.forEach(agent => {
            console.log(`  ID ${agent.id}: ${agent.name} (${agent.agent_type}) - user_id: ${agent.user_id}`);
        });

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkAgent();
