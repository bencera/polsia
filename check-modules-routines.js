const { pool } = require('./db');

async function checkData() {
    try {
        // Check modules
        const modules = await pool.query('SELECT id, name, type, frequency, status FROM modules ORDER BY id');
        console.log(`\n=== MODULES (${modules.rows.length}) ===`);
        modules.rows.forEach(m => {
            console.log(`  ID ${m.id}: ${m.name} (${m.type}) - ${m.frequency} - ${m.status}`);
        });

        // Check routines
        const routines = await pool.query(`
            SELECT r.id, r.name, r.type, r.frequency, r.status, r.agent_id, a.name as agent_name
            FROM routines r
            LEFT JOIN agents a ON r.agent_id = a.id
            ORDER BY r.id
        `);
        console.log(`\n=== ROUTINES (${routines.rows.length}) ===`);
        routines.rows.forEach(r => {
            console.log(`  ID ${r.id}: ${r.name} (${r.type}) - ${r.frequency} - ${r.status}`);
            console.log(`    → belongs to agent ${r.agent_id} (${r.agent_name || 'unknown'})`);
        });

        // Check agents
        const agents = await pool.query('SELECT id, name, agent_type, execution_mode FROM agents ORDER BY id');
        console.log(`\n=== AGENTS (${agents.rows.length}) ===`);
        agents.rows.forEach(a => {
            console.log(`  ID ${a.id}: ${a.name} (${a.agent_type}) - mode: ${a.execution_mode}`);
        });

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkData();
