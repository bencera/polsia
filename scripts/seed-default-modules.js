#!/usr/bin/env node

/**
 * Seed Default Modules Script
 *
 * This script seeds baseline modules that should exist in all environments.
 * - Run manually: node scripts/seed-default-modules.js
 * - Run after deployment: Add to Render deploy command
 * - Idempotent: Safe to run multiple times (upserts based on name)
 *
 * Environment-specific behavior:
 * - Production: Only creates essential modules
 * - Development: Creates essential + test modules
 */

const { pool } = require('../db');

// Determine environment
const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';

/**
 * Define baseline modules that should exist in all environments
 */
const ESSENTIAL_MODULES = [
    {
        name: 'Security Patcher',
        description: 'Monitors and patches security vulnerabilities in dependencies',
        type: 'security',
        frequency: 'weekly',  // Run weekly in production
        config: {
            goal: 'Scan for security vulnerabilities in package.json dependencies, create a new branch with fixes, and submit a GitHub PR if vulnerabilities are found.',
            mcpMounts: ['github'],
            inputs: {
                repo: 'Polsia-Inc/newco-app',
                branch: 'main',
            },
            maxTurns: 200,
        },
    },
    {
        name: 'Email Summarizer',
        description: 'Automatically fetches and summarizes your 5 most recent emails',
        type: 'email_summarizer',
        frequency: 'manual',
        config: {
            maxEmails: 5,
            query: 'in:inbox',
            maxTurns: 100,
        },
    },
    {
        name: 'Email MCP Spam Archiver',
        description: 'Analyzes recent emails and archives promotional spam using Gmail MCP',
        type: 'autonomous',
        frequency: 'manual',
        config: {
            maxTurns: 100,
            mcpMounts: ['gmail'],
            goal: `You are an email spam archiver. Your job is to:

1. Use the search_emails tool to find the 10 most recent emails in the inbox
2. For each email, use read_email to analyze its content
3. Determine if the email is clearly promotional/marketing/spam by looking for:
   - Unsubscribe links
   - Marketing language (Sale!, Discount!, Limited time offer!)
   - Newsletter-style content
   - Promotional headers
4. For any email that is promotional, use modify_email to archive it by removing the INBOX label
5. Keep track of how many emails you archived
6. At the end, provide a summary of:
   - Total emails checked
   - How many were archived
   - Subject lines of archived emails

Important: Only archive emails that are CLEARLY promotional. When in doubt, leave it in the inbox.`,
        },
    },
    {
        name: 'Email Importance Analyzer',
        description: 'Analyzes unread emails and categorizes them by importance (Urgent, Important, Normal, Low Priority)',
        type: 'autonomous',
        frequency: 'manual',
        config: {
            maxTurns: 100,
            mcpMounts: ['gmail'],
            goal: `You are an email importance analyzer. Your job is to:

1. Use search_emails to find all unread emails in the inbox (up to 100)
2. For each email, use read_email to analyze its full content
3. Categorize each email based on importance criteria:
   - **Urgent**: Time-sensitive (deadlines, meetings, urgent requests)
   - **Important**: From key contacts, requires action/response, business-critical
   - **Normal**: Regular work emails, informational
   - **Low Priority**: Newsletters, promotions, automated notifications

4. Analyze importance using these criteria:
   - Time-sensitive: Look for deadlines, meeting times, "urgent", "ASAP", expiration dates
   - Important contacts: Frequent senders, executive emails, client domains
   - Action required: Questions, requests, "please respond", "need", tasks
   - Business-related: Work topics vs promotional/newsletter content

5. At the end, provide a categorized report in this exact format:

## Urgent Emails (requires immediate attention)
1. [Subject] from [Sender]
   - Why: [Brief reason for urgency]

## Important Emails (requires attention soon)
1. [Subject] from [Sender]
   - Why: [Brief reason for importance]

## Normal Emails (standard priority)
1. [Subject] from [Sender]

## Low Priority Emails (can wait)
1. [Subject] from [Sender]

IMPORTANT:
- Analyze up to 100 unread emails
- Be thorough but efficient
- Provide clear reasoning for Urgent/Important categorization
- If no emails in a category, write "None"`,
        },
    },
    {
        name: 'Vision Gatherer',
        description: 'Analyzes your primary GitHub repository to generate a comprehensive product vision document',
        type: 'vision_gatherer',
        frequency: 'manual',
        config: {
            mcpMounts: ['github'],
            maxTurns: 200,
        },
    },
    {
        name: 'Render Analytics Summarizer',
        description: 'Autonomously analyzes production database to generate comprehensive business insights and usage metrics',
        type: 'render_analytics',
        frequency: 'daily',
        config: {
            mcpMounts: ['github', 'render'],
            maxTurns: 200, // High limit to allow thorough analysis and report generation
        },
    },
    {
        name: 'Sentry Bug Checker',
        description: 'Scans your Sentry projects for pending bugs and errors that need attention',
        type: 'autonomous',
        frequency: 'manual',
        config: {
            maxTurns: 100,
            mcpMounts: ['sentry'],
            goal: `You are a Sentry bug checker using our custom Sentry MCP server. Your job is to:

1. Use list_organizations to get your Sentry organizations
2. Use list_projects with organizationSlug to list all projects
3. Use list_issues with organizationSlug and projectSlug to retrieve unresolved issues
   - Parameters: organizationSlug, projectSlug, query='is:unresolved', limit=100
   - This returns a list of issues with metadata (count, userCount, etc.)
4. For each critical issue, use get_issue_details with issueId to get full stacktrace
5. Analyze and categorize issues by:
   - **Critical**: High event count (100+), recent, affecting many users
   - **High Priority**: Moderate frequency (20-100 events), recurring
   - **Medium Priority**: Low frequency (5-20 events), sporadic
   - **Low Priority**: Very low frequency (<5 events), edge cases

6. Provide this report format:

## Sentry Bug Report

**Total Issues Found:** [number]
**Projects Scanned:** [list]
**Generated:** [timestamp]

### Critical Issues (immediate attention required)
1. **[Issue Title]**
   - Type: [error type]
   - Events: [count] | Users: [affected]
   - Last Seen: [timestamp]
   - Link: [Sentry URL]
   - Error: [first 3 lines of stacktrace]

### High Priority Issues
[same format]

### Medium Priority Issues
[same format]

### Low Priority Issues
[same format]

### Summary
- Total Critical: [count]
- Total High: [count]
- Total Medium: [count]
- Total Low: [count]

IMPORTANT:
- Use list_issues (our custom MCP tool), NOT search_issues or find_issues
- Focus on unresolved issues only (query='is:unresolved')
- Read-only analysis - don't modify issues
- Include Sentry URLs for quick access (format: https://[org].sentry.io/issues/[issueId]/)
- If no issues in a category, write "None"
- Only fetch full stacktraces for Critical issues (to save API calls)`,
        },
    },
];

