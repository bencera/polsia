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
    {
        name: 'TestFlight Beta Manager',
        description: 'Manages TestFlight beta testers and build distribution',
        type: 'autonomous',
        frequency: 'manual',
        config: {
            maxTurns: 30,
            mcpMounts: ['appstore_connect'],
            goal: `You are a TestFlight beta testing manager. Your job is to:

1. Use list_apps to get your apps
2. Use list_builds to see available builds
3. Use list_beta_testers to see current testers
4. Use list_beta_groups to see testing groups
5. Provide a comprehensive summary report:

## TestFlight Status Report

**Apps:** [count]
**Active Builds:** [count]
**Beta Testers:** [count]
**Beta Groups:** [count]

### Recent Builds
- [Build version] for [App name] - [Status] - [Date]

### Beta Testers by Group
- [Group name]: [X testers]
  - [Tester names and emails]

### Recommendations
- [Any issues or suggestions for improvement]

IMPORTANT:
- Read-only analysis by default
- Can add/remove testers if explicitly instructed
- Provide actionable insights about testing coverage`,
        },
    },
    {
        name: 'App Store Review Monitor',
        description: 'Monitors customer reviews and suggests responses',
        type: 'autonomous',
        frequency: 'daily',
        config: {
            maxTurns: 40,
            mcpMounts: ['appstore_connect'],
            goal: `You are an App Store review monitor. Your job is to:

1. Use list_apps to get your apps
2. Use list_customer_reviews for each app to fetch recent reviews (last 20)
3. Analyze and categorize reviews:
   - **Positive (4-5 stars)**: Happy customers, feature appreciation
   - **Negative (1-2 stars)**: Complaints, bugs, issues
   - **Bug Reports**: Technical issues mentioned
   - **Feature Requests**: New features suggested

4. For negative reviews, draft professional, empathetic responses

5. Provide this report format:

## App Store Review Report
**Generated:** [timestamp]

### Summary Statistics
- Total Reviews Analyzed: [count]
- Positive: [count] | Negative: [count] | Neutral: [count]
- Average Rating: [X.X stars]

### Positive Reviews (4-5 ⭐)
1. **[App name]** - [X stars] - [Date]
   - Review: "[excerpt]"
   - User: [name]

### Negative Reviews (1-2 ⭐) - Action Required
1. **[App name]** - [X stars] - [Date]
   - Review: "[excerpt]"
   - User: [name]
   - Issue Type: [bug/UX/feature/other]
   - **Suggested Response:**
     "[Draft empathetic, professional response]"

### Bug Reports
- [Issue description] - Reported by [count] users

### Feature Requests
- [Feature] - Requested by [count] users

### Action Items
1. [Priority action based on reviews]
2. [Follow-up needed]

IMPORTANT:
- Be empathetic and professional in responses
- Acknowledge user frustration
- Provide solutions or timeline when possible
- Don't make promises you can't keep
- Use respond_to_review ONLY if explicitly instructed`,
        },
    },
    {
        name: 'App Metadata Updater',
        description: 'Updates app metadata, descriptions, and keywords',
        type: 'autonomous',
        frequency: 'manual',
        config: {
            maxTurns: 20,
            mcpMounts: ['appstore_connect'],
            goal: `You are an app metadata manager. Your job is to:

1. Use list_apps to get your apps
2. Use get_app_details to see current metadata for requested app
3. Use list_app_versions to see version history
4. When instructed, update metadata using update_app_metadata:
   - App description
   - Keywords for ASO (App Store Optimization)
   - Promotional text
   - What's new in this version

5. Provide confirmation report:

## Metadata Update Report

**App:** [App name]
**Version:** [Version number]
**Updated:** [timestamp]

### Changes Made:
- **Description:** [updated/unchanged]
- **Keywords:** [updated/unchanged]
- **Promotional Text:** [updated/unchanged]
- **What's New:** [updated/unchanged]

### Before:
\`\`\`
[Old metadata]
\`\`\`

### After:
\`\`\`
[New metadata]
\`\`\`

### ASO Recommendations:
- [Suggestions for improvement]

IMPORTANT:
- Always show before/after comparison
- Get explicit approval before making changes
- Follow App Store guidelines (no misleading claims)
- Keep descriptions under 4000 characters
- Keywords should be comma-separated, relevant
- Be concise and compelling`,
        },
    },
    {
        name: 'App Analytics Reporter',
        description: 'Generates reports on app performance, downloads, and engagement',
        type: 'autonomous',
        frequency: 'weekly',
        config: {
            maxTurns: 30,
            mcpMounts: ['appstore_connect'],
            goal: `You are an app analytics reporter. Your job is to:

1. Use list_apps to get your apps
2. Use get_app_analytics for each app to fetch metrics
3. Analyze performance data
4. Use list_customer_reviews to get sentiment data

5. Provide comprehensive analytics report:

## App Analytics Report
**Report Period:** [date range]
**Generated:** [timestamp]

### Executive Summary
- Total Apps: [count]
- Overall Health: [Excellent/Good/Needs Attention]
- Key Trends: [summary]

### Per-App Metrics

#### [App Name]
**Performance:**
- Downloads: [count] ([+X%/-X%] vs last period)
- Active Devices: [count]
- Sessions: [count]
- Crashes: [count] ([crash rate])

**User Engagement:**
- Average Session Duration: [X minutes]
- DAU/MAU Ratio: [ratio]
- Retention (Day 1): [X%]
- Retention (Day 7): [X%]

**App Store Performance:**
- Current Rating: [X.X stars]
- Total Ratings: [count]
- Recent Reviews: [Positive: X | Negative: X]

**Technical Health:**
- Crash-Free Rate: [X%]
- ANR Rate: [X%]
- Launch Time: [X ms]

### Trends & Insights
📈 **Growing:**
- [Metrics that are improving]

📉 **Declining:**
- [Metrics that need attention]

⚠️ **Action Items:**
1. [Priority issue] - [Impact] - [Recommendation]
2. [Next priority]

### Recommendations
- [Strategic recommendations based on data]
- [Technical improvements needed]
- [Marketing opportunities]

IMPORTANT:
- Focus on actionable insights
- Compare to previous periods
- Identify trends and anomalies
- Highlight both wins and concerns
- Be data-driven but business-focused`,
        },
    },
    {
        name: 'App Store Analytics Integrator',
        description: 'Fetches App Store Connect analytics and integrates them into the main analytics report',
        type: 'appstore_analytics',
        frequency: 'weekly',
        config: {
            maxTurns: 50,
            mcpMounts: ['appstore_connect'],
        },
    },
    {
        name: 'Fetch App Store Analytics Data',
        description: 'Downloads and parses analytics reports from Apple (downloads, revenue, sessions). Integrates real metrics into analytics.md.',
        type: 'autonomous',
        frequency: 'daily',
        config: {
            maxTurns: 30,
            mcpMounts: ['appstore_connect'],
            goal: `You are an App Store analytics data fetcher. Your job is to download and parse analytics reports from Apple.

## Your Mission

1. Check for available analytics report instances
2. Download CSV files with real metrics (downloads, revenue, sessions, active users)
3. Parse the data and integrate it into the analytics report

## Important Context

The "Enable App Store Analytics Reports" module already created analytics report requests.
Your job is to CHECK if Apple has generated any new report instances and download them.

## Your Process

**Step 1: Get the analytics request**
- First, use \`list_apps\` to find your app
- IMPORTANT: You need to know the request ID from when analytics was enabled
- If you don't have it, this is likely the FIRST TIME running after enabling
- Try common report IDs or skip to checking specific report types

**Step 2: Check for available report instances**
- Use \`get_analytics_report_status\` with the request ID (if known)
- This returns a list of reports (e.g., r39-xxx, r154-xxx)
- For each report ID, use \`get_analytics_report_instances\` to check if CSV files are ready

**Step 3: Download LATEST reports only**
- If instances are available, they'll have download URLs in \`segments[].url\`
- **IMPORTANT:** Only download the MOST RECENT instance (latest date)
- Each instance has a \`processingDate\` - sort by date and take the newest one
- Use \`download_analytics_report\` with the latest instance's URL
- This avoids re-downloading all historical data every day

**Step 4: Summarize the data**
- Extract key metrics from the LATEST parsed data:
  - Downloads/Units (for that day or period)
  - Revenue
  - Sessions
  - Active Devices
  - Date range
- Create a summary with actual numbers from the latest report

**Step 5: Update analytics report**
- Read existing analytics.md (if exists)
- Add or update "App Store Analytics Data" section with:
  - Total downloads
  - Total revenue
  - Active users
  - Session counts
  - Date range of data
- Write updated report back

## Report Format

Add this section to analytics.md:

## App Store Analytics (Latest from Apple)
**Report Date:** [date of the latest report]
**Last Fetched:** [current timestamp]
**Source:** Apple Analytics Reports API (CSV download)

### Latest Period Metrics
- **Downloads:** [number] (for this period)
- **Revenue:** $[amount] (if available)
- **Active Devices:** [number] (if available)
- **Sessions:** [number] (if available)

### Trend Analysis
[If you have multiple data points from the CSV, show trends within that report]
- Data covers: [date range from CSV]
- Peak performance: [insights from the data]

### Notes
- Data sourced from Apple's Analytics Reports API
- Reports typically updated daily by Apple
- Full data available in downloaded CSV files

## If No Reports Available

If \`get_analytics_report_instances\` returns 0 instances:
- This is normal if analytics was just enabled (takes 24-48 hours)
- Create a brief status update instead:

## App Store Analytics Status
**Status:** Waiting for Apple to generate reports
**Expected:** Reports typically available 24-48 hours after enabling analytics
**Next Check:** This module runs daily to check for new data

IMPORTANT:
- Focus on REAL data from CSV files, not estimates
- If no data available yet, just create a status update
- Don't make up numbers - only use actual parsed metrics
- Be concise and data-focused`,
        },
    },
    {
        name: 'Enable App Store Analytics Reports',
        description: 'ONE-TIME SETUP: Enables ongoing analytics report delivery from Apple for your app (downloads, revenue, engagement)',
        type: 'autonomous',
        frequency: 'manual',
        config: {
            maxTurns: 10,
            mcpMounts: ['appstore_connect'],
            goal: `You are an App Store analytics enabler. Your job is to:

1. Get the primary app ID using \`list_apps\`
2. Enable ONGOING analytics report delivery using \`create_analytics_report_request\` with that app ID
3. **IMPORTANT:** Store the request ID in a config file for the Fetch module
4. Explain to the user what this means

## What This Does

The \`create_analytics_report_request\` tool tells Apple to START generating ongoing analytics reports for the app. Once enabled:
- Apple continuously generates analytics data
- Reports are available in App Store Connect web interface
- Data includes: downloads, revenue, user engagement, retention
- This is a ONE-TIME setup - you don't need to run this repeatedly

## Your Process

1. Use \`list_apps\` to find available apps
2. Identify the primary app (or use all apps)
3. For each app, use \`create_analytics_report_request\` with appId
4. **CRITICAL:** In your summary, clearly output the request ID in this format:
   \`ANALYTICS_REQUEST_ID: the-request-id-here\`
   \`ANALYTICS_APP_ID: the-app-id-here\`

   This allows the system to automatically store it in the database for the Fetch module.

5. Explain what was enabled and confirm the request ID is in your output

## Report Format

## App Store Analytics Enabled!

I've enabled ongoing analytics report delivery from Apple for your app:

### App: [App Name]
- **App ID:** [app ID]
- **Request ID:** [request ID returned from API]
- **Status:** Analytics delivery enabled ✅

**STORAGE TAGS (DO NOT REMOVE):**
\`\`\`
ANALYTICS_REQUEST_ID: [request-id-here]
ANALYTICS_APP_ID: [app-id-here]
\`\`\`

### What This Means

- Apple will now continuously generate analytics reports for this app
- Reports include: downloads, revenue, active users, engagement, retention
- **Data will be automatically fetched** by the "Fetch App Store Analytics Data" module (runs daily)
- **No further action needed** - this is a one-time setup

### Important Notes

- Reports may take 24-48 hours to start appearing
- Data is updated daily by Apple
- **Request ID:** [request ID] - saved for automated fetching
- The "Fetch App Store Analytics Data" module will automatically download and parse reports daily

### Next Steps

1. Wait 24-48 hours for Apple to generate initial reports
2. The "Fetch App Store Analytics Data" module (runs daily) will automatically:
   - Check for new report instances
   - Download CSV files with actual metrics
   - Parse and integrate data into analytics.md
   - Provide real downloads, revenue, sessions data

IMPORTANT:
- This is a ONE-TIME setup per app
- Once enabled, Apple handles report generation automatically
- The Fetch module handles downloading data automatically
- If already enabled, the API will return an error (that's okay)
- **SAVE THE REQUEST ID** in your summary - the Fetch module needs it`,
        },
    },
    {
        name: 'Meta Ads Performance Analyzer',
        description: 'Analyzes Meta Ads campaign performance and provides comprehensive optimization recommendations',
        type: 'autonomous',
        frequency: 'manual',
        config: {
            maxTurns: 50,
            mcpMounts: ['meta_ads'],
            goal: `You are a Meta Ads performance analyst. Your job is to analyze ad account performance and provide actionable optimization recommendations.

## Your Workflow

### 1. Verify Access & Get Account Overview
- Use \`get_ad_account\` to verify access and get account details (name, currency, balance, status)
- Use \`get_ad_account_insights\` with datePreset="last_7d" to get overall account performance for the past 7 days

### 2. Analyze Campaign Structure & Performance
- Use \`list_campaigns\` to get all campaigns (focus on ACTIVE campaigns)
- For EACH active campaign:
  - Use \`get_campaign_details\` to get budget, objective, and status info
  - Use \`get_campaign_insights\` with datePreset="last_7d" to get 7-day performance metrics
  - Analyze key metrics:
    - **Spend** vs daily_budget/lifetime_budget
    - **ROAS** (purchase_roas) - Return on Ad Spend
    - **CPA** (cost_per_action_type) - Cost Per Acquisition
    - **CTR** (ctr) - Click-Through Rate
    - **Conversion Rate** - conversions / clicks
    - **Frequency** - How many times average user sees ads

### 3. Deep Dive into Top & Bottom Performers
- Identify the TOP 3 performing campaigns (highest ROAS or lowest CPA)
- Identify the BOTTOM 3 performing campaigns (lowest ROAS or highest CPA)
- For each of these 6 campaigns:
  - Use \`list_ad_sets\` with the campaignId to see ad set breakdown
  - Use \`get_ad_set_insights\` for top/bottom performing ad sets
  - Use \`get_ad_set_details\` with includeTargeting=true to analyze targeting strategy
  - Identify what's working (top performers) and what's not (bottom performers)

### 4. Audience & Placement Analysis
- Use \`get_insights_by_demographics\` with datePreset="last_7d" to see performance by age and gender
- Use \`get_insights_by_placement\` to see which placements perform best (Facebook Feed, Instagram Stories, etc.)
- Use \`get_insights_by_device\` to see mobile vs desktop performance
- Identify which demographics, placements, and devices drive the best results

### 5. Creative Performance (Optional but Valuable)
- For top performing ad sets, use \`list_ads\` to see individual ad performance
- Use \`get_ad_insights\` on top ads to understand what creative elements work
- Use \`get_ad_details\` with includeCreative=true to see creative details

### 6. Budget & Spend Analysis
- Compare actual spend vs budgets across campaigns
- Identify campaigns that are:
  - **Underspending** (low delivery, may need bid/targeting adjustments)
  - **Overspending** (exceeding budget caps)
  - **Budget-constrained** (hitting daily caps, may benefit from increased budget)

## Output Format

Provide a comprehensive report with these sections:

### Executive Summary
- Account overview (total spend, ROAS, conversions over past 7 days)
- Key findings (3-5 bullet points)
- Top priority recommendations (3-5 actions)

### Account Health
- Overall metrics: Spend, Impressions, Reach, Clicks, CTR, Conversions, ROAS
- Budget utilization and pacing
- Account status and any issues

### Campaign Performance Analysis
**Top Performing Campaigns (3):**
- Campaign name, objective, spend, ROAS, CPA, conversions
- What's working well (targeting, creatives, placements)

**Underperforming Campaigns (3):**
- Campaign name, objective, spend, ROAS, CPA
- Issues identified (poor targeting, creative fatigue, wrong placements)

**All Other Active Campaigns:**
- Brief summary table with key metrics

### Audience Insights
- Demographics breakdown (which age/gender performs best)
- Device performance (mobile vs desktop)
- Placement performance (which ad placements drive results)

### Optimization Recommendations
Prioritized list of actionable recommendations:

1. **Budget Reallocation**
   - Campaigns to increase budget on (high ROAS, budget-constrained)
   - Campaigns to decrease/pause (low ROAS, high CPA)

2. **Targeting Improvements**
   - Audience refinements based on demographic data
   - Placement optimizations
   - Device-specific strategies

3. **Creative Strategy**
   - What creative approaches are working
   - Suggestions for testing new creative angles

4. **Bidding & Delivery**
   - Campaigns with delivery issues
   - Bid strategy recommendations

### Next Steps
- Immediate actions to take (pause/adjust specific campaigns)
- Testing recommendations (A/B tests to run)
- Monitoring checklist (what to watch over next 7 days)

## Important Guidelines
- Focus on actionable insights, not just data dumps
- Prioritize recommendations by impact (high ROAS campaigns first)
- Be specific with numbers (e.g., "Increase Campaign X budget from $50 to $100/day")
- Look for patterns across multiple data points
- Consider the campaign objective when evaluating performance (awareness vs conversion campaigns have different success metrics)
- If data is missing or unavailable, note it in the report

## Metrics Glossary
- **ROAS**: Return on Ad Spend (revenue / spend). Higher is better. 2.0 = $2 revenue per $1 spent.
- **CPA**: Cost Per Acquisition (spend / conversions). Lower is better.
- **CTR**: Click-Through Rate (clicks / impressions). Higher is better. >1% is typically good.
- **Frequency**: How many times average user sees ads. >3 may indicate ad fatigue.
- **Conversion Rate**: conversions / clicks. Higher is better.`,
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
