#!/usr/bin/env node

/**
 * Setup test modules script
 * - Disables Security Patcher auto-run
 * - Creates Footer Copyright Updater for fast testing
 */

const { pool } = require('../db');

async function main() {
    const client = await pool.connect();

    try {
        console.log('🔧 Setting up test modules...\n');

        // 1. Update Security Patcher to manual frequency
        console.log('1️⃣  Updating Security Patcher to manual frequency...');
        const updateResult = await client.query(
            `UPDATE modules
             SET frequency = 'manual'
             WHERE id = 1 AND user_id = 1
             RETURNING name, frequency`
        );

        if (updateResult.rows.length > 0) {
            console.log(`   ✅ ${updateResult.rows[0].name} → frequency: ${updateResult.rows[0].frequency}`);
            console.log('      (Will no longer auto-run on server restart)\n');
        } else {
            console.log('   ⚠️  Security Patcher not found (module ID 1)\n');
        }

        // 2. Create Footer Copyright Updater module
        console.log('2️⃣  Creating Footer Copyright Updater module...');

        // Check if it already exists
        const existingModule = await client.query(
            `SELECT id, name FROM modules WHERE name = 'Footer Copyright Updater' AND user_id = 1`
        );

        if (existingModule.rows.length > 0) {
            console.log(`   ℹ️  Module already exists (ID: ${existingModule.rows[0].id})`);
            console.log('   Updating configuration...');

            const config = {
                goal: 'Change the copyright name in the footer of the landing page from "Polsia Inc." to "Polsia AI". The landing page is at client/src/pages/Landing.jsx. Use GitHub MCP to create a PR with the change.',
                mcpMounts: ['github'],
                inputs: {
                    repo: 'Polsia-Inc/newco-app',
                    branch: 'main',
                    file: 'client/src/pages/Landing.jsx',
                    oldText: 'Polsia Inc.',
                    newText: 'Polsia AI'
                },
                maxTurns: 10
            };

            await client.query(
                `UPDATE modules
                 SET config = $1,
                     frequency = 'manual',
                     status = 'active',
                     description = 'Updates the copyright name in the landing page footer'
                 WHERE id = $2`,
                [JSON.stringify(config), existingModule.rows[0].id]
            );

            console.log(`   ✅ Module updated (ID: ${existingModule.rows[0].id})\n`);
        } else {
            const config = {
                goal: 'Change the copyright name in the footer of the landing page from "Polsia Inc." to "Polsia AI". The landing page is at client/src/pages/Landing.jsx. Use GitHub MCP to create a PR with the change.',
                mcpMounts: ['github'],
                inputs: {
                    repo: 'Polsia-Inc/newco-app',
                    branch: 'main',
                    file: 'client/src/pages/Landing.jsx',
                    oldText: 'Polsia Inc.',
                    newText: 'Polsia AI'
                },
                maxTurns: 10
            };

            const insertResult = await client.query(
                `INSERT INTO modules (
                    user_id, name, description, type, frequency, status, config, created_at, updated_at
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
                 RETURNING id, name, frequency`,
                [
                    1,  // user_id
                    'Footer Copyright Updater',
                    'Updates the copyright name in the landing page footer',
                    'maintenance',
                    'manual',  // Manual so we can trigger it for testing
                    'active',
                    JSON.stringify(config)
                ]
            );

            console.log(`   ✅ Module created!`);
            console.log(`      ID: ${insertResult.rows[0].id}`);
            console.log(`      Name: ${insertResult.rows[0].name}`);
            console.log(`      Frequency: ${insertResult.rows[0].frequency}\n`);
        }

        // 3. List all modules
        console.log('📋 Current modules:');
        const modules = await client.query(
            `SELECT id, name, frequency, status, type
             FROM modules
             WHERE user_id = 1
             ORDER BY id`
        );

        modules.rows.forEach(mod => {
            const activeSymbol = mod.status === 'active' ? '🟢' : '🔴';
            const freqEmoji = mod.frequency === 'manual' ? '👆' : '🔄';
            console.log(`   ${activeSymbol} ${freqEmoji} [${mod.id}] ${mod.name} (${mod.frequency}, ${mod.type})`);
        });

        console.log('\n🎉 Setup complete!');
        console.log('\n💡 Next steps:');
        console.log('   1. Go to http://localhost:5173/modules');
        console.log('   2. Click "Run" on Footer Copyright Updater');
        console.log('   3. Watch the AI task summary generate in Dashboard feed');
        console.log('   4. Security Patcher will NOT auto-run anymore\n');

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        client.release();
        process.exit(0);
    }
}

main();
