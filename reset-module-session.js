#!/usr/bin/env node

const { pool } = require('./db.js');

async function resetModuleSession(moduleId) {
    const client = await pool.connect();
    try {
        await client.query(
            'UPDATE modules SET session_id = NULL WHERE id = $1',
            [moduleId]
        );
        console.log(`✅ Reset session_id for module ${moduleId}`);
    } finally {
        client.release();
    }
    process.exit(0);
}

const moduleId = process.argv[2] || 8;
resetModuleSession(parseInt(moduleId));
