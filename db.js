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

// Store Slack connection with encrypted token
async function storeSlackConnection(userId, slackData, encryptedBotToken, encryptedUserToken = null) {
    const client = await pool.connect();
    try {
        // Combine Slack workspace data with encrypted tokens in metadata
        const metadata = {
            ...slackData,
            // Bot token (always present)
            encrypted_token: encryptedBotToken.encrypted,
            token_iv: encryptedBotToken.iv,
            token_auth_tag: encryptedBotToken.authTag,
            // User token (optional but recommended)
            encrypted_user_token: encryptedUserToken?.encrypted || null,
            user_token_iv: encryptedUserToken?.iv || null,
            user_token_auth_tag: encryptedUserToken?.authTag || null
        };

        // Check if user already has a Slack connection for this workspace
        const existingResult = await client.query(
            'SELECT id FROM service_connections WHERE user_id = $1 AND service_name = $2 AND metadata->>\'workspace_id\' = $3',
            [userId, 'slack', slackData.workspace_id]
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
                [userId, 'slack', 'connected', metadata]
            );
            return result.rows[0];
        }
    } catch (err) {
        console.error('Error storing Slack connection:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Get Slack tokens for a user (returns both bot and user tokens, if available)
// For backward compatibility, can still be called as getSlackToken() which returns bot token only
async function getSlackToken(userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT metadata FROM service_connections WHERE user_id = $1 AND service_name = $2 AND status = $3 ORDER BY created_at DESC LIMIT 1',
            [userId, 'slack', 'connected']
        );

        if (result.rows.length === 0) {
            return null;
        }

        const metadata = result.rows[0].metadata;

        // Check if bot token data exists
        if (!metadata || !metadata.encrypted_token || !metadata.token_iv || !metadata.token_auth_tag) {
            console.error('Slack connection exists but encrypted token data is missing');
            return null;
        }

        // Return encrypted bot token data (decryption will be done by the caller)
        // For backward compatibility, return bot token in the same format as before
        return {
            encrypted: metadata.encrypted_token,
            iv: metadata.token_iv,
            authTag: metadata.token_auth_tag
        };
    } catch (err) {
        console.error('Error getting Slack token:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Get both bot and user tokens for Slack
async function getSlackTokens(userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT metadata FROM service_connections WHERE user_id = $1 AND service_name = $2 AND status = $3 ORDER BY created_at DESC LIMIT 1',
            [userId, 'slack', 'connected']
        );

        if (result.rows.length === 0) {
            return null;
        }

        const metadata = result.rows[0].metadata;

        // Check if bot token data exists
        if (!metadata || !metadata.encrypted_token || !metadata.token_iv || !metadata.token_auth_tag) {
            console.error('Slack connection exists but encrypted token data is missing');
            return null;
        }

        const tokens = {
            bot: {
                encrypted: metadata.encrypted_token,
                iv: metadata.token_iv,
                authTag: metadata.token_auth_tag
            },
            user: null,
            metadata: metadata  // Include full metadata for context
        };

        // Check if user token exists
        if (metadata.encrypted_user_token && metadata.user_token_iv && metadata.user_token_auth_tag) {
            tokens.user = {
                encrypted: metadata.encrypted_user_token,
                iv: metadata.user_token_iv,
                authTag: metadata.user_token_auth_tag
            };
        }

        return tokens;
    } catch (err) {
        console.error('Error getting Slack tokens:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Delete Slack connection
async function deleteSlackConnection(connectionId, userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'DELETE FROM service_connections WHERE id = $1 AND user_id = $2 AND service_name = $3 RETURNING *',
            [connectionId, userId, 'slack']
        );
        return result.rows.length > 0;
    } catch (err) {
        console.error('Error deleting Slack connection:', err);
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

// Update module session ID (for session resumption)
async function updateModuleSessionId(moduleId, sessionId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'UPDATE modules SET session_id = $1 WHERE id = $2 RETURNING *',
            [sessionId, moduleId]
        );
        return result.rows[0] || null;
    } catch (err) {
        console.error('Error updating module session ID:', err);
        throw err;
    } finally {
        client.release();
    }
}

// ============================================
// AGENT FUNCTIONS (Task-Driven AI Agents)
// ============================================

// Get all agents for a user
async function getAgentsByUserId(userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT * FROM agents WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );
        return result.rows;
    } catch (err) {
        console.error('Error getting agents:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Get a specific agent by ID
async function getAgentById(agentId, userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT * FROM agents WHERE id = $1 AND user_id = $2',
            [agentId, userId]
        );
        return result.rows[0] || null;
    } catch (err) {
        console.error('Error getting agent by ID:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Create a new agent
async function createAgent(userId, agentData) {
    const client = await pool.connect();
    try {
        const { name, description, role, agent_type, status, config, metadata } = agentData;
        const result = await client.query(
            `INSERT INTO agents (user_id, name, description, role, agent_type, status, config, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [
                userId,
                name,
                description || null,
                role,
                agent_type,
                status || 'active',
                config || null,
                metadata || null
            ]
        );
        return result.rows[0];
    } catch (err) {
        console.error('Error creating agent:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Update an agent
async function updateAgent(agentId, userId, updates) {
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
        if (updates.role !== undefined) {
            setClauses.push(`role = $${paramCount++}`);
            values.push(updates.role);
        }
        if (updates.agent_type !== undefined) {
            setClauses.push(`agent_type = $${paramCount++}`);
            values.push(updates.agent_type);
        }
        if (updates.status !== undefined) {
            setClauses.push(`status = $${paramCount++}`);
            values.push(updates.status);
        }
        if (updates.config !== undefined) {
            setClauses.push(`config = $${paramCount++}`);
            values.push(updates.config);
        }
        if (updates.metadata !== undefined) {
            setClauses.push(`metadata = $${paramCount++}`);
            values.push(updates.metadata);
        }

        // Always update updated_at
        setClauses.push(`updated_at = CURRENT_TIMESTAMP`);

        // Add WHERE clause params
        values.push(agentId, userId);

        const query = `UPDATE agents SET ${setClauses.join(', ')}
                       WHERE id = $${paramCount++} AND user_id = $${paramCount++}
                       RETURNING *`;

        const result = await client.query(query, values);
        return result.rows[0] || null;
    } catch (err) {
        console.error('Error updating agent:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Delete an agent
async function deleteAgent(agentId, userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'DELETE FROM agents WHERE id = $1 AND user_id = $2 RETURNING *',
            [agentId, userId]
        );
        return result.rows.length > 0;
    } catch (err) {
        console.error('Error deleting agent:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Get tasks assigned to an agent
async function getTasksByAgentId(userId, agentId, status = null) {
    const client = await pool.connect();
    try {
        let query = `SELECT * FROM tasks
                     WHERE user_id = $1 AND assigned_to_agent_id = $2`;
        const params = [userId, agentId];

        if (status) {
            query += ' AND status = $3';
            params.push(status);
        }

        query += ' ORDER BY created_at DESC';

        const result = await client.query(query, params);
        return result.rows;
    } catch (err) {
        console.error('Error getting tasks by agent ID:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Get execution history for an agent (via tasks linked to module_executions)
async function getAgentExecutions(agentId, userId, limit = 50) {
    const client = await pool.connect();
    try {
        // Get executions linked to tasks assigned to this agent
        const result = await client.query(
            `SELECT me.* FROM module_executions me
             INNER JOIN tasks t ON t.execution_id = me.id
             WHERE t.assigned_to_agent_id = $1 AND me.user_id = $2
             ORDER BY me.created_at DESC
             LIMIT $3`,
            [agentId, userId, limit]
        );
        return result.rows;
    } catch (err) {
        console.error('Error getting agent executions:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Update agent session (for session persistence)
async function updateAgentSession(agentId, sessionId, workspacePath) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `UPDATE agents
             SET session_id = $1, workspace_path = $2, last_active_at = CURRENT_TIMESTAMP
             WHERE id = $3
             RETURNING *`,
            [sessionId, workspacePath, agentId]
        );
        return result.rows[0] || null;
    } catch (err) {
        console.error('Error updating agent session:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Increment agent routine run counter
async function incrementAgentRoutineRuns(agentId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `UPDATE agents
             SET total_routine_runs = total_routine_runs + 1, last_active_at = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING *`,
            [agentId]
        );
        return result.rows[0] || null;
    } catch (err) {
        console.error('Error incrementing agent routine runs:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Increment agent task completion counter
async function incrementAgentTaskCompletions(agentId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `UPDATE agents
             SET total_task_completions = total_task_completions + 1, last_active_at = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING *`,
            [agentId]
        );
        return result.rows[0] || null;
    } catch (err) {
        console.error('Error incrementing agent task completions:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Get agent with routines
async function getAgentWithRoutines(agentId, userId) {
    const client = await pool.connect();
    try {
        const agentResult = await client.query(
            'SELECT * FROM agents WHERE id = $1 AND user_id = $2',
            [agentId, userId]
        );

        if (agentResult.rows.length === 0) {
            return null;
        }

        const routinesResult = await client.query(
            'SELECT * FROM routines WHERE agent_id = $1 AND user_id = $2 ORDER BY created_at DESC',
            [agentId, userId]
        );

        return {
            ...agentResult.rows[0],
            routines: routinesResult.rows
        };
    } catch (err) {
        console.error('Error getting agent with routines:', err);
        throw err;
    } finally {
        client.release();
    }
}

// ============================================
// ROUTINE FUNCTIONS (Scheduled Agent Tasks)
// ============================================

// Get all routines for a user
async function getRoutinesByUserId(userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `SELECT r.*, a.name as agent_name, a.status as agent_status,
                    MAX(me.created_at) as last_run_at
             FROM routines r
             INNER JOIN agents a ON a.id = r.agent_id
             LEFT JOIN module_executions me ON me.routine_id = r.id AND me.is_routine_execution = true
             WHERE r.user_id = $1
             GROUP BY r.id, a.name, a.status
             ORDER BY MAX(me.created_at) DESC NULLS LAST, r.created_at DESC`,
            [userId]
        );
        return result.rows;
    } catch (err) {
        console.error('Error getting routines:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Get routines by agent ID
async function getRoutinesByAgentId(agentId, userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT * FROM routines WHERE agent_id = $1 AND user_id = $2 ORDER BY created_at DESC',
            [agentId, userId]
        );
        return result.rows;
    } catch (err) {
        console.error('Error getting routines by agent:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Get a specific routine by ID
async function getRoutineById(routineId, userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `SELECT r.*, a.name as agent_name, a.status as agent_status
             FROM routines r
             INNER JOIN agents a ON a.id = r.agent_id
             WHERE r.id = $1 AND r.user_id = $2`,
            [routineId, userId]
        );
        return result.rows[0] || null;
    } catch (err) {
        console.error('Error getting routine by ID:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Create a new routine
async function createRoutine(userId, routineData) {
    const client = await pool.connect();
    try {
        const { agent_id, name, description, type, status, frequency, config } = routineData;
        const result = await client.query(
            `INSERT INTO routines (user_id, agent_id, name, description, type, status, frequency, config)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [
                userId,
                agent_id,
                name,
                description || null,
                type,
                status || 'active',
                frequency || 'manual',
                config || null
            ]
        );
        return result.rows[0];
    } catch (err) {
        console.error('Error creating routine:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Update a routine
async function updateRoutine(routineId, userId, updates) {
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
        if (updates.last_run_at !== undefined) {
            setClauses.push(`last_run_at = $${paramCount++}`);
            values.push(updates.last_run_at);
        }
        if (updates.next_run_at !== undefined) {
            setClauses.push(`next_run_at = $${paramCount++}`);
            values.push(updates.next_run_at);
        }

        // Always update updated_at
        setClauses.push(`updated_at = CURRENT_TIMESTAMP`);

        // Add WHERE clause params
        values.push(routineId, userId);

        const query = `UPDATE routines SET ${setClauses.join(', ')}
                       WHERE id = $${paramCount++} AND user_id = $${paramCount++}
                       RETURNING *`;

        const result = await client.query(query, values);
        return result.rows[0] || null;
    } catch (err) {
        console.error('Error updating routine:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Delete a routine
async function deleteRoutine(routineId, userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'DELETE FROM routines WHERE id = $1 AND user_id = $2 RETURNING *',
            [routineId, userId]
        );
        return result.rows.length > 0;
    } catch (err) {
        console.error('Error deleting routine:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Get routines due for execution
async function getRoutinesDueForExecution(currentTime = new Date()) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `SELECT r.*, a.session_id as agent_session_id, a.workspace_path as agent_workspace_path
             FROM routines r
             INNER JOIN agents a ON a.id = r.agent_id
             WHERE r.status = 'active'
             AND a.status = 'active'
             AND (r.next_run_at IS NULL OR r.next_run_at <= $1)
             ORDER BY r.next_run_at ASC NULLS FIRST`,
            [currentTime]
        );
        return result.rows;
    } catch (err) {
        console.error('Error getting routines due for execution:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Get execution history for a routine
async function getRoutineExecutions(routineId, userId, limit = 50) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `SELECT * FROM module_executions
             WHERE routine_id = $1 AND user_id = $2 AND is_routine_execution = true
             ORDER BY created_at DESC
             LIMIT $3`,
            [routineId, userId, limit]
        );
        return result.rows;
    } catch (err) {
        console.error('Error getting routine executions:', err);
        throw err;
    } finally {
        client.release();
    }
}

// ============================================
// MODULE EXECUTION FUNCTIONS
// ============================================

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

// ===== TASK WORKFLOW FUNCTIONS (Agent-Driven) =====

/**
 * Create a new task proposal (suggestion)
 * Used by agents/modules to propose work for CEO Brain approval
 */
async function createTaskProposal(userId, taskData) {
    const client = await pool.connect();
    try {
        const {
            title,
            description,
            suggestion_reasoning,
            proposed_by_module_id,
            assigned_to_module_id,
            brain_decision_id,
            priority
        } = taskData;

        const result = await client.query(
            `INSERT INTO tasks (
                user_id, title, description, status,
                suggestion_reasoning, proposed_by_module_id, assigned_to_module_id,
                brain_decision_id, last_status_change_at, last_status_change_by
            )
             VALUES ($1, $2, $3, 'suggested', $4, $5, $6, $7, CURRENT_TIMESTAMP, $8)
             RETURNING *`,
            [
                userId,
                title,
                description || null,
                suggestion_reasoning || null,
                proposed_by_module_id || null,
                assigned_to_module_id || null,
                brain_decision_id || null,
                `module_${proposed_by_module_id || 'unknown'}`
            ]
        );

        return result.rows[0];
    } catch (err) {
        console.error('Error creating task proposal:', err);
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Update task status with reasoning and audit trail
 * Used by agents to transition tasks through workflow states
 */
async function updateTaskStatus(taskId, newStatus, updates = {}) {
    const client = await pool.connect();
    try {
        const {
            changed_by,
            approval_reasoning,
            rejection_reasoning,
            completion_summary,
            blocked_reason,
            approved_by,
            assigned_to_module_id,
            assigned_to_agent_id,
            execution_id
        } = updates;

        // Build dynamic update query based on status transition
        const setClauses = ['status = $1', 'last_status_change_at = CURRENT_TIMESTAMP'];
        const values = [newStatus];
        let paramCount = 2;

        // Set changed_by audit field
        if (changed_by) {
            setClauses.push(`last_status_change_by = $${paramCount++}`);
            values.push(changed_by);
        }

        // Status-specific fields
        if (newStatus === 'approved') {
            setClauses.push(`approved_at = CURRENT_TIMESTAMP`);
            if (approved_by) {
                setClauses.push(`approved_by = $${paramCount++}`);
                values.push(approved_by);
            }
            if (approval_reasoning) {
                setClauses.push(`approval_reasoning = $${paramCount++}`);
                values.push(approval_reasoning);
            }
            if (assigned_to_module_id) {
                setClauses.push(`assigned_to_module_id = $${paramCount++}`);
                values.push(assigned_to_module_id);
            }
            if (assigned_to_agent_id) {
                setClauses.push(`assigned_to_agent_id = $${paramCount++}`);
                values.push(assigned_to_agent_id);
            }
        } else if (newStatus === 'rejected') {
            if (rejection_reasoning) {
                setClauses.push(`rejection_reasoning = $${paramCount++}`);
                values.push(rejection_reasoning);
            }
        } else if (newStatus === 'in_progress') {
            setClauses.push(`started_at = CURRENT_TIMESTAMP`);
            if (execution_id) {
                setClauses.push(`execution_id = $${paramCount++}`);
                values.push(execution_id);
            }
        } else if (newStatus === 'waiting' || newStatus === 'blocked') {
            setClauses.push(`blocked_at = CURRENT_TIMESTAMP`);
            if (blocked_reason) {
                setClauses.push(`blocked_reason = $${paramCount++}`);
                values.push(blocked_reason);
            }
        } else if (newStatus === 'completed') {
            setClauses.push(`completed_at = CURRENT_TIMESTAMP`);
            if (completion_summary) {
                setClauses.push(`completion_summary = $${paramCount++}`);
                values.push(completion_summary);
            }
        }

        // Add task ID for WHERE clause
        values.push(taskId);

        const query = `UPDATE tasks SET ${setClauses.join(', ')}
                       WHERE id = $${paramCount++}
                       RETURNING *`;

        const result = await client.query(query, values);
        return result.rows[0] || null;
    } catch (err) {
        console.error('Error updating task status:', err);
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Get tasks filtered by status
 * Used by agents to find work and by UI to display task lists
 */
async function getTasksByStatus(userId, status, options = {}) {
    const client = await pool.connect();
    try {
        const { limit = 50, offset = 0, assigned_to_module_id } = options;

        let query = 'SELECT * FROM tasks WHERE user_id = $1';
        const values = [userId];
        let paramCount = 2;

        if (status) {
            query += ` AND status = $${paramCount++}`;
            values.push(status);
        }

        if (assigned_to_module_id !== undefined) {
            query += ` AND assigned_to_module_id = $${paramCount++}`;
            values.push(assigned_to_module_id);
        }

        query += ` ORDER BY created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount++}`;
        values.push(limit, offset);

        const result = await client.query(query, values);
        return result.rows;
    } catch (err) {
        console.error('Error getting tasks by status:', err);
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Get single task by ID with full details
 * Used by agents to read task context before starting work
 */
async function getTaskById(taskId, userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `SELECT t.*,
                    pm.name as proposed_by_module_name,
                    am.name as assigned_to_module_name,
                    bd.action_description as brain_decision_action
             FROM tasks t
             LEFT JOIN modules pm ON t.proposed_by_module_id = pm.id
             LEFT JOIN modules am ON t.assigned_to_module_id = am.id
             LEFT JOIN brain_decisions bd ON t.brain_decision_id = bd.id
             WHERE t.id = $1 AND t.user_id = $2`,
            [taskId, userId]
        );
        return result.rows[0] || null;
    } catch (err) {
        console.error('Error getting task by ID:', err);
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Get tasks assigned to a specific module
 * Used by agents to find tasks assigned to them
 */
async function getTasksByModuleId(userId, moduleId, statusFilter = null) {
    const client = await pool.connect();
    try {
        let query = `SELECT * FROM tasks
                     WHERE user_id = $1 AND assigned_to_module_id = $2`;
        const values = [userId, moduleId];
        let paramCount = 3;

        if (statusFilter) {
            query += ` AND status = $${paramCount++}`;
            values.push(statusFilter);
        }

        query += ' ORDER BY created_at DESC';

        const result = await client.query(query, values);
        return result.rows;
    } catch (err) {
        console.error('Error getting tasks by module ID:', err);
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

// ===== META ADS CONNECTION FUNCTIONS =====

// Store Meta Ads connection with encrypted token
async function storeMetaAdsConnection(userId, metaData, encryptedToken) {
    const client = await pool.connect();
    try {
        // Combine Meta user data with encrypted token in metadata
        const metadata = {
            ...metaData,
            encrypted_token: encryptedToken.encrypted,
            token_iv: encryptedToken.iv,
            token_auth_tag: encryptedToken.authTag
        };

        // Check if user already has a Meta Ads connection
        const existingResult = await client.query(
            'SELECT id FROM service_connections WHERE user_id = $1 AND service_name = $2',
            [userId, 'meta-ads']
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
                [userId, 'meta-ads', 'connected', metadata]
            );
            return result.rows[0];
        }
    } catch (err) {
        console.error('Error storing Meta Ads connection:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Get decrypted Meta Ads token for a user
async function getMetaAdsToken(userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT metadata FROM service_connections WHERE user_id = $1 AND service_name = $2 AND status = $3',
            [userId, 'meta-ads', 'connected']
        );

        if (result.rows.length === 0) {
            return null;
        }

        const metadata = result.rows[0].metadata;

        // Check if encrypted token data exists
        if (!metadata || !metadata.encrypted_token || !metadata.token_iv || !metadata.token_auth_tag) {
            console.error('Meta Ads connection exists but encrypted token data is missing');
            return null;
        }

        // Return encrypted token data (decryption will be done by the caller)
        return {
            encrypted: metadata.encrypted_token,
            iv: metadata.token_iv,
            authTag: metadata.token_auth_tag
        };
    } catch (err) {
        console.error('Error getting Meta Ads token:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Delete Meta Ads connection
async function deleteMetaAdsConnection(connectionId, userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'DELETE FROM service_connections WHERE id = $1 AND user_id = $2 AND service_name = $3 RETURNING *',
            [connectionId, userId, 'meta-ads']
        );
        return result.rows.length > 0;
    } catch (err) {
        console.error('Error deleting Meta Ads connection:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Update Meta Ads tokens (for refresh)
async function updateMetaAdsTokens(userId, encryptedToken, tokenExpiry) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT id, metadata FROM service_connections WHERE user_id = $1 AND service_name = $2',
            [userId, 'meta-ads']
        );

        if (result.rows.length === 0) {
            throw new Error('Meta Ads connection not found');
        }

        const connectionId = result.rows[0].id;
        const metadata = result.rows[0].metadata || {};

        // Update token in metadata
        metadata.encrypted_token = encryptedToken.encrypted;
        metadata.token_iv = encryptedToken.iv;
        metadata.token_auth_tag = encryptedToken.authTag;
        metadata.token_expiry = tokenExpiry;

        await client.query(
            'UPDATE service_connections SET metadata = $1 WHERE id = $2',
            [metadata, connectionId]
        );

        return true;
    } catch (err) {
        console.error('Error updating Meta Ads tokens:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Get Meta Ads connection for a user
async function getMetaAdsConnection(userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT * FROM service_connections WHERE user_id = $1 AND service_name = $2 AND status = $3',
            [userId, 'meta-ads', 'connected']
        );
        return result.rows[0] || null;
    } catch (err) {
        console.error('Error getting Meta Ads connection:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Sentry connection functions
async function storeSentryConnection(userId, sentryData, encryptedToken) {
    const client = await pool.connect();
    try {
        // Combine Sentry user data with encrypted token in metadata
        const metadata = {
            ...sentryData,
            encrypted_token: encryptedToken.encrypted,
            token_iv: encryptedToken.iv,
            token_auth_tag: encryptedToken.authTag
        };

        // Check if user already has a Sentry connection
        const existingResult = await client.query(
            'SELECT id FROM service_connections WHERE user_id = $1 AND service_name = $2',
            [userId, 'sentry']
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
                [userId, 'sentry', 'connected', metadata]
            );
            return result.rows[0];
        }
    } catch (err) {
        console.error('Error storing Sentry connection:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Get decrypted Sentry token for a user
async function getSentryToken(userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT metadata FROM service_connections WHERE user_id = $1 AND service_name = $2 AND status = $3',
            [userId, 'sentry', 'connected']
        );

        if (result.rows.length === 0) {
            return null;
        }

        const metadata = result.rows[0].metadata;

        // Check if encrypted token data exists
        if (!metadata || !metadata.encrypted_token || !metadata.token_iv || !metadata.token_auth_tag) {
            console.error('Sentry connection exists but encrypted token data is missing');
            return null;
        }

        // Return encrypted token data (decryption will be done by the caller)
        return {
            encrypted: metadata.encrypted_token,
            iv: metadata.token_iv,
            authTag: metadata.token_auth_tag
        };
    } catch (err) {
        console.error('Error getting Sentry token:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Delete Sentry connection
async function deleteSentryConnection(connectionId, userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'DELETE FROM service_connections WHERE id = $1 AND user_id = $2 AND service_name = $3 RETURNING *',
            [connectionId, userId, 'sentry']
        );
        return result.rows.length > 0;
    } catch (err) {
        console.error('Error deleting Sentry connection:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Update Sentry tokens (for refresh after 8-hour expiry)
async function updateSentryTokens(userId, encryptedToken, tokenExpiry, encryptedRefreshToken) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT id, metadata FROM service_connections WHERE user_id = $1 AND service_name = $2',
            [userId, 'sentry']
        );

        if (result.rows.length === 0) {
            throw new Error('Sentry connection not found');
        }

        const connectionId = result.rows[0].id;
        const metadata = result.rows[0].metadata || {};

        // Update access token in metadata
        metadata.encrypted_token = encryptedToken.encrypted;
        metadata.token_iv = encryptedToken.iv;
        metadata.token_auth_tag = encryptedToken.authTag;
        metadata.token_expiry = tokenExpiry;

        // Update refresh token if provided
        if (encryptedRefreshToken) {
            metadata.encrypted_refresh_token = encryptedRefreshToken.encrypted;
            metadata.refresh_token_iv = encryptedRefreshToken.iv;
            metadata.refresh_token_auth_tag = encryptedRefreshToken.authTag;
        }

        await client.query(
            'UPDATE service_connections SET metadata = $1 WHERE id = $2',
            [metadata, connectionId]
        );

        return true;
    } catch (err) {
        console.error('Error updating Sentry tokens:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Get Sentry connection for a user
async function getSentryConnection(userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT * FROM service_connections WHERE user_id = $1 AND service_name = $2 AND status = $3',
            [userId, 'sentry', 'connected']
        );
        return result.rows[0] || null;
    } catch (err) {
        console.error('Error getting Sentry connection:', err);
        throw err;
    } finally {
        client.release();
    }
}

// App Store Connect connection functions
async function storeAppStoreConnectConnection(userId, connectionData, encryptedPrivateKey) {
    const client = await pool.connect();
    try {
        // Combine connection data with encrypted private key in metadata
        const metadata = {
            key_id: connectionData.keyId,
            issuer_id: connectionData.issuerId,
            encrypted_private_key: encryptedPrivateKey.encrypted,
            private_key_iv: encryptedPrivateKey.iv,
            private_key_auth_tag: encryptedPrivateKey.authTag,
            connected_at: new Date().toISOString()
        };

        // Check if user already has an App Store Connect connection
        const existingResult = await client.query(
            'SELECT id FROM service_connections WHERE user_id = $1 AND service_name = $2',
            [userId, 'appstore_connect']
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
                [userId, 'appstore_connect', 'connected', metadata]
            );
            return result.rows[0];
        }
    } catch (err) {
        console.error('Error storing App Store Connect connection:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Get App Store Connect connection for a user
async function getAppStoreConnectConnection(userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT * FROM service_connections WHERE user_id = $1 AND service_name = $2 AND status = $3',
            [userId, 'appstore_connect', 'connected']
        );

        if (result.rows.length === 0) {
            return null;
        }

        const connection = result.rows[0];
        const metadata = connection.metadata;

        // Return connection with metadata fields
        return {
            id: connection.id,
            key_id: metadata.key_id,
            issuer_id: metadata.issuer_id,
            encrypted_private_key: metadata.encrypted_private_key,
            private_key_iv: metadata.private_key_iv,
            private_key_auth_tag: metadata.private_key_auth_tag,
            connected_at: metadata.connected_at,
            primary_app: metadata.primary_app, // Include primary app if set
            created_at: connection.created_at
        };
    } catch (err) {
        console.error('Error getting App Store Connect connection:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Get encrypted private key for App Store Connect
async function getAppStoreConnectPrivateKey(userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT metadata FROM service_connections WHERE user_id = $1 AND service_name = $2 AND status = $3',
            [userId, 'appstore_connect', 'connected']
        );

        if (result.rows.length === 0) {
            return null;
        }

        const metadata = result.rows[0].metadata;

        // Check if encrypted private key data exists
        if (!metadata || !metadata.encrypted_private_key || !metadata.private_key_iv || !metadata.private_key_auth_tag) {
            console.error('App Store Connect connection exists but encrypted private key data is missing');
            return null;
        }

        // Return encrypted private key data (decryption will be done by the caller)
        return {
            encrypted: metadata.encrypted_private_key,
            iv: metadata.private_key_iv,
            authTag: metadata.private_key_auth_tag
        };
    } catch (err) {
        console.error('Error getting App Store Connect private key:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Delete App Store Connect connection
async function deleteAppStoreConnectConnection(connectionId, userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'DELETE FROM service_connections WHERE id = $1 AND user_id = $2 AND service_name = $3 RETURNING *',
            [connectionId, userId, 'appstore_connect']
        );
        return result.rows.length > 0;
    } catch (err) {
        console.error('Error deleting App Store Connect connection:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Update App Store Connect connection
async function updateAppStoreConnectConnection(userId, connectionData, encryptedPrivateKey) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT id, metadata FROM service_connections WHERE user_id = $1 AND service_name = $2',
            [userId, 'appstore_connect']
        );

        if (result.rows.length === 0) {
            throw new Error('App Store Connect connection not found');
        }

        const connectionId = result.rows[0].id;
        const metadata = {
            key_id: connectionData.keyId,
            issuer_id: connectionData.issuerId,
            encrypted_private_key: encryptedPrivateKey.encrypted,
            private_key_iv: encryptedPrivateKey.iv,
            private_key_auth_tag: encryptedPrivateKey.authTag,
            connected_at: result.rows[0].metadata.connected_at, // Preserve original connection time
            updated_at: new Date().toISOString()
        };

        await client.query(
            'UPDATE service_connections SET metadata = $1, status = $2 WHERE id = $3',
            [metadata, 'connected', connectionId]
        );

        return true;
    } catch (err) {
        console.error('Error updating App Store Connect connection:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Store analytics request ID in App Store Connect metadata
async function storeAppStoreAnalyticsRequest(userId, requestId, appId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT id, metadata FROM service_connections WHERE user_id = $1 AND service_name = $2',
            [userId, 'appstore_connect']
        );

        if (result.rows.length === 0) {
            throw new Error('App Store Connect connection not found');
        }

        const connectionId = result.rows[0].id;
        const existingMetadata = result.rows[0].metadata || {};

        // Add analytics request data to metadata
        const updatedMetadata = {
            ...existingMetadata,
            analytics_request_id: requestId,
            analytics_app_id: appId,
            analytics_enabled_at: new Date().toISOString()
        };

        await client.query(
            'UPDATE service_connections SET metadata = $1 WHERE id = $2',
            [updatedMetadata, connectionId]
        );

        return true;
    } catch (err) {
        console.error('Error storing analytics request ID:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Get stored analytics request ID for App Store Connect
async function getAppStoreAnalyticsRequest(userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT metadata FROM service_connections WHERE user_id = $1 AND service_name = $2 AND status = $3',
            [userId, 'appstore_connect', 'connected']
        );

        if (result.rows.length === 0) {
            return null;
        }

        const metadata = result.rows[0].metadata;

        if (!metadata.analytics_request_id) {
            return null;
        }

        return {
            requestId: metadata.analytics_request_id,
            appId: metadata.analytics_app_id,
            enabledAt: metadata.analytics_enabled_at
        };
    } catch (err) {
        console.error('Error getting analytics request ID:', err);
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

// Get service connection by service name
async function getServiceConnectionByName(userId, serviceName) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT * FROM service_connections WHERE user_id = $1 AND service_name = $2',
            [userId, serviceName]
        );
        return result.rows[0] || null;
    } catch (err) {
        console.error('Error getting service connection by name:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Update service connection metadata
async function updateServiceConnectionMetadata(userId, serviceName, metadata) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'UPDATE service_connections SET metadata = $1 WHERE user_id = $2 AND service_name = $3 RETURNING *',
            [JSON.stringify(metadata), userId, serviceName]
        );
        return result.rows[0] || null;
    } catch (err) {
        console.error('Error updating service connection metadata:', err);
        throw err;
    } finally {
        client.release();
    }
}

// ===== RENDER CONNECTION FUNCTIONS =====

// Store Render connection with encrypted API key
async function storeRenderConnection(userId, renderData, encryptedApiKey) {
    const client = await pool.connect();
    try {
        // Combine Render data with encrypted API key in metadata
        const metadata = {
            ...renderData,
            encrypted_token: encryptedApiKey.encrypted,
            token_iv: encryptedApiKey.iv,
            token_auth_tag: encryptedApiKey.authTag
        };

        // Check if user already has a Render connection
        const existingResult = await client.query(
            'SELECT id FROM service_connections WHERE user_id = $1 AND service_name = $2',
            [userId, 'render']
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
                [userId, 'render', 'connected', metadata]
            );
            return result.rows[0];
        }
    } catch (err) {
        console.error('Error storing Render connection:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Get decrypted Render API key for a user
async function getRenderApiKey(userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT metadata FROM service_connections WHERE user_id = $1 AND service_name = $2 AND status = $3',
            [userId, 'render', 'connected']
        );

        if (result.rows.length === 0) {
            return null;
        }

        const metadata = result.rows[0].metadata;

        // Check if encrypted token data exists
        if (!metadata || !metadata.encrypted_token || !metadata.token_iv || !metadata.token_auth_tag) {
            console.error('Render connection exists but encrypted token data is missing');
            return null;
        }

        // Return encrypted token data (decryption will be done by the caller)
        return {
            encrypted: metadata.encrypted_token,
            iv: metadata.token_iv,
            authTag: metadata.token_auth_tag
        };
    } catch (err) {
        console.error('Error getting Render API key:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Delete Render connection
async function deleteRenderConnection(connectionId, userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'DELETE FROM service_connections WHERE id = $1 AND user_id = $2 AND service_name = $3 RETURNING *',
            [connectionId, userId, 'render']
        );
        return result.rows.length > 0;
    } catch (err) {
        console.error('Error deleting Render connection:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Get Render connection for a user
async function getRenderConnection(userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT * FROM service_connections WHERE user_id = $1 AND service_name = $2 AND status = $3',
            [userId, 'render', 'connected']
        );
        return result.rows[0] || null;
    } catch (err) {
        console.error('Error getting Render connection:', err);
        throw err;
    } finally {
        client.release();
    }
}

// ===== REPORTS FUNCTIONS =====

// Create a new report
async function createReport(userId, reportData) {
    const client = await pool.connect();
    try {
        const {
            execution_id,
            module_id,
            name,
            report_type,
            report_date,
            content,
            metadata
        } = reportData;

        const result = await client.query(
            `INSERT INTO reports (
                user_id, execution_id, module_id, name, report_type,
                report_date, content, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *`,
            [
                userId,
                execution_id || null,
                module_id || null,
                name,
                report_type,
                report_date,
                content,
                metadata || null
            ]
        );
        return result.rows[0];
    } catch (err) {
        console.error('Error creating report:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Get reports by user ID with optional filters
async function getReportsByUserId(userId, filters = {}, limit = 50, offset = 0) {
    const client = await pool.connect();
    try {
        const {
            report_type,
            start_date,
            end_date
        } = filters;

        let query = 'SELECT * FROM reports WHERE user_id = $1';
        const values = [userId];
        let paramCount = 2;

        if (report_type) {
            query += ` AND report_type = $${paramCount}`;
            values.push(report_type);
            paramCount++;
        }

        if (start_date) {
            query += ` AND report_date >= $${paramCount}`;
            values.push(start_date);
            paramCount++;
        }

        if (end_date) {
            query += ` AND report_date <= $${paramCount}`;
            values.push(end_date);
            paramCount++;
        }

        query += ` ORDER BY report_date DESC, created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
        values.push(limit, offset);

        const result = await client.query(query, values);
        return result.rows;
    } catch (err) {
        console.error('Error getting reports by user ID:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Get reports by specific date (optionally filtered by report_type)
async function getReportsByDate(userId, reportDate, reportType = null) {
    const client = await pool.connect();
    try {
        let query = 'SELECT * FROM reports WHERE user_id = $1 AND report_date = $2';
        const values = [userId, reportDate];

        if (reportType) {
            query += ' AND report_type = $3';
            values.push(reportType);
        }

        query += ' ORDER BY created_at DESC';

        const result = await client.query(query, values);
        return result.rows;
    } catch (err) {
        console.error('Error getting reports by date:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Get a specific report by ID
async function getReportById(reportId, userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT * FROM reports WHERE id = $1 AND user_id = $2',
            [reportId, userId]
        );
        return result.rows[0] || null;
    } catch (err) {
        console.error('Error getting report by ID:', err);
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
    getServiceConnectionByName,
    updateServiceConnectionMetadata,
    storeGitHubConnection,
    getGitHubToken,
    deleteGitHubConnection,
    // Slack connection functions
    storeSlackConnection,
    getSlackToken,
    getSlackTokens,  // Get both bot and user tokens
    deleteSlackConnection,
    // Gmail connection functions
    storeGmailConnection,
    getGmailToken,
    deleteGmailConnection,
    updateGmailTokens,
    // Instagram connection functions
    storeInstagramConnection,
    deleteInstagramConnection,
    getInstagramConnection,
    // Meta Ads connection functions
    storeMetaAdsConnection,
    getMetaAdsToken,
    deleteMetaAdsConnection,
    updateMetaAdsTokens,
    getMetaAdsConnection,
    // Sentry connection functions
    storeSentryConnection,
    getSentryToken,
    deleteSentryConnection,
    updateSentryTokens,
    getSentryConnection,
    // App Store Connect connection functions
    storeAppStoreConnectConnection,
    getAppStoreConnectConnection,
    getAppStoreConnectPrivateKey,
    deleteAppStoreConnectConnection,
    updateAppStoreConnectConnection,
    storeAppStoreAnalyticsRequest,
    getAppStoreAnalyticsRequest,
    // Render connection functions
    storeRenderConnection,
    getRenderApiKey,
    deleteRenderConnection,
    getRenderConnection,
    // Module functions
    getModulesByUserId,
    getModuleById,
    createModule,
    updateModule,
    updateModuleSessionId,
    deleteModule,
    getModuleExecutions,
    createModuleExecution,
    updateModuleExecution,
    getActiveModulesForScheduling,
    // Agent functions (task-driven AI agents)
    getAgentsByUserId,
    getAgentById,
    createAgent,
    updateAgent,
    deleteAgent,
    getTasksByAgentId,
    getAgentExecutions,
    updateAgentSession,
    incrementAgentRoutineRuns,
    incrementAgentTaskCompletions,
    getAgentWithRoutines,
    // Routine functions (scheduled agent tasks)
    getRoutinesByUserId,
    getRoutinesByAgentId,
    getRoutineById,
    createRoutine,
    updateRoutine,
    deleteRoutine,
    getRoutinesDueForExecution,
    getRoutineExecutions,
    // Execution log functions
    saveExecutionLog,
    getExecutionLogs,
    getExecutionLogsSince,
    // Task summary functions
    createTaskSummary,
    // Task workflow functions
    createTaskProposal,
    updateTaskStatus,
    getTasksByStatus,
    getTaskById,
    getTasksByModuleId,
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
    // Reports functions
    createReport,
    getReportsByUserId,
    getReportsByDate,
    getReportById,
};
