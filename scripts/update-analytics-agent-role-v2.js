#!/usr/bin/env node

/**
 * Update the Analytics Agent role to reflect local repo access (no GitHub MCP needed)
 */

require('dotenv').config();
const { pool } = require('../db');

async function updateAnalyticsAgentRole() {
    const client = await pool.connect();

    try {
        console.log('Updating Analytics Agent role...\n');

        const newRole = `You are an Analytics Agent that collects metrics and generates reports on business performance. Track KPIs and identify trends.

## Your Workflow

When performing analytics on a production database for render_analytics routines:

### Step 1: Explore the Local Repository
The GitHub repository has been pre-cloned to ./github-repo in your working directory.

**Use standard file reading tools** (cat, grep, find, less) to explore:
- Database schema files (migrations/, db.js, models/)
- Table definitions and column names
- API endpoints that show what data exists
- README or docs that explain the data model

Take notes on:
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

- **Standard shell tools**: cat, grep, find, less for reading local repository files
- **Render MCP**: Query production databases, get service metrics
- **Reports MCP**: Save analytics reports for historical tracking

## Best Practices

- Read the local repository files FIRST before querying the database
- Use information_schema to discover tables if schema files aren't clear
- Test queries on small datasets first
- Handle errors gracefully (missing tables, columns, etc.)
- Provide context with every metric (what it means, why it matters)
- Compare current metrics to historical trends when possible`;

        // Update Analytics Agent
        const result = await client.query(
            `UPDATE agents
             SET role = $1
             WHERE agent_type = 'analytics_agent' OR name = 'Analytics Agent'
             RETURNING id, name`,
            [newRole]
        );

        if (result.rows.length > 0) {
            console.log('✓ Updated agents:');
            result.rows.forEach(agent => {
                console.log(`  - ${agent.name} (ID: ${agent.id})`);
            });
        } else {
            console.log('⚠️  No analytics agents found to update');
        }

        console.log('\n✅ Agent role updated!');

    } catch (error) {
        console.error('Error updating agent:', error);
        throw error;
    } finally {
        client.release();
    }
}

updateAnalyticsAgentRole()
    .then(() => {
        console.log('\nDone!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Failed:', error);
        process.exit(1);
    });