/**
 * Test modules for development environment only
 */
const DEV_TEST_MODULES = [
    {
        name: 'Footer Copyright Updater',
        description: 'Updates the copyright name in the landing page footer',
        type: 'maintenance',
        frequency: 'manual',
        config: {
            goal: 'Change the copyright name in the footer of the landing page from "Polsia Inc." to "Polsia AI". The landing page is at client/src/pages/Landing.jsx. Use GitHub MCP to create a PR with the change.',
            mcpMounts: ['github'],
            inputs: {
                repo: 'Polsia-Inc/newco-app',
                branch: 'main',
                file: 'client/src/pages/Landing.jsx',
                oldText: 'Polsia Inc.',
                newText: 'Polsia AI',
            },
            maxTurns: 50,
        },
    },
];

/**
 * Upsert a module (insert or update if exists)
 */
async function upsertModule(client, userId, moduleData) {
    const { name, description, type, frequency, config } = moduleData;

    // Check if module already exists
    const existingModule = await client.query(
        `SELECT id, name, frequency, status FROM modules WHERE name = $1 AND user_id = $2`,
        [name, userId]
    );

    if (existingModule.rows.length > 0) {
        // Update existing module
        const module = existingModule.rows[0];
        console.log(`   📝 Updating existing module: ${name} (ID: ${module.id})`);

        await client.query(
            `UPDATE modules
             SET description = $1,
                 type = $2,
                 frequency = $3,
                 config = $4,
                 status = 'active',
                 updated_at = NOW()
             WHERE id = $5`,
            [description, type, frequency, JSON.stringify(config), module.id]
        );

        console.log(`      ✅ Updated: ${name} → frequency: ${frequency}`);
        return module.id;
    } else {
        // Insert new module
        console.log(`   ➕ Creating new module: ${name}`);

        const result = await client.query(
            `INSERT INTO modules (
                user_id, name, description, type, frequency, status, config, created_at, updated_at
             ) VALUES ($1, $2, $3, $4, $5, 'active', $6, NOW(), NOW())
             RETURNING id, name, frequency`,
            [userId, name, description, type, frequency, JSON.stringify(config)]
        );

        console.log(`      ✅ Created: ${name} (ID: ${result.rows[0].id}) → frequency: ${frequency}`);
        return result.rows[0].id;
    }
}

