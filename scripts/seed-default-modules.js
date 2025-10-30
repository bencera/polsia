#!/usr/bin/env node

/**
 * Seed Default Modules Script
 *
 * This script seeds baseline modules that should exist in all environments.
 * - Run manually: node scripts/seed-default-modules.js
 * - Run after deployment: Add to Render deploy command
 * - Idempotent: Safe to run multiple times (upserts based on name)
 *
 * Environment-specific behavior:
 * - Production: Only creates essential modules
 * - Development: Creates essential + test modules
 */

const { pool } = require('../db');

// Determine environment
const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';

/**
 * Define baseline modules that should exist in all environments
 */
const ESSENTIAL_MODULES = [
    {
        name: 'Security Patcher',
        description: 'Monitors and patches security vulnerabilities in dependencies',
        type: 'security',
        frequency: 'weekly',  // Run weekly in production
        config: {
            goal: 'Scan for security vulnerabilities in package.json dependencies, create a new branch with fixes, and submit a GitHub PR if vulnerabilities are found.',
            mcpMounts: ['github'],
            inputs: {
                repo: 'Polsia-Inc/newco-app',
                branch: 'main',
            },
            maxTurns: 30,
        },
    },
];

/**
 * Test modules for development environment only
 */
const DEV_TEST_MODULES = [
    {
        name: 'Footer Copyright Updater',
        description: 'Updates the copyright name in the landing page footer',
        type: 'maintenance',
        frequency: 'manual',
        config: {
            goal: 'Change the copyright name in the footer of the landing page from "Polsia Inc." to "Polsia AI". The landing page is at client/src/pages/Landing.jsx. Use GitHub MCP to create a PR with the change.',
            mcpMounts: ['github'],
            inputs: {
                repo: 'Polsia-Inc/newco-app',
                branch: 'main',
                file: 'client/src/pages/Landing.jsx',
                oldText: 'Polsia Inc.',
                newText: 'Polsia AI',
            },
            maxTurns: 10,
        },
    },
];

/**
 * Upsert a module (insert or update if exists)
 */
async function upsertModule(client, userId, moduleData) {
    const { name, description, type, frequency, config } = moduleData;

    // Check if module already exists
    const existingModule = await client.query(
        `SELECT id, name, frequency, status FROM modules WHERE name = $1 AND user_id = $2`,
        [name, userId]
    );

    if (existingModule.rows.length > 0) {
        // Update existing module
        const module = existingModule.rows[0];
        console.log(`   📝 Updating existing module: ${name} (ID: ${module.id})`);

        await client.query(
            `UPDATE modules
             SET description = $1,
                 type = $2,
                 frequency = $3,
                 config = $4,
                 status = 'active',
                 updated_at = NOW()
             WHERE id = $5`,
            [description, type, frequency, JSON.stringify(config), module.id]
        );

        console.log(`      ✅ Updated: ${name} → frequency: ${frequency}`);
        return module.id;
    } else {
        // Insert new module
        console.log(`   ➕ Creating new module: ${name}`);

        const result = await client.query(
            `INSERT INTO modules (
                user_id, name, description, type, frequency, status, config, created_at, updated_at
             ) VALUES ($1, $2, $3, $4, $5, 'active', $6, NOW(), NOW())
             RETURNING id, name, frequency`,
            [userId, name, description, type, frequency, JSON.stringify(config)]
        );

        console.log(`      ✅ Created: ${name} (ID: ${result.rows[0].id}) → frequency: ${frequency}`);
        return result.rows[0].id;
    }
}

/**
 * Get or create demo user (for production first-time setup)
 */
async function getOrCreateDemoUser(client) {
    // Try to find existing user
    const existingUser = await client.query(
        `SELECT id, email FROM users ORDER BY id LIMIT 1`
    );

    if (existingUser.rows.length > 0) {
        return existingUser.rows[0].id;
    }

    // In production, we should have users from the auth system
    // This is just a safety fallback
    console.log('   ⚠️  No users found. Modules will be created when first user registers.');
    return null;
}

/**
 * Main seeding function
 */
async function main() {
    const client = await pool.connect();

    try {
        console.log('🌱 Seeding default modules...\n');
        console.log(`   Environment: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}\n`);

        // Get user ID to associate modules with
        const userId = await getOrCreateDemoUser(client);

        if (!userId) {
            console.log('⚠️  Skipping module seeding (no users exist yet)\n');
            console.log('💡 Modules will be seeded when first user registers.\n');
            return;
        }

        console.log(`   Using user ID: ${userId}\n`);

        // 1. Seed essential modules (all environments)
        console.log('📦 Essential Modules (all environments):');
        for (const moduleData of ESSENTIAL_MODULES) {
            await upsertModule(client, userId, moduleData);
        }
        console.log();

        // 2. Seed test modules (dev only)
        if (!isProduction) {
            console.log('🧪 Test Modules (development only):');
            for (const moduleData of DEV_TEST_MODULES) {
                await upsertModule(client, userId, moduleData);
            }
            console.log();
        }

        // 3. List all modules
        console.log('📋 Current modules:');
        const modules = await client.query(
            `SELECT id, name, frequency, status, type
             FROM modules
             WHERE user_id = $1
             ORDER BY id`,
            [userId]
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

        console.log('✅ Module seeding complete!\n');

        if (isProduction) {
            console.log('💡 Production notes:');
            console.log('   - Security Patcher will run weekly');
            console.log('   - Test modules are not created in production\n');
        } else {
            console.log('💡 Development notes:');
            console.log('   - Security Patcher frequency: weekly (but you can run manually)');
            console.log('   - Footer Copyright Updater: manual (for testing)');
            console.log('   - Run modules from: http://localhost:5173/modules\n');
        }

    } catch (error) {
        console.error('❌ Error seeding modules:', error.message);
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

module.exports = { upsertModule, ESSENTIAL_MODULES, DEV_TEST_MODULES };
