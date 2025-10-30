#!/usr/bin/env node

/**
 * Generate JWT token directly from database (for testing)
 */

require('dotenv').config();
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const JWT_SECRET = process.env.JWT_SECRET;

async function generateToken() {
    try {
        // Get the first user from the database
        const result = await pool.query('SELECT * FROM users LIMIT 1');

        if (result.rows.length === 0) {
            console.error('❌ No users found in database');
            process.exit(1);
        }

        const user = result.rows[0];
        console.log('✅ Found user:', user.email);

        // Generate JWT token
        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

        console.log('\n' + '=' .repeat(60));
        console.log('JWT TOKEN');
        console.log('=' .repeat(60));
        console.log(token);
        console.log('=' .repeat(60));
        console.log('\n💡 To use this token:');
        console.log(`\n   export POLSIA_JWT_TOKEN="${token}"`);
        console.log('\n   node scripts/autonomous-repo-update.js');
        console.log('');

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

generateToken();
