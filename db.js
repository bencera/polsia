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

// ===== MODULE FUNCTIONS =====

// Get all modules for a user
async function getModulesByUserId(userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT * FROM modules WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );
        return result.rows;
    } catch (err) {
        console.error('Error getting modules:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Get a specific module by ID
async function getModuleById(moduleId, userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT * FROM modules WHERE id = $1 AND user_id = $2',
            [moduleId, userId]
        );
        return result.rows[0] || null;
    } catch (err) {
        console.error('Error getting module by ID:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Create a new module
async function createModule(userId, moduleData) {
    const client = await pool.connect();
    try {
        const { name, description, type, status, frequency, config } = moduleData;
        const result = await client.query(
            `INSERT INTO modules (user_id, name, description, type, status, frequency, config)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [userId, name, description || null, type, status || 'active', frequency || 'auto', config || null]
        );
        return result.rows[0];
    } catch (err) {
        console.error('Error creating module:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Update a module
async function updateModule(moduleId, userId, updates) {
    const client = await pool.connect();
    try {
        const setClauses = [];
        const values = [];
        let paramCount = 1;

        // Build dynamic SET clause
        if (updates.name !== undefined) {
            setClauses.push(`name = $${paramCount++}`);
            values.push(updates.name);
        }
        if (updates.description !== undefined) {
            setClauses.push(`description = $${paramCount++}`);
            values.push(updates.description);
        }
        if (updates.type !== undefined) {
            setClauses.push(`type = $${paramCount++}`);
            values.push(updates.type);
        }
        if (updates.status !== undefined) {
            setClauses.push(`status = $${paramCount++}`);
            values.push(updates.status);
        }
        if (updates.frequency !== undefined) {
            setClauses.push(`frequency = $${paramCount++}`);
            values.push(updates.frequency);
        }
        if (updates.config !== undefined) {
            setClauses.push(`config = $${paramCount++}`);
            values.push(updates.config);
        }

        // Always update updated_at
        setClauses.push(`updated_at = CURRENT_TIMESTAMP`);

        // Add WHERE clause params
        values.push(moduleId, userId);

        const query = `UPDATE modules SET ${setClauses.join(', ')}
                       WHERE id = $${paramCount++} AND user_id = $${paramCount++}
                       RETURNING *`;

        const result = await client.query(query, values);
        return result.rows[0] || null;
    } catch (err) {
        console.error('Error updating module:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Delete a module
async function deleteModule(moduleId, userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'DELETE FROM modules WHERE id = $1 AND user_id = $2 RETURNING *',
            [moduleId, userId]
        );
        return result.rows.length > 0;
    } catch (err) {
        console.error('Error deleting module:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Get execution history for a module
async function getModuleExecutions(moduleId, userId, limit = 50) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `SELECT * FROM module_executions
             WHERE module_id = $1 AND user_id = $2
             ORDER BY created_at DESC
             LIMIT $3`,
            [moduleId, userId, limit]
        );
        return result.rows;
    } catch (err) {
        console.error('Error getting module executions:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Create a new module execution record
async function createModuleExecution(moduleId, userId, executionData) {
    const client = await pool.connect();
    try {
        const { trigger_type, status } = executionData;
        const result = await client.query(
            `INSERT INTO module_executions (module_id, user_id, status, trigger_type, started_at)
             VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
             RETURNING *`,
            [moduleId, userId, status || 'pending', trigger_type || 'manual']
        );
        return result.rows[0];
    } catch (err) {
        console.error('Error creating module execution:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Update a module execution
async function updateModuleExecution(executionId, updates) {
    const client = await pool.connect();
    try {
        const setClauses = [];
        const values = [];
        let paramCount = 1;

        // Build dynamic SET clause
        if (updates.status !== undefined) {
            setClauses.push(`status = $${paramCount++}`);
            values.push(updates.status);
        }
        if (updates.completed_at !== undefined) {
            setClauses.push(`completed_at = $${paramCount++}`);
            values.push(updates.completed_at);
        }
        if (updates.duration_ms !== undefined) {
            setClauses.push(`duration_ms = $${paramCount++}`);
            values.push(updates.duration_ms);
        }
        if (updates.cost_usd !== undefined) {
            setClauses.push(`cost_usd = $${paramCount++}`);
            values.push(updates.cost_usd);
        }
        if (updates.metadata !== undefined) {
            setClauses.push(`metadata = $${paramCount++}`);
            values.push(updates.metadata);
        }
        if (updates.error_message !== undefined) {
            setClauses.push(`error_message = $${paramCount++}`);
            values.push(updates.error_message);
        }

        values.push(executionId);

        const query = `UPDATE module_executions SET ${setClauses.join(', ')}
                       WHERE id = $${paramCount++}
                       RETURNING *`;

        const result = await client.query(query, values);
        return result.rows[0] || null;
    } catch (err) {
        console.error('Error updating module execution:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Get all active modules that might need to run (for scheduler)
async function getActiveModulesForScheduling() {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `SELECT m.*, u.id as user_id, u.email
             FROM modules m
             JOIN users u ON m.user_id = u.id
             WHERE m.status = 'active'
             ORDER BY m.updated_at ASC`
        );
        return result.rows;
    } catch (err) {
        console.error('Error getting active modules for scheduling:', err);
        throw err;
    } finally {
        client.release();
    }
}

// ===== EXECUTION LOGS FUNCTIONS =====

// Save a log entry for a module execution
async function saveExecutionLog(executionId, logData) {
    const client = await pool.connect();
    try {
        const { log_level, stage, message, metadata } = logData;
        const result = await client.query(
            `INSERT INTO execution_logs (execution_id, log_level, stage, message, metadata)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [executionId, log_level || 'info', stage || null, message, metadata || null]
        );
        return result.rows[0];
    } catch (err) {
        console.error('Error saving execution log:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Get all logs for a specific execution
async function getExecutionLogs(executionId, limit = 1000) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `SELECT * FROM execution_logs
             WHERE execution_id = $1
             ORDER BY timestamp ASC
             LIMIT $2`,
            [executionId, limit]
        );
        return result.rows;
    } catch (err) {
        console.error('Error getting execution logs:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Get logs after a specific log ID (for SSE streaming)
async function getExecutionLogsSince(executionId, sinceLogId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `SELECT * FROM execution_logs
             WHERE execution_id = $1 AND id > $2
             ORDER BY id ASC`,
            [executionId, sinceLogId || 0]
        );
        return result.rows;
    } catch (err) {
        console.error('Error getting execution logs since log ID:', err);
        throw err;
    } finally {
        client.release();
    }
}

// ===== GMAIL CONNECTION FUNCTIONS =====

// Store Gmail connection with encrypted tokens
async function storeGmailConnection(userId, googleData, encryptedTokens) {
    const client = await pool.connect();
    try {
        // Combine Google user data with encrypted tokens in metadata
        const metadata = {
            ...googleData,
            encrypted_access_token: encryptedTokens.accessToken.encrypted,
            access_token_iv: encryptedTokens.accessToken.iv,
            access_token_auth_tag: encryptedTokens.accessToken.authTag
        };

        // Add refresh token if available
        if (encryptedTokens.refreshToken) {
            metadata.encrypted_refresh_token = encryptedTokens.refreshToken.encrypted;
            metadata.refresh_token_iv = encryptedTokens.refreshToken.iv;
            metadata.refresh_token_auth_tag = encryptedTokens.refreshToken.authTag;
        }

        // Check if user already has a Gmail connection
        const existingResult = await client.query(
            'SELECT id FROM service_connections WHERE user_id = $1 AND service_name = $2',
            [userId, 'gmail']
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
                [userId, 'gmail', 'connected', metadata]
            );
            return result.rows[0];
        }
    } catch (err) {
        console.error('Error storing Gmail connection:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Get decrypted Gmail tokens for a user
async function getGmailToken(userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT metadata FROM service_connections WHERE user_id = $1 AND service_name = $2 AND status = $3',
            [userId, 'gmail', 'connected']
        );

        if (result.rows.length === 0) {
            return null;
        }

        const metadata = result.rows[0].metadata;

        // Check if encrypted token data exists
        if (!metadata || !metadata.encrypted_access_token || !metadata.access_token_iv || !metadata.access_token_auth_tag) {
            console.error('Gmail connection exists but encrypted token data is missing');
            return null;
        }

        // Return encrypted token data (decryption will be done by the caller)
        const tokens = {
            accessToken: {
                encrypted: metadata.encrypted_access_token,
                iv: metadata.access_token_iv,
                authTag: metadata.access_token_auth_tag
            }
        };

        // Include refresh token if available
        if (metadata.encrypted_refresh_token && metadata.refresh_token_iv && metadata.refresh_token_auth_tag) {
            tokens.refreshToken = {
                encrypted: metadata.encrypted_refresh_token,
                iv: metadata.refresh_token_iv,
                authTag: metadata.refresh_token_auth_tag
            };
        }

        return tokens;
    } catch (err) {
        console.error('Error getting Gmail token:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Delete Gmail connection
async function deleteGmailConnection(connectionId, userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'DELETE FROM service_connections WHERE id = $1 AND user_id = $2 AND service_name = $3 RETURNING *',
            [connectionId, userId, 'gmail']
        );
        return result.rows.length > 0;
    } catch (err) {
        console.error('Error deleting Gmail connection:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Update Gmail tokens (for refresh)
async function updateGmailTokens(userId, encryptedTokens) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT id, metadata FROM service_connections WHERE user_id = $1 AND service_name = $2',
            [userId, 'gmail']
        );

        if (result.rows.length === 0) {
            throw new Error('Gmail connection not found');
        }

        const connectionId = result.rows[0].id;
        const metadata = result.rows[0].metadata || {};

        // Update tokens in metadata
        metadata.encrypted_access_token = encryptedTokens.accessToken.encrypted;
        metadata.access_token_iv = encryptedTokens.accessToken.iv;
        metadata.access_token_auth_tag = encryptedTokens.accessToken.authTag;

        if (encryptedTokens.refreshToken) {
            metadata.encrypted_refresh_token = encryptedTokens.refreshToken.encrypted;
            metadata.refresh_token_iv = encryptedTokens.refreshToken.iv;
            metadata.refresh_token_auth_tag = encryptedTokens.refreshToken.authTag;
        }

        // Update token expiry if provided
        if (encryptedTokens.expiry) {
            metadata.token_expiry = encryptedTokens.expiry;
        }

        await client.query(
            'UPDATE service_connections SET metadata = $1 WHERE id = $2',
            [metadata, connectionId]
        );

        return true;
    } catch (err) {
        console.error('Error updating Gmail tokens:', err);
        throw err;
    } finally {
        client.release();
    }
}

// ===== INSTAGRAM CONNECTION FUNCTIONS =====

// Store Instagram connection
async function storeInstagramConnection(userId, instagramData) {
    const client = await pool.connect();
    try {
        const metadata = {
            username: instagramData.username,
            late_profile_id: instagramData.late_profile_id,
            late_account_id: instagramData.late_account_id || null,
            platform: 'instagram',
            connected_at: new Date().toISOString()
        };

        // Check if user already has an Instagram connection
        const existingResult = await client.query(
            'SELECT id FROM service_connections WHERE user_id = $1 AND service_name = $2',
            [userId, 'instagram']
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
                [userId, 'instagram', 'connected', metadata]
            );
            return result.rows[0];
        }
    } catch (err) {
        console.error('Error storing Instagram connection:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Delete Instagram connection
async function deleteInstagramConnection(connectionId, userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'DELETE FROM service_connections WHERE id = $1 AND user_id = $2 AND service_name = $3 RETURNING *',
            [connectionId, userId, 'instagram']
        );
        return result.rows.length > 0;
    } catch (err) {
        console.error('Error deleting Instagram connection:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Get Instagram connection for a user
async function getInstagramConnection(userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT * FROM service_connections WHERE user_id = $1 AND service_name = $2 AND status = $3',
            [userId, 'instagram', 'connected']
        );
        return result.rows[0] || null;
    } catch (err) {
        console.error('Error getting Instagram connection:', err);
        throw err;
    } finally {
        client.release();
    }
}

// ===== TASK SUMMARY FUNCTIONS =====

// Create a task summary for a completed module execution
async function createTaskSummary(userId, taskData) {
    const client = await pool.connect();
    try {
        const {
            title,
            description,
            status,
            serviceIds,
            execution_id,
            module_id,
            cost_usd,
            duration_ms,
            num_turns,
            completed_at,
        } = taskData;

        // Insert task with execution metadata
        const taskResult = await client.query(
            `INSERT INTO tasks (
                user_id, title, description, status,
                execution_id, module_id, cost_usd, duration_ms, num_turns,
                completed_at, created_at
            )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
             RETURNING *`,
            [
                userId,
                title,
                description || null,
                status || 'completed',
                execution_id || null,
                module_id || null,
                cost_usd || null,
                duration_ms || null,
                num_turns || null,
                completed_at || new Date(), // Use provided timestamp or current time
            ]
        );

        const task = taskResult.rows[0];

        // Link to services if provided
        if (serviceIds && serviceIds.length > 0) {
            for (const serviceId of serviceIds) {
                await client.query(
                    `INSERT INTO task_services (task_id, service_connection_id)
                     VALUES ($1, $2)
                     ON CONFLICT (task_id, service_connection_id) DO NOTHING`,
                    [task.id, serviceId]
                );
            }
        }

        return task;
    } catch (err) {
        console.error('Error creating task summary:', err);
        throw err;
    } finally {
        client.release();
    }
}

// ===== SOCIAL MEDIA PROFILE FUNCTIONS =====

// Get all profiles for a user
async function getProfilesByUserId(userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT * FROM profiles WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );
        return result.rows;
    } catch (err) {
        console.error('Error getting profiles:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Get a profile by ID
async function getProfileById(profileId, userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT * FROM profiles WHERE id = $1 AND user_id = $2',
            [profileId, userId]
        );
        return result.rows[0] || null;
    } catch (err) {
        console.error('Error getting profile by ID:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Create a new profile
async function createProfile(userId, profileData) {
    const client = await pool.connect();
    try {
        const { name, description, late_profile_id } = profileData;
        const result = await client.query(
            `INSERT INTO profiles (user_id, name, description, late_profile_id)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [userId, name, description || null, late_profile_id || null]
        );
        return result.rows[0];
    } catch (err) {
        console.error('Error creating profile:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Update a profile
async function updateProfile(profileId, userId, updates) {
    const client = await pool.connect();
    try {
        const setClauses = [];
        const values = [];
        let paramCount = 1;

        if (updates.name !== undefined) {
            setClauses.push(`name = $${paramCount++}`);
            values.push(updates.name);
        }
        if (updates.description !== undefined) {
            setClauses.push(`description = $${paramCount++}`);
            values.push(updates.description);
        }
        if (updates.late_profile_id !== undefined) {
            setClauses.push(`late_profile_id = $${paramCount++}`);
            values.push(updates.late_profile_id);
        }

        setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(profileId, userId);

        const query = `UPDATE profiles SET ${setClauses.join(', ')}
                       WHERE id = $${paramCount++} AND user_id = $${paramCount++}
                       RETURNING *`;

        const result = await client.query(query, values);
        return result.rows[0] || null;
    } catch (err) {
        console.error('Error updating profile:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Find profile by Late profile ID
async function findProfileByLateId(userId, lateProfileId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT * FROM profiles WHERE user_id = $1 AND late_profile_id = $2',
            [userId, lateProfileId]
        );
        return result.rows[0] || null;
    } catch (err) {
        console.error('Error finding profile by Late ID:', err);
        throw err;
    } finally {
        client.release();
    }
}

// ===== SOCIAL ACCOUNT FUNCTIONS =====

// Get all social accounts for a user (across all profiles)
async function getSocialAccountsByUserId(userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `SELECT sa.*, p.name as profile_name
             FROM social_accounts sa
             JOIN profiles p ON sa.profile_id = p.id
             WHERE p.user_id = $1
             ORDER BY sa.created_at DESC`,
            [userId]
        );
        return result.rows;
    } catch (err) {
        console.error('Error getting social accounts:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Get social accounts by profile ID
async function getSocialAccountsByProfileId(profileId, userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `SELECT sa.*
             FROM social_accounts sa
             JOIN profiles p ON sa.profile_id = p.id
             WHERE sa.profile_id = $1 AND p.user_id = $2
             ORDER BY sa.created_at DESC`,
            [profileId, userId]
        );
        return result.rows;
    } catch (err) {
        console.error('Error getting social accounts by profile:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Get social account by ID
async function getSocialAccountById(accountId, userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `SELECT sa.*, p.name as profile_name
             FROM social_accounts sa
             JOIN profiles p ON sa.profile_id = p.id
             WHERE sa.id = $1 AND p.user_id = $2`,
            [accountId, userId]
        );
        return result.rows[0] || null;
    } catch (err) {
        console.error('Error getting social account by ID:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Create a social account
async function createSocialAccount(profileId, accountData) {
    const client = await pool.connect();
    try {
        const { platform, account_handle, late_account_id, is_active } = accountData;
        const result = await client.query(
            `INSERT INTO social_accounts (profile_id, platform, account_handle, late_account_id, is_active)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [profileId, platform, account_handle, late_account_id || null, is_active !== undefined ? is_active : true]
        );
        return result.rows[0];
    } catch (err) {
        console.error('Error creating social account:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Update a social account
async function updateSocialAccount(accountId, updates) {
    const client = await pool.connect();
    try {
        const setClauses = [];
        const values = [];
        let paramCount = 1;

        if (updates.platform !== undefined) {
            setClauses.push(`platform = $${paramCount++}`);
            values.push(updates.platform);
        }
        if (updates.account_handle !== undefined) {
            setClauses.push(`account_handle = $${paramCount++}`);
            values.push(updates.account_handle);
        }
        if (updates.late_account_id !== undefined) {
            setClauses.push(`late_account_id = $${paramCount++}`);
            values.push(updates.late_account_id);
        }
        if (updates.is_active !== undefined) {
            setClauses.push(`is_active = $${paramCount++}`);
            values.push(updates.is_active);
        }

        setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(accountId);

        const query = `UPDATE social_accounts SET ${setClauses.join(', ')}
                       WHERE id = $${paramCount++}
                       RETURNING *`;

        const result = await client.query(query, values);
        return result.rows[0] || null;
    } catch (err) {
        console.error('Error updating social account:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Find social account by Late account ID
async function findSocialAccountByLateId(lateAccountId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT * FROM social_accounts WHERE late_account_id = $1',
            [lateAccountId]
        );
        return result.rows[0] || null;
    } catch (err) {
        console.error('Error finding social account by Late ID:', err);
        throw err;
    } finally {
        client.release();
    }
}

// ===== CONTENT FUNCTIONS =====

// Get content by user (across all accounts)
async function getContentByUserId(userId, limit = 50) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `SELECT c.*, sa.platform, sa.account_handle, p.name as profile_name
             FROM content c
             JOIN social_accounts sa ON c.account_id = sa.id
             JOIN profiles p ON sa.profile_id = p.id
             WHERE p.user_id = $1
             ORDER BY c.created_at DESC
             LIMIT $2`,
            [userId, limit]
        );
        return result.rows;
    } catch (err) {
        console.error('Error getting content by user:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Get content by account
async function getContentByAccountId(accountId, userId, limit = 50) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `SELECT c.*
             FROM content c
             JOIN social_accounts sa ON c.account_id = sa.id
             JOIN profiles p ON sa.profile_id = p.id
             WHERE c.account_id = $1 AND p.user_id = $2
             ORDER BY c.created_at DESC
             LIMIT $3`,
            [accountId, userId, limit]
        );
        return result.rows;
    } catch (err) {
        console.error('Error getting content by account:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Get content by ID
async function getContentById(contentId, userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `SELECT c.*, sa.platform, sa.account_handle, sa.late_account_id, p.name as profile_name
             FROM content c
             JOIN social_accounts sa ON c.account_id = sa.id
             JOIN profiles p ON sa.profile_id = p.id
             WHERE c.id = $1 AND p.user_id = $2`,
            [contentId, userId]
        );
        return result.rows[0] || null;
    } catch (err) {
        console.error('Error getting content by ID:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Create content
async function createContent(accountId, contentData) {
    const client = await pool.connect();
    try {
        const { content_data, status, scheduled_for } = contentData;
        const result = await client.query(
            `INSERT INTO content (account_id, content_data, status, scheduled_for)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [accountId, content_data, status || 'DRAFT', scheduled_for || null]
        );
        return result.rows[0];
    } catch (err) {
        console.error('Error creating content:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Update content
async function updateContent(contentId, updates) {
    const client = await pool.connect();
    try {
        const setClauses = [];
        const values = [];
        let paramCount = 1;

        if (updates.content_data !== undefined) {
            setClauses.push(`content_data = $${paramCount++}`);
            values.push(updates.content_data);
        }
        if (updates.status !== undefined) {
            setClauses.push(`status = $${paramCount++}`);
            values.push(updates.status);
        }
        if (updates.scheduled_for !== undefined) {
            setClauses.push(`scheduled_for = $${paramCount++}`);
            values.push(updates.scheduled_for);
        }
        if (updates.posted_at !== undefined) {
            setClauses.push(`posted_at = $${paramCount++}`);
            values.push(updates.posted_at);
        }
        if (updates.late_post_id !== undefined) {
            setClauses.push(`late_post_id = $${paramCount++}`);
            values.push(updates.late_post_id);
        }

        values.push(contentId);

        const query = `UPDATE content SET ${setClauses.join(', ')}
                       WHERE id = $${paramCount++}
                       RETURNING *`;

        const result = await client.query(query, values);
        return result.rows[0] || null;
    } catch (err) {
        console.error('Error updating content:', err);
        throw err;
    } finally {
        client.release();
    }
}

// ===== MEDIA FUNCTIONS =====

// Get media by content ID
async function getMediaByContentId(contentId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT * FROM media WHERE content_id = $1 ORDER BY created_at ASC',
            [contentId]
        );
        return result.rows;
    } catch (err) {
        console.error('Error getting media by content:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Create media
async function createMedia(contentId, mediaData) {
    const client = await pool.connect();
    try {
        const { url, type, metadata } = mediaData;
        const result = await client.query(
            `INSERT INTO media (content_id, url, type, metadata)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [contentId, url, type, metadata || null]
        );
        return result.rows[0];
    } catch (err) {
        console.error('Error creating media:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Create media with R2 data
async function createMediaWithR2Data(contentId, r2UploadResult) {
    const client = await pool.connect();
    try {
        const {
            url,
            type,
            key,
            bucket,
            size,
            mimeType,
            filename,
            thumbnailUrl
        } = r2UploadResult;

        const result = await client.query(
            `INSERT INTO media (
                content_id, url, type, r2_key, r2_bucket,
                size, mime_type, filename, thumbnail_url, metadata
            )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING *`,
            [
                contentId,
                url,
                type,
                key || null,
                bucket || null,
                size || null,
                mimeType || null,
                filename || null,
                thumbnailUrl || null,
                { uploaded_to_r2: true } // Basic metadata
            ]
        );
        return result.rows[0];
    } catch (err) {
        console.error('Error creating media with R2 data:', err);
        throw err;
    } finally {
        client.release();
    }
}

/**
 * AI Generation Functions
 * Functions for managing AI-generated content (images, videos, etc.)
 */

/**
 * Create a new AI generation record
 * @param {number} userId - User ID
 * @param {Object} generationData - Generation data
 * @returns {Promise<Object>} Created generation record
 */
async function createAIGeneration(userId, generationData) {
    const client = await pool.connect();
    try {
        const {
            module_id,
            content_id,
            generation_type,
            model,
            prompt,
            input_params,
            output_url,
            r2_url,
            r2_key,
            r2_bucket,
            status = 'pending',
            cost_usd,
            duration_ms,
            metadata,
            error_message,
            completed_at
        } = generationData;

        const result = await client.query(
            `INSERT INTO ai_generations (
                user_id, module_id, content_id, generation_type, model, prompt,
                input_params, output_url, r2_url, r2_key, r2_bucket,
                status, cost_usd, duration_ms, metadata, error_message, completed_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            RETURNING *`,
            [
                userId, module_id || null, content_id || null, generation_type, model, prompt,
                input_params || null, output_url || null, r2_url || null, r2_key || null, r2_bucket || null,
                status, cost_usd || null, duration_ms || null, metadata || null, error_message || null, completed_at || null
            ]
        );
        return result.rows[0];
    } catch (err) {
        console.error('Error creating AI generation:', err);
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Update an AI generation record
 * @param {number} generationId - Generation ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated generation record
 */
async function updateAIGeneration(generationId, updates) {
    const client = await pool.connect();
    try {
        const allowedFields = [
            'output_url', 'r2_url', 'r2_key', 'r2_bucket',
            'status', 'cost_usd', 'duration_ms', 'metadata',
            'error_message', 'completed_at'
        ];

        const setClauses = [];
        const values = [];
        let paramCount = 1;

        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key)) {
                setClauses.push(`${key} = $${paramCount}`);
                values.push(value);
                paramCount++;
            }
        }

        if (setClauses.length === 0) {
            throw new Error('No valid fields to update');
        }

        values.push(generationId);

        const result = await client.query(
            `UPDATE ai_generations
             SET ${setClauses.join(', ')}
             WHERE id = $${paramCount}
             RETURNING *`,
            values
        );

        return result.rows[0];
    } catch (err) {
        console.error('Error updating AI generation:', err);
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Get AI generation by ID
 * @param {number} generationId - Generation ID
 * @param {number} userId - User ID (for authorization)
 * @returns {Promise<Object|null>} Generation record or null
 */
async function getAIGenerationById(generationId, userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT * FROM ai_generations WHERE id = $1 AND user_id = $2',
            [generationId, userId]
        );
        return result.rows[0] || null;
    } catch (err) {
        console.error('Error getting AI generation by ID:', err);
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Get AI generations by user ID with optional filters
 * @param {number} userId - User ID
 * @param {Object} filters - Optional filters
 * @param {number} limit - Maximum number of results
 * @returns {Promise<Array>} Array of generation records
 */
async function getAIGenerationsByUserId(userId, filters = {}, limit = 50) {
    const client = await pool.connect();
    try {
        const {
            generation_type,
            status,
            module_id,
            content_id
        } = filters;

        let query = 'SELECT * FROM ai_generations WHERE user_id = $1';
        const values = [userId];
        let paramCount = 2;

        if (generation_type) {
            query += ` AND generation_type = $${paramCount}`;
            values.push(generation_type);
            paramCount++;
        }

        if (status) {
            query += ` AND status = $${paramCount}`;
            values.push(status);
            paramCount++;
        }

        if (module_id !== undefined) {
            query += ` AND module_id = $${paramCount}`;
            values.push(module_id);
            paramCount++;
        }

        if (content_id !== undefined) {
            query += ` AND content_id = $${paramCount}`;
            values.push(content_id);
            paramCount++;
        }

        query += ` ORDER BY created_at DESC LIMIT $${paramCount}`;
        values.push(limit);

        const result = await client.query(query, values);
        return result.rows;
    } catch (err) {
        console.error('Error getting AI generations by user ID:', err);
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Link a media record to an AI generation
 * @param {number} mediaId - Media ID
 * @param {number} generationId - AI generation ID
 * @returns {Promise<Object>} Updated media record
 */
async function linkMediaToGeneration(mediaId, generationId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `UPDATE media
             SET ai_generation_id = $1
             WHERE id = $2
             RETURNING *`,
            [generationId, mediaId]
        );
        return result.rows[0];
    } catch (err) {
        console.error('Error linking media to generation:', err);
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Get AI generation usage statistics for a user
 * @param {number} userId - User ID
 * @param {Object} options - Optional filters (startDate, endDate)
 * @returns {Promise<Object>} Usage statistics
 */
async function getAIGenerationStats(userId, options = {}) {
    const client = await pool.connect();
    try {
        const { startDate, endDate } = options;

        let query = `
            SELECT
                COUNT(*) as total_generations,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_generations,
                COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_generations,
                SUM(cost_usd) as total_cost,
                AVG(duration_ms) as avg_duration_ms,
                generation_type,
                COUNT(*) as count_by_type
            FROM ai_generations
            WHERE user_id = $1
        `;

        const values = [userId];
        let paramCount = 2;

        if (startDate) {
            query += ` AND created_at >= $${paramCount}`;
            values.push(startDate);
            paramCount++;
        }

        if (endDate) {
            query += ` AND created_at <= $${paramCount}`;
            values.push(endDate);
            paramCount++;
        }

        query += ' GROUP BY generation_type';

        const result = await client.query(query, values);

        // Also get overall stats
        let overallQuery = `
            SELECT
                COUNT(*) as total_generations,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_generations,
                COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_generations,
                SUM(cost_usd) as total_cost,
                AVG(duration_ms) as avg_duration_ms
            FROM ai_generations
            WHERE user_id = $1
        `;

        const overallValues = [userId];
        let overallParamCount = 2;

        if (startDate) {
            overallQuery += ` AND created_at >= $${overallParamCount}`;
            overallValues.push(startDate);
            overallParamCount++;
        }

        if (endDate) {
            overallQuery += ` AND created_at <= $${overallParamCount}`;
            overallValues.push(endDate);
            overallParamCount++;
        }

        const overallResult = await client.query(overallQuery, overallValues);

        return {
            overall: overallResult.rows[0],
            by_type: result.rows
        };
    } catch (err) {
        console.error('Error getting AI generation stats:', err);
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
    // Gmail connection functions
    storeGmailConnection,
    getGmailToken,
    deleteGmailConnection,
    updateGmailTokens,
    // Instagram connection functions
    storeInstagramConnection,
    deleteInstagramConnection,
    getInstagramConnection,
    // Module functions
    getModulesByUserId,
    getModuleById,
    createModule,
    updateModule,
    deleteModule,
    getModuleExecutions,
    createModuleExecution,
    updateModuleExecution,
    getActiveModulesForScheduling,
    // Execution log functions
    saveExecutionLog,
    getExecutionLogs,
    getExecutionLogsSince,
    // Task summary functions
    createTaskSummary,
    // Profile functions
    getProfilesByUserId,
    getProfileById,
    createProfile,
    updateProfile,
    findProfileByLateId,
    // Social account functions
    getSocialAccountsByUserId,
    getSocialAccountsByProfileId,
    getSocialAccountById,
    createSocialAccount,
    updateSocialAccount,
    findSocialAccountByLateId,
    // Content functions
    getContentByUserId,
    getContentByAccountId,
    getContentById,
    createContent,
    updateContent,
    // Media functions
    getMediaByContentId,
    createMedia,
    createMediaWithR2Data,
    // AI Generation functions
    createAIGeneration,
    updateAIGeneration,
    getAIGenerationById,
    getAIGenerationsByUserId,
    linkMediaToGeneration,
    getAIGenerationStats,
};