/**
 * Get or create demo user (for production first-time setup)
 */
async function getOrCreateDemoUser(client) {
    // Try to find existing user
    const existingUser = await client.query(
        `SELECT id, email FROM users ORDER BY id LIMIT 1`
    );

    if (existingUser.rows.length > 0) {
        return existingUser.rows[0].id;
    }

    // In production, we should have users from the auth system
    // This is just a safety fallback
    console.log('   ⚠️  No users found. Modules will be created when first user registers.');
    return null;
}

/**
 * Main seeding function
 */
async function main() {
    const client = await pool.connect();

    try {
        console.log('🌱 Seeding default modules...\n');
        console.log(`   Environment: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}\n`);

        // Get user ID to associate modules with
        const userId = await getOrCreateDemoUser(client);

        if (!userId) {
            console.log('⚠️  Skipping module seeding (no users exist yet)\n');
            console.log('💡 Modules will be seeded when first user registers.\n');
            return;
        }

        console.log(`   Using user ID: ${userId}\n`);

        // 1. Seed essential modules (all environments)
        console.log('📦 Essential Modules (all environments):');
        for (const moduleData of ESSENTIAL_MODULES) {
            await upsertModule(client, userId, moduleData);
        }
        console.log();

        // 2. Seed test modules (dev only)
        if (!isProduction) {
            console.log('🧪 Test Modules (development only):');
            for (const moduleData of DEV_TEST_MODULES) {
                await upsertModule(client, userId, moduleData);
            }
            console.log();
        }

        // 3. List all modules
        console.log('📋 Current modules:');
        const modules = await client.query(
            `SELECT id, name, frequency, status, type
             FROM modules
             WHERE user_id = $1
             ORDER BY id`,
            [userId]
        );

        if (modules.rows.length === 0) {
            console.log('   (No modules found)\n');
        } else {
            modules.rows.forEach(mod => {
                const activeSymbol = mod.status === 'active' ? '🟢' : '🔴';
                const freqEmoji = mod.frequency === 'manual' ? '👆' : '🔄';
                console.log(`   ${activeSymbol} ${freqEmoji} [${mod.id}] ${mod.name} (${mod.frequency}, ${mod.type})`);
            });
            console.log();
        }

        console.log('✅ Module seeding complete!\n');

        if (isProduction) {
            console.log('💡 Production notes:');
            console.log('   - Security Patcher will run weekly');
            console.log('   - Test modules are not created in production\n');
        } else {
            console.log('💡 Development notes:');
            console.log('   - Security Patcher frequency: weekly (but you can run manually)');
            console.log('   - Footer Copyright Updater: manual (for testing)');
            console.log('   - Run modules from: http://localhost:5173/modules\n');
        }

    } catch (error) {
        console.error('❌ Error seeding modules:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = { upsertModule, ESSENTIAL_MODULES, DEV_TEST_MODULES };
