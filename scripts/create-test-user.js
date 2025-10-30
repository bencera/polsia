#!/usr/bin/env node

/**
 * Create a test user for development/testing
 */

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function createTestUser() {
    const email = 'test@polsia.ai';
    const password = 'testpassword123';
    const name = 'Test User';

    try {
        // Check if user already exists
        const existingUser = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );

        if (existingUser.rows.length > 0) {
            console.log('✅ Test user already exists');
            console.log('Email:', email);
            console.log('Password:', password);
            return existingUser.rows[0];
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const result = await pool.query(
            'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING *',
            [email, hashedPassword, name]
        );

        console.log('✅ Test user created successfully');
        console.log('Email:', email);
        console.log('Password:', password);
        console.log('User ID:', result.rows[0].id);

        return result.rows[0];

    } catch (error) {
        console.error('❌ Error creating test user:', error.message);
        throw error;
    } finally {
        await pool.end();
    }
}

createTestUser()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
