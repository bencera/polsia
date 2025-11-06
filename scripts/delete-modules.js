#!/usr/bin/env node

/**
 * Delete Specific Modules Script
 *
 * This script deletes specific modules by name from the database.
 * Run manually: node scripts/delete-modules.js
 */

const { pool } = require('../db');

// List of module names to delete
const MODULES_TO_DELETE = [
    'Analytics Sub-Agents Demo',
    'All Analytics',
    'Fetch App Store Analytics Data',
    'App Store Analytics Integrator',
    'App Analytics Reporter',
    'App Metadata Updater',
    'App Store Review Monitor',
    'TestFlight Beta Manager',
    'Footer Copyright Updater',
    'Email Importance Analyzer',
    'Email MCP Spam Archiver',
    'Email Summarizer',
];

/**
 * Main deletion function
 */
async function main() {
    const client = await pool.connect();

    try {
        console.log('🗑️  Deleting specified modules...\n');

        for (const moduleName of MODULES_TO_DELETE) {
            // Check if module exists
            const existingModule = await client.query(
                `SELECT id, name, user_id FROM modules WHERE name = $1`,
                [moduleName]
            );

            if (existingModule.rows.length > 0) {
                const module = existingModule.rows[0];
                console.log(`   ❌ Deleting: ${moduleName} (ID: ${module.id})`);

                // Delete the module
                await client.query(
                    `DELETE FROM modules WHERE id = $1`,
                    [module.id]
                );

                console.log(`      ✅ Deleted successfully`);
            } else {
                console.log(`   ⏭️  Skipping: ${moduleName} (not found)`);
            }
        }

        console.log('\n✅ Module deletion complete!\n');

        // List remaining modules
        console.log('📋 Remaining modules:');
        const modules = await client.query(
            `SELECT id, name, frequency, status, type
             FROM modules
             ORDER BY id`
        );

        if (modules.rows.length === 0) {
            console.log('   (No modules found)\n');
        } else {
            modules.rows.forEach(mod => {
                const activeSymbol = mod.status === 'active' ? '🟢' : '🔴';
                const freqEmoji = mod.frequency === 'manual' ? '👆' : '🔄';
                console.log(`   ${activeSymbol} ${freqEmoji} [${mod.id}] ${mod.name} (${mod.frequency}, ${mod.type})`);
            });
            console.log();
        }

    } catch (error) {
        console.error('❌ Error deleting modules:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = { MODULES_TO_DELETE };
