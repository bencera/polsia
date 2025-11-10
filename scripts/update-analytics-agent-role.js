#!/usr/bin/env node

/**
 * Update Analytics Agent Role
 *
 * Updates the Analytics Agent's role to include instructions to:
 * 1. Clone the GitHub repository first (to understand schema)
 * 2. Then query the production database
 * 3. Generate analytics report
 */

require('dotenv').config();
const { pool } = require('../db');

const UPDATED_ANALYTICS_ROLE = `You are an Analytics Agent that collects metrics and generates reports on business performance. Track KPIs and identify trends.

## Your Workflow

When performing analytics on a production database, ALWAYS follow these steps:

### Step 1: Clone and Read the Repository
**CRITICAL**: Before querying the production database, you MUST first clone the GitHub repository to understand the codebase structure and database schema.

1. Use the GitHub MCP to read the repository
2. Look for:
   - Database schema files (migrations/, db.js, models/)
   - Table definitions and column names
   - API endpoints that show what data exists
   - README or docs that explain the data model

3. Take notes on:
   - Exact table names (check if lowercase/uppercase/snake_case/camelCase)
   - Exact column names (check naming conventions)
   - Relationships between tables
   - Key metrics to track

### Step 2: Query Production Database
Once you understand the schema:

1. Use the Render MCP to query the production database
2. Use EXACT table and column names from the schema
3. Query for key metrics like:
   - Total users (active vs inactive)
   - Usage metrics (executions, API calls, etc.)
   - Cost metrics (LLM costs, infrastructure costs)
   - Performance metrics (errors, latency, uptime)
   - Growth metrics (new users, retention, engagement)

### Step 3: Generate Report
After collecting metrics:

1. Analyze trends and patterns
2. Identify areas of concern or opportunity
3. Create a markdown report with:
   - Executive summary
   - Key metrics with context
   - Trends over time (if historical data available)
   - Actionable insights
4. Save the report using the Reports MCP

## Tools You Have

- **GitHub MCP**: Read repositories, browse files, search code
- **Render MCP**: Query production databases, get service metrics
- **Reports MCP**: Save analytics reports for historical tracking

## Best Practices

- Always clone/read the repo FIRST before querying the database
- Use information_schema to discover tables if schema files aren't clear
- Test queries on small datasets first
- Handle errors gracefully (missing tables, columns, etc.)
- Provide context with every metric (what it means, why it matters)
- Compare current metrics to historical trends when possible`;

async function updateAnalyticsAgent() {
    const client = await pool.connect();

    try {
        console.log('🔄 Updating Analytics Agent role...\n');

        // Find Analytics Agent
        const result = await client.query(
            `SELECT id, name, agent_type FROM agents WHERE agent_type = $1`,
            ['analytics_agent']
        );

        if (result.rows.length === 0) {
            console.log('⚠️  No Analytics Agent found. Creating one...\n');

            // Create Analytics Agent with GitHub MCP mount
            const createResult = await client.query(
                `INSERT INTO agents (
                    user_id, name, description, role, agent_type, status, config
                ) VALUES (
                    (SELECT id FROM users ORDER BY id LIMIT 1),
                    $1, $2, $3, $4, $5, $6
                )
                RETURNING id, name`,
                [
                    'Analytics Agent',
                    'Collects and analyzes metrics from various platforms',
                    UPDATED_ANALYTICS_ROLE,
                    'analytics_agent',
                    'active',
                    JSON.stringify({
                        mcpMounts: ['github', 'render', 'reports'],
                        maxTurns: 100
                    })
                ]
            );

            console.log(`✅ Created Analytics Agent (ID: ${createResult.rows[0].id})`);
        } else {
            // Update existing agent(s)
            for (const agent of result.rows) {
                console.log(`📝 Updating agent: ${agent.name} (ID: ${agent.id})`);

                await client.query(
                    `UPDATE agents
                     SET role = $1,
                         config = jsonb_set(
                             COALESCE(config, '{}'::jsonb),
                             '{mcpMounts}',
                             $2::jsonb,
                             true
                         ),
                         updated_at = NOW()
                     WHERE id = $3`,
                    [
                        UPDATED_ANALYTICS_ROLE,
                        JSON.stringify(['github', 'render', 'reports']),
                        agent.id
                    ]
                );

                console.log(`   ✅ Updated role and added GitHub MCP mount`);
            }
        }

        // Update Render Analytics routine config to ensure it has GitHub mount
        console.log('\n🔄 Updating Render Analytics routine config...\n');

        const routineResult = await client.query(
            `SELECT id, name, agent_id FROM routines WHERE type = $1`,
            ['render_analytics']
        );

        if (routineResult.rows.length > 0) {
            for (const routine of routineResult.rows) {
                console.log(`📝 Updating routine: ${routine.name} (ID: ${routine.id})`);

                // Build updated config in one operation
                const updatedConfig = {
                    mcpMounts: ['github', 'render', 'reports'],
                    goal: 'Generate a daily analytics snapshot from the production database. First clone and read the GitHub repository to understand the database schema, then query the production Render database for key metrics, and save a report.',
                    mcpConfig: {
                        github: {
                            owner: 'benbroca',
                            repo: 'blanks'
                        }
                    }
                };

                await client.query(
                    `UPDATE routines
                     SET config = $1::jsonb
                     WHERE id = $2`,
                    [
                        JSON.stringify(updatedConfig),
                        routine.id
                    ]
                );

                console.log(`   ✅ Updated routine config with GitHub mount and improved goal`);
            }
        } else {
            console.log('⚠️  No Render Analytics routine found.');
        }

        console.log('\n✅ Update complete!\n');
        console.log('📋 Summary:');
        console.log('   - Analytics Agent now instructs to clone repo FIRST');
        console.log('   - GitHub MCP mount added to agent config');
        console.log('   - Routine config updated with GitHub mount');
        console.log('   - Agent will now understand schema before querying DB\n');

    } catch (error) {
        console.error('❌ Error updating Analytics Agent:', error);
        console.error(error.stack);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

// Run if called directly
if (require.main === module) {
    updateAnalyticsAgent();
}

module.exports = { updateAnalyticsAgent };
