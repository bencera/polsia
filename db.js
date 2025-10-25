require('dotenv').config();
const { Pool } = require('pg');

// Create a connection pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Test connection
pool.on('connect', () => {
    console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    console.error('❌ Unexpected error on idle PostgreSQL client', err);
    process.exit(-1);
});

// Initialize database tables
async function initDatabase() {
    const client = await pool.connect();
    try {
        // Create waitlist table if it doesn't exist
        await client.query(`
            CREATE TABLE IF NOT EXISTS waitlist (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create index on email for faster lookups
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_waitlist_email ON waitlist(email);
        `);

        console.log('✅ Database tables initialized');
    } catch (err) {
        console.error('❌ Error initializing database:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Add email to waitlist
async function addToWaitlist(email) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'INSERT INTO waitlist (email) VALUES ($1) ON CONFLICT (email) DO NOTHING RETURNING *',
            [email]
        );

        if (result.rows.length > 0) {
            return { success: true, message: 'Added to waitlist', data: result.rows[0] };
        } else {
            return { success: true, message: 'Email already on waitlist' };
        }
    } catch (err) {
        console.error('Error adding to waitlist:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Get waitlist count
async function getWaitlistCount() {
    const client = await pool.connect();
    try {
        const result = await client.query('SELECT COUNT(*) FROM waitlist');
        return parseInt(result.rows[0].count);
    } catch (err) {
        console.error('Error getting waitlist count:', err);
        throw err;
    } finally {
        client.release();
    }
}

module.exports = {
    pool,
    initDatabase,
    addToWaitlist,
    getWaitlistCount,
};
