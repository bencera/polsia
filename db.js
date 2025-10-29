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

        // Create users table
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                name VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create index on email for faster lookups
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        `);

        // Create tasks table
        await client.query(`
            CREATE TABLE IF NOT EXISTS tasks (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                status VARCHAR(50) DEFAULT 'completed',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP
            );
        `);

        // Create index on user_id for faster lookups
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
        `);

        // Create service_connections table
        await client.query(`
            CREATE TABLE IF NOT EXISTS service_connections (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                service_name VARCHAR(50) NOT NULL,
                status VARCHAR(50) DEFAULT 'connected',
                metadata JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create index on user_id for faster lookups
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_service_connections_user_id ON service_connections(user_id);
        `);

        // Create task_services junction table (many-to-many)
        await client.query(`
            CREATE TABLE IF NOT EXISTS task_services (
                id SERIAL PRIMARY KEY,
                task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
                service_connection_id INTEGER NOT NULL REFERENCES service_connections(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(task_id, service_connection_id)
            );
        `);

        // Create indexes for junction table
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_task_services_task_id ON task_services(task_id);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_task_services_service_id ON task_services(service_connection_id);
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

// Get user by email
async function getUserByEmail(email) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );
        return result.rows[0] || null;
    } catch (err) {
        console.error('Error getting user by email:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Get user by ID
async function getUserById(id) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT id, email, name, created_at, updated_at FROM users WHERE id = $1',
            [id]
        );
        return result.rows[0] || null;
    } catch (err) {
        console.error('Error getting user by ID:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Get tasks for a user with their associated services
async function getTasksByUserId(userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(`
            SELECT
                t.id,
                t.title,
                t.description,
                t.status,
                t.created_at,
                t.completed_at,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'id', sc.id,
                            'service_name', sc.service_name,
                            'status', sc.status
                        )
                    ) FILTER (WHERE sc.id IS NOT NULL),
                    '[]'
                ) as services
            FROM tasks t
            LEFT JOIN task_services ts ON t.id = ts.task_id
            LEFT JOIN service_connections sc ON ts.service_connection_id = sc.id
            WHERE t.user_id = $1
            GROUP BY t.id
            ORDER BY t.created_at DESC
        `, [userId]);
        return result.rows;
    } catch (err) {
        console.error('Error getting tasks:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Get service connections for a user
async function getServiceConnectionsByUserId(userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT * FROM service_connections WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );
        return result.rows;
    } catch (err) {
        console.error('Error getting service connections:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Update service connection status
async function updateServiceConnectionStatus(connectionId, userId, status) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'UPDATE service_connections SET status = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
            [status, connectionId, userId]
        );
        return result.rows[0] || null;
    } catch (err) {
        console.error('Error updating service connection:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Store GitHub connection with encrypted token
async function storeGitHubConnection(userId, githubData, encryptedToken) {
    const client = await pool.connect();
    try {
        // Combine GitHub user data with encrypted token in metadata
        const metadata = {
            ...githubData,
            encrypted_token: encryptedToken.encrypted,
            token_iv: encryptedToken.iv,
            token_auth_tag: encryptedToken.authTag
        };

        // Check if user already has a GitHub connection
        const existingResult = await client.query(
            'SELECT id FROM service_connections WHERE user_id = $1 AND service_name = $2',
            [userId, 'github']
        );

        if (existingResult.rows.length > 0) {
            // Update existing connection
            const result = await client.query(
                'UPDATE service_connections SET status = $1, metadata = $2 WHERE id = $3 RETURNING *',
                ['connected', metadata, existingResult.rows[0].id]
            );
            return result.rows[0];
        } else {
            // Create new connection
            const result = await client.query(
                'INSERT INTO service_connections (user_id, service_name, status, metadata) VALUES ($1, $2, $3, $4) RETURNING *',
                [userId, 'github', 'connected', metadata]
            );
            return result.rows[0];
        }
    } catch (err) {
        console.error('Error storing GitHub connection:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Get decrypted GitHub token for a user
async function getGitHubToken(userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT metadata FROM service_connections WHERE user_id = $1 AND service_name = $2 AND status = $3',
            [userId, 'github', 'connected']
        );

        if (result.rows.length === 0) {
            return null;
        }

        const metadata = result.rows[0].metadata;

        // Check if encrypted token data exists
        if (!metadata || !metadata.encrypted_token || !metadata.token_iv || !metadata.token_auth_tag) {
            console.error('GitHub connection exists but encrypted token data is missing');
            return null;
        }

        // Return encrypted token data (decryption will be done by the caller)
        return {
            encrypted: metadata.encrypted_token,
            iv: metadata.token_iv,
            authTag: metadata.token_auth_tag
        };
    } catch (err) {
        console.error('Error getting GitHub token:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Delete GitHub connection
async function deleteGitHubConnection(connectionId, userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'DELETE FROM service_connections WHERE id = $1 AND user_id = $2 AND service_name = $3 RETURNING *',
            [connectionId, userId, 'github']
        );
        return result.rows.length > 0;
    } catch (err) {
        console.error('Error deleting GitHub connection:', err);
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
    getUserByEmail,
    getUserById,
    getTasksByUserId,
    getServiceConnectionsByUserId,
    updateServiceConnectionStatus,
    storeGitHubConnection,
    getGitHubToken,
    deleteGitHubConnection,
};
