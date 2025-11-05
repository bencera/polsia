const { pool } = require('../db');
const db = require('../db');

/**
 * Default template documents for new users
 */
const DEFAULT_TEMPLATES = {
  vision: `# Company Vision

## What We Do
[Description of your company, product, or service]

## Target Audience
[Who are your customers or users?]

## Mission
[What is your company's mission and purpose?]

## Tone & Values
[What is your company's voice, tone, and core values?]
`,

  goals: `# Company Goals

## Key Goals
- Grow the userbase
- Increase user retention
- Make users happy
- Increase revenue
- Achieve profitability
`,

  analytics: '',

  memory: '# Memory Log\n\nThis file contains a running log of notable events, decisions, and insights.\n\n---\n\n',
};

/**
 * Initialize document store for a new user with template documents
 * @param {number} userId - User ID
 * @returns {Promise<object>} - Created document store record
 */
async function initializeDocumentStore(userId) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO document_store (user_id, vision_md, goals_md, analytics_md, analytics_json, memory_md)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id) DO NOTHING
       RETURNING *`,
      [
        userId,
        DEFAULT_TEMPLATES.vision,
        DEFAULT_TEMPLATES.goals,
        DEFAULT_TEMPLATES.analytics,
        JSON.stringify({}),
        DEFAULT_TEMPLATES.memory,
      ]
    );

    if (result.rows.length > 0) {
      console.log(`✅ [Document Store] Initialized for user ${userId}`);
      return result.rows[0];
    } else {
      console.log(`ℹ️  [Document Store] Already exists for user ${userId}`);
      // Fetch existing document store
      const existing = await client.query(
        'SELECT * FROM document_store WHERE user_id = $1',
        [userId]
      );
      return existing.rows[0];
    }
  } catch (err) {
    console.error('❌ [Document Store] Error initializing:', err);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get document store for a user
 * @param {number} userId - User ID
 * @returns {Promise<object|null>} - Document store record or null
 */
async function getDocumentStore(userId) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM document_store WHERE user_id = $1',
      [userId]
    );
    return result.rows[0] || null;
  } catch (err) {
    console.error('❌ [Document Store] Error fetching:', err);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Update a specific document in the document store
 * @param {number} userId - User ID
 * @param {string} docType - Document type ('vision_md', 'goals_md', 'analytics_md', 'analytics_json', 'memory_md')
 * @param {string|object} content - Document content (string for _md fields, object for analytics_json)
 * @returns {Promise<object>} - Updated document store record
 */
async function updateDocument(userId, docType, content) {
  const client = await pool.connect();

  const validDocTypes = ['vision_md', 'goals_md', 'analytics_md', 'analytics_json', 'memory_md'];
  if (!validDocTypes.includes(docType)) {
    throw new Error(`Invalid document type: ${docType}`);
  }

  try {
    // For analytics_json, ensure it's properly stringified
    const value = docType === 'analytics_json'
      ? (typeof content === 'string' ? content : JSON.stringify(content))
      : content;

    // Security: Use parameterized CASE statement to avoid SQL injection
    // Never interpolate column names directly into queries
    const result = await client.query(
      `UPDATE document_store
       SET vision_md = CASE WHEN $3 = 'vision_md' THEN $1 ELSE vision_md END,
           goals_md = CASE WHEN $3 = 'goals_md' THEN $1 ELSE goals_md END,
           analytics_md = CASE WHEN $3 = 'analytics_md' THEN $1 ELSE analytics_md END,
           analytics_json = CASE WHEN $3 = 'analytics_json' THEN $1 ELSE analytics_json END,
           memory_md = CASE WHEN $3 = 'memory_md' THEN $1 ELSE memory_md END
       WHERE user_id = $2
       RETURNING *`,
      [value, userId, docType]
    );

    if (result.rows.length > 0) {
      console.log(`✅ [Document Store] Updated ${docType} for user ${userId}`);
      return result.rows[0];
    } else {
      throw new Error(`No document store found for user ${userId}`);
    }
  } catch (err) {
    console.error(`❌ [Document Store] Error updating ${docType}:`, err);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Append an entry to memory.md
 * @param {number} userId - User ID
 * @param {string} entry - Memory entry to append
 * @returns {Promise<object>} - Updated document store record
 */
async function appendToMemory(userId, entry) {
  const client = await pool.connect();
  try {
    const timestamp = new Date().toISOString();
    const formattedEntry = `\n## ${timestamp}\n${entry}\n`;

    const result = await client.query(
      `UPDATE document_store
       SET memory_md = memory_md || $1
       WHERE user_id = $2
       RETURNING *`,
      [formattedEntry, userId]
    );

    if (result.rows.length > 0) {
      console.log(`✅ [Document Store] Appended to memory for user ${userId}`);
      return result.rows[0];
    } else {
      throw new Error(`No document store found for user ${userId}`);
    }
  } catch (err) {
    console.error('❌ [Document Store] Error appending to memory:', err);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get unified context bundle for the Brain orchestrator
 * Combines document store with runtime data (enabled modules, recent executions, etc.)
 * @param {number} userId - User ID
 * @returns {Promise<object>} - Unified context bundle
 */
async function getUnifiedContext(userId) {
  const client = await pool.connect();
  try {
    // Get document store
    const docStore = await getDocumentStore(userId);
    if (!docStore) {
      throw new Error(`No document store found for user ${userId}`);
    }

    // Get enabled modules
    const modulesResult = await client.query(
      `SELECT id, name, type, config, frequency, status
       FROM modules
       WHERE user_id = $1 AND status = 'active'
       ORDER BY name`,
      [userId]
    );

    // Get recent module executions (last 20)
    const executionsResult = await client.query(
      `SELECT
        me.id,
        me.module_id,
        m.name as module_name,
        m.type as module_type,
        me.status,
        me.trigger_type,
        me.duration_ms,
        me.cost_usd,
        me.started_at,
        me.completed_at,
        me.error_message,
        me.metadata
       FROM module_executions me
       JOIN modules m ON me.module_id = m.id
       WHERE m.user_id = $1
       ORDER BY me.started_at DESC
       LIMIT 20`,
      [userId]
    );

    // Get user info
    const user = await db.getUserById(userId);

    // Get service connections (to know what integrations are available)
    const connectionsResult = await client.query(
      `SELECT service_name, status
       FROM service_connections
       WHERE user_id = $1 AND status = 'connected'`,
      [userId]
    );

    // Build unified context
    const context = {
      timestamp: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      documents: {
        vision_md: docStore.vision_md,
        goals_md: docStore.goals_md,
        analytics_md: docStore.analytics_md,
        analytics_json: docStore.analytics_json,
        memory_md: docStore.memory_md,
      },
      enabled_modules: modulesResult.rows,
      recent_executions: executionsResult.rows,
      connected_services: connectionsResult.rows.map(r => r.service_name),
    };

    console.log(`✅ [Document Store] Generated unified context for user ${userId}`);
    return context;
  } catch (err) {
    console.error('❌ [Document Store] Error generating unified context:', err);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  initializeDocumentStore,
  getDocumentStore,
  updateDocument,
  appendToMemory,
  getUnifiedContext,
  DEFAULT_TEMPLATES,
};
