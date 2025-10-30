#!/usr/bin/env node

/**
 * Check if user has GitHub connected
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function checkGitHubConnection() {
    try {
        const result = await pool.query(`
            SELECT
                u.id,
                u.email,
                sc.service_name,
                sc.status,
                sc.metadata->>'username' as github_username
            FROM users u
            LEFT JOIN service_connections sc ON u.id = sc.user_id AND sc.service_name = 'github'
            WHERE u.id = 1
        `);

        if (result.rows.length === 0) {
            console.log('❌ User not found');
            process.exit(1);
        }

        const row = result.rows[0];
        console.log('User:', row.email);

        if (row.service_name === 'github' && row.status === 'connected') {
            console.log('✅ GitHub connected as:', row.github_username);
        } else {
            console.log('❌ GitHub not connected');
            console.log('\n💡 To connect GitHub:');
            console.log('   1. Start the frontend (npm run client)');
            console.log('   2. Login to Polsia');
            console.log('   3. Go to Connections page');
            console.log('   4. Connect GitHub account');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

checkGitHubConnection();
