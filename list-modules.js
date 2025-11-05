#!/usr/bin/env node

const { pool } = require('./db.js');

async function listModules() {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `SELECT id, user_id, name, type, status, session_id
             FROM modules
             ORDER BY id`
        );

        console.log('\n📋 All modules in database:\n');
        if (result.rows.length === 0) {
            console.log('   (no modules found)\n');
        } else {
            result.rows.forEach(m => {
                console.log(`   ID: ${m.id} | User: ${m.user_id} | ${m.name} (${m.type})`);
                console.log(`        Status: ${m.status} | Session: ${m.session_id || '(none)'}`);
                console.log('');
            });
        }
    } finally {
        client.release();
    }
    process.exit(0);
}

listModules();
