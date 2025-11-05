#!/usr/bin/env node

const { pool, getModulesByUserId, getModuleExecutions } = require('./db.js');

async function testSessionResumption() {
    try {
        // Get the Render Analytics module for user 1
        const client = await pool.connect();
        try {
            const result = await client.query(
                `SELECT id, name, type, session_id
                 FROM modules
                 WHERE type = 'render_analytics' AND user_id = 1
                 LIMIT 1`
            );

            if (result.rows.length === 0) {
                console.log('❌ No Render Analytics module found for user 1');
                process.exit(1);
            }

            const module = result.rows[0];
            console.log('\n📊 Render Analytics Module:');
            console.log(`   ID: ${module.id}`);
            console.log(`   Name: ${module.name}`);
            console.log(`   Type: ${module.type}`);
            console.log(`   Session ID: ${module.session_id || '(none yet)'}\n`);

            if (!module.session_id) {
                console.log('✨ This module has no session ID yet.');
                console.log('💡 When you run it for the first time, it will create a new session.');
                console.log('🔄 On the second run, it will resume from that session.\n');
            } else {
                console.log('✅ This module has a session ID saved!');
                console.log('🔄 Next run will resume from this session for continuous learning.\n');

                // Get recent executions
                const executions = await client.query(
                    `SELECT id, status, metadata, created_at
                     FROM module_executions
                     WHERE module_id = $1
                     ORDER BY created_at DESC
                     LIMIT 3`,
                    [module.id]
                );

                if (executions.rows.length > 0) {
                    console.log('📜 Recent executions:');
                    executions.rows.forEach((exec, i) => {
                        const sessionId = exec.metadata?.session_id;
                        console.log(`   ${i + 1}. Execution ${exec.id} - ${exec.status} - ${exec.created_at.toLocaleString()}`);
                        if (sessionId) {
                            console.log(`      Session: ${sessionId}`);
                        }
                    });
                }
            }

        } finally {
            client.release();
        }

        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err.message);
        process.exit(1);
    }
}

testSessionResumption();
