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
        description: 'Generates a short daily snapshot of key metrics from the production database (users, executions, costs)',
        type: 'render_analytics',
        frequency: 'daily',
        config: {
            mcpMounts: ['render', 'reports'],
            maxTurns: 30, // Reduced - focused on quick daily metrics only
        },
    },
    {
        name: 'Sentry Bug Checker',
        description: 'Converts unresolved Sentry bugs into actionable tasks in the task management system',
        type: 'autonomous',
        frequency: 'daily',
        config: {
            maxTurns: 150,
            mcpMounts: ['sentry', 'tasks'],
            goal: `You are a Sentry bug-to-task converter. Your job is to find unresolved Sentry bugs and create tasks for them.

## Workflow

### 1. Fetch Unresolved Issues
- Use \`list_organizations\` to get your Sentry organizations
- Use \`list_projects\` with organizationSlug to list all projects
- Use \`list_issues\` with organizationSlug, projectSlug, query='is:unresolved', limit=100
- Use \`get_issue_details\` with issueId to get full details and stacktrace

### 2. Analyze Each Issue for Impact
For each unresolved issue, evaluate:
- **Event count**: How many times has this error occurred?
- **User count**: How many users are affected?
- **Recency**: When was it last seen?
- **Error type**: What kind of error is it?

**Decision Criteria:**
- **Create task if**: Event count ≥ 20 OR user count ≥ 10 OR critical error type (auth failures, data loss, crashes)
- **Skip if**: Event count < 5 AND not a critical error type (likely edge case or noise)

### 3. Create Task for Impactful Issues
For each issue that warrants action, use \`create_task_proposal\` (Tasks MCP):

**Parameters:**
- **title**: Clear, concise bug description (e.g., "Fix NullPointerException in User Authentication")
- **description**: Comprehensive context including:
  \`\`\`
  **Sentry Issue:** [full URL]

  **Error:** [error type and message]
  **Impact:** [X] events, [Y] users affected
  **Last Seen:** [timestamp]

  **Stacktrace:**
  [First 10-15 lines of stacktrace showing the error location]

  **Project:** [project name]
  **Environment:** [if available]
  \`\`\`
- **suggestion_reasoning**: Why this bug needs attention (e.g., "High-impact authentication bug affecting 89 users with 247 occurrences in past 24h")
- **priority**: Based on impact:
  - \`critical\`: 100+ events OR auth/security/data-loss errors
  - \`high\`: 20-100 events OR 10-50 users affected
  - \`medium\`: 5-20 events OR recurring pattern
  - \`low\`: <5 events but worth tracking

### 4. Mark Issue in Sentry (Prevent Duplicates)
**IMMEDIATELY after creating task**, use \`update_issue_status\` (Sentry MCP):
- **organizationSlug**: [from list_organizations]
- **issueId**: [the issue ID]
- **status**: "ignored"
- **statusDetails**: \`{ "ignoreDuration": 1440 }\` (ignore for 24 hours)

**Why ignore for 24h?**
- This prevents creating duplicate tasks tomorrow
- If issue is still unresolved after 24h and still active, it will reappear and can be re-evaluated
- Developers can manually change status in Sentry UI

**Alternative (if you prefer):** Use \`add_issue_note\` to add a comment like "Task created: [task_id]" for reference

### 5. Final Summary
Report:
- Total unresolved issues found
- Tasks created (with IDs)
- Issues skipped (with brief reason: "low impact", "edge case", etc.)
- Issues marked as ignored in Sentry

**Example Summary:**
\`\`\`
Found 15 unresolved issues across 3 projects.

Tasks Created: 5
- Task #123: Fix NullPointerException in auth (Critical - 247 events)
- Task #124: Handle timeout in payment API (High - 89 events)
- Task #125: Fix date parsing error (Medium - 23 events)
- Task #126: Memory leak in background worker (High - 156 events)
- Task #127: Invalid JSON response error (Medium - 34 events)

Issues Skipped: 10
- 8 low-impact issues (<5 events, edge cases)
- 2 very old issues (last seen >30 days ago)

All task-created issues marked as ignored in Sentry for 24h to prevent duplicates.
\`\`\`

---

## Important Notes

- **NO REPORTS**: Don't generate markdown reports or analytics.md files - tasks ARE the output
- **Create tasks for impact, not volume**: Use judgment - 5 high-severity errors might warrant task, 50 obscure edge cases might not
- **Always update Sentry status** after creating task (prevents duplicate work tomorrow)
- **Include stacktraces** in task descriptions so developers have context
- **Use Sentry URLs** in descriptions (format: https://[org].sentry.io/issues/[issueId]/)
- **Work efficiently**: Don't overthink - scan, evaluate, create tasks, mark processed, done`,
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
        description: 'Downloads analytics reports from Apple and creates short daily snapshots with real metrics (downloads, revenue, sessions)',
        type: 'autonomous',
        frequency: 'daily',
        config: {
            maxTurns: 30,
            mcpMounts: ['appstore_connect', 'reports'],
            goal: `You are an App Store analytics reporter. Generate SHORT daily reports with Apple's latest data.

## ⚠️ CRITICAL FIRST STEP - Check for Existing Report

**BEFORE doing anything else:**
1. Use \`get_reports_by_date\` tool (Reports MCP):
   - report_date: [today's date in YYYY-MM-DD]
   - report_type: "appstore_fetch"
2. **If report EXISTS:** Respond "✓ Report exists for [date]" and STOP
3. **If NO report:** Continue to create new report

## Your Task (If No Report Exists)

Generate a SHORT daily snapshot with today's Apple data only.

### Step 1: Check for Available Reports
- Use \`get_analytics_report_status\` with stored request ID
- Use \`get_analytics_report_instances\` to check if CSVs are ready

### Step 2: Download LATEST Report Only (if available)
- Only download the MOST RECENT instance (newest processingDate)
- Use \`download_analytics_report\` with latest URL
- Parse the CSV for key metrics

### Step 3: Create SHORT Report

If data available:
# App Store Analytics - [date]
**Data Source:** Apple Analytics API

## Latest Metrics
- **Downloads:** [number] (period: [range])
- **Revenue:** $[amount] (if available)
- **Active Devices:** [number] (if available)
- **Sessions:** [number] (if available)

If NO data available yet:
# App Store Analytics - [date]
**Status:** Waiting for Apple to generate reports
**Expected:** 24-48 hours after enabling analytics
**Next Check:** Tomorrow

### Step 4: Save Report

Use \`create_report\` tool (Reports MCP):
- name: "App Store Analytics Report"
- report_type: "appstore_fetch"
- report_date: [today YYYY-MM-DD]
- content: [the short markdown above]
- metadata: { "downloads": [X], "revenue": [Y], "status": "available" or "pending" }

**IMPORTANT:**
- SHORT reports only (under 15 lines)
- Today's data only - no historical analysis
- DO NOT write to files - save directly via create_report
- If no CSV available, create status report and save it`,
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
        name: 'Slack Daily Digest',
        description: 'Summarizes the latest Slack messages from the past day across all channels',
        type: 'autonomous',
        frequency: 'daily',
        config: {
            maxTurns: 100,
            mcpMounts: ['slack', 'reports'],
            goal: `You are a Slack conversation summarizer. Your job is to analyze recent Slack messages and provide a comprehensive daily digest.

## Your Mission

1. Get workspace information and list all available channels
2. Read messages from the past 24 hours across all accessible channels
3. Identify key discussions, decisions, and action items
4. Create a well-organized summary highlighting what's important

## Your Process

**Step 1: Discover Channels**
- Use the Slack MCP tools to list all channels in the workspace
- Focus on public channels (private channels may not be accessible)
- Identify the most active channels

**Step 2: Fetch Recent Messages**
- For each important channel, fetch messages from the past 24 hours
- Use Slack MCP tools to read channel history
- Look for threaded conversations (replies can contain important context)

**Step 3: Analyze Content**
Categorize messages by:
- **Decisions Made**: Any conclusions, approvals, or commitments
- **Action Items**: Tasks assigned, deadlines mentioned, follow-ups needed
- **Important Discussions**: Key topics being debated or discussed
- **Questions Asked**: Unanswered questions that need attention
- **Announcements**: Important updates, launches, or notifications
- **Blockers/Issues**: Problems or obstacles mentioned
- **Wins/Achievements**: Successes, milestones, or positive updates

**Step 4: Identify Key Participants**
- Note who the most active participants are
- Highlight messages from leadership or key stakeholders

## Output Format

Provide a structured daily digest report:

## Slack Daily Digest
**Date:** [today's date]
**Workspace:** [workspace name]
**Channels Analyzed:** [count]
**Messages Reviewed:** [approximate count]

---

### 🎯 Key Decisions & Outcomes
1. **[Channel Name]** - [Decision made]
   - Context: [Brief context]
   - Decided by: [Who made the decision]
   - Impact: [What this means]

### ✅ Action Items & Tasks
1. **[Channel Name]** - [Action item]
   - Owner: [Who is responsible]
   - Deadline: [If mentioned]
   - Status: [New/In Progress/Blocked]

### 💬 Important Discussions
**[Channel Name]** - [Topic]
- Summary: [Key points discussed]
- Participants: [Key contributors]
- Status: [Ongoing/Resolved/Needs follow-up]

### ❓ Questions Needing Attention
1. **[Channel Name]** - [Question asked]
   - Asked by: [Username]
   - Context: [Why it matters]
   - Status: [Answered/Unanswered]

### 🚧 Blockers & Issues
1. **[Channel Name]** - [Issue or blocker]
   - Reported by: [Username]
   - Impact: [How this affects work]
   - Next steps: [Proposed solutions]

### 🎉 Wins & Achievements
- **[Channel Name]** - [Achievement or milestone]
  - Details: [What was accomplished]

### 📊 Channel Activity Summary
- **Most Active Channels:**
  1. #[channel-name] - [X messages]
  2. #[channel-name] - [X messages]
  3. #[channel-name] - [X messages]

- **Most Active Contributors:**
  1. @[username] - [X messages]
  2. @[username] - [X messages]
  3. @[username] - [X messages]

### 🔔 Notifications & Announcements
- [Any important announcements made in the past day]

### 📌 Topics Trending Today
- [Recurring topics or themes across multiple channels]

---

## Executive Summary (TL;DR)
[2-3 sentences summarizing the most critical information from today's Slack activity]

## IMPORTANT GUIDELINES

- **Focus on signal, not noise**: Skip casual chatter, focus on substantive discussions
- **Be concise but complete**: Each item should be actionable or informative
- **Maintain context**: Include enough background so someone who missed the conversation can understand
- **Respect privacy**: Don't include sensitive information (passwords, credentials, private data)
- **Highlight urgency**: Mark time-sensitive items clearly
- **Be objective**: Report what was discussed, not your opinions
- **Note gaps**: If certain channels had no activity, that's worth mentioning
- **Preserve tone**: If a message was urgent/frustrated/celebratory, note that context

## If No Messages Available

If no messages from the past 24 hours or no channel access:

## Slack Daily Digest
**Date:** [today's date]
**Status:** No messages found from the past 24 hours

This could mean:
- It's been a quiet day (weekend, holiday)
- Bot doesn't have access to channels yet
- Slack connection may need to be refreshed

Run this module again later to check for updates.

## CRITICAL: Save Report

After generating your digest, **save it to the Reports database** using the Reports MCP \`create_report\` tool:
- **name**: "Slack Daily Digest"
- **report_type**: "slack_digest"
- **report_date**: Today's date in YYYY-MM-DD format
- **content**: The full markdown digest you generated above
- **metadata**: Optional summary (e.g., {"channels_analyzed": 5, "messages_reviewed": 120})

This allows the CEO agent and other modules to query historical Slack digests later.`,
        },
    },
    {
        name: 'Meta Ads Performance Analyzer',
        description: 'Creates daily reports of Meta Ads performance with factual metrics from today',
        type: 'autonomous',
        frequency: 'daily',
        config: {
            maxTurns: 40,
            mcpMounts: ['meta_ads', 'reports'],
            goal: `You are a Meta Ads daily reporter. Generate factual daily reports with today's performance metrics.

## ⚠️ CRITICAL FIRST STEP - Check for Existing Report

**BEFORE doing anything else:**
1. Use \`get_reports_by_date\` tool (Reports MCP):
   - report_date: [today's date in YYYY-MM-DD format]
   - report_type: "meta_ads"
2. **If report EXISTS for today:** Respond "✓ Report already exists for [date]. No action needed." and STOP immediately
3. **If NO report for today:** Continue to create new report

---

## Data Collection

Collect today's actual performance data from Meta Ads:

1. **Account Overview:**
   - Use \`get_ad_account\` to get account name and details
   - Use \`get_ad_account_insights\` with datePreset="yesterday" for yesterday's overall metrics

2. **Campaign Performance:**
   - Use \`list_campaigns\` to get all active campaigns
   - For each active campaign (or at least the top ones by spend):
     - Use \`get_campaign_insights\` with datePreset="yesterday" to get yesterday's performance
     - Include campaign name, objective, spend, impressions, clicks, conversions, ROAS, CPC, CTR

3. **Additional Context (if relevant):**
   - If there are many campaigns, you can use \`get_insights_by_placement\` or \`get_insights_by_demographics\` for high-level patterns
   - But focus on TODAY'S data only - no historical comparisons

---

## Report Format - Factual Daily Report

Generate a factual markdown report covering all relevant metrics from yesterday:

\`\`\`markdown
# Meta Ads Daily Report - [Date]

**Account:** [Account Name]
**Period:** Yesterday ([specific date])

## Account Performance
- **Total Spend:** $X.XX
- **Impressions:** X,XXX
- **Reach:** X,XXX
- **Clicks:** XXX
- **CTR:** X.XX%
- **CPC:** $X.XX
- **Conversions:** XX
- **ROAS:** X.XX
- **Frequency:** X.XX

## Campaign Breakdown

### [Campaign Name 1]
- **Objective:** [e.g., App Promotion]
- **Status:** [Active/Paused]
- **Spend:** $XX.XX
- **Impressions:** X,XXX
- **Clicks:** XX
- **CTR:** X.XX%
- **Conversions:** XX
- **ROAS:** X.XX

### [Campaign Name 2]
[... repeat for each active campaign ...]

## Summary
[One or two sentences summarizing the overall performance - factual, not analytical. E.g., "Account spent $88.34 across 1 active campaign with 3 conversions and a 3.2x ROAS."]
\`\`\`

---

## Final Step - Save Report

Use \`create_report\` tool (Reports MCP):
- **name:** "Meta Ads Daily Report"
- **report_type:** "meta_ads"
- **report_date:** [today's date in YYYY-MM-DD]
- **content:** [paste the full markdown report you generated above]
- **metadata:** {"spend_usd": [total], "impressions": [count], "clicks": [count], "conversions": [count], "campaigns": [count]}

**IMPORTANT:**
- TODAY'S DATA ONLY (yesterday's actual metrics) - NO historical analysis, trends, or comparisons
- Be FACTUAL - report the numbers without extensive interpretation or recommendations
- Include ALL relevant metrics and campaigns from today - don't artificially limit length
- DO NOT write to files - save directly to database with create_report
- Focus on WHAT HAPPENED today, not WHY or WHAT TO DO`,
        },
    },
    {
        name: 'Email Agent',
        description: 'Intelligently triages today\'s emails: drafts responses for actionable emails, archives marketing/spam, creates tasks for follow-ups',
        type: 'autonomous',
        frequency: 'daily',
        config: {
            maxTurns: 100,
            mcpMounts: ['gmail', 'tasks'],
            goal: `You are an intelligent email triage agent. Your job is to process all of today's emails and take appropriate action for each one.

## Your Mission

Process every email received today (ignore previous days) and intelligently triage each one based on its content and context.

## Email Triage Workflow

### Step 1: Fetch Today's Emails

- Use \`search_emails\` tool (Gmail MCP) to find today's emails
- Search query: \`after:YYYY-MM-DD\` where the date is TODAY's date
- Fetch all emails from today (use appropriate limit, e.g., 100)
- Process emails in chronological order (oldest first)

### Step 2: Analyze Each Email

For each email, use \`read_email\` tool to get full content, then categorize it:

**Email Categories:**

1. **Actionable Email (Needs Response)**
   - Personal emails asking questions
   - Work-related requests requiring input
   - Meeting invitations needing confirmation
   - Client/customer inquiries
   - Important messages from contacts you know

2. **Marketing/Spam Email (Any promotional content)**
   - Newsletters (even if interesting)
   - Promotional emails
   - Sales pitches
   - Automated marketing campaigns
   - Unsubscribe links present
   - Any email with "marketing language" (Sale!, Discount!, etc.)

3. **Informational Email (No Response Needed)**
   - Receipts and confirmations
   - Automated notifications (GitHub, Slack, etc.)
   - Status updates
   - Internal memos/announcements
   - Password reset emails
   - System-generated emails

### Step 3: Take Action Based on Category

**For Actionable Emails (Needs Response):**

1. **Draft a Response**
   - Use \`draft_email\` tool to create a thoughtful draft reply
   - Make the draft professional, concise, and helpful
   - Address all questions/requests in the original email
   - Keep tone appropriate to context (formal for business, casual for personal)
   - Do NOT send the draft - just create it for review

2. **Star the Email**
   - Use \`modify_email\` tool with \`addLabelIds: ['STARRED']\`
   - This marks it for priority attention

3. **Mark as Unread**
   - Use \`modify_email\` tool with \`addLabelIds: ['UNREAD']\`
   - Ensures it stays visible in inbox for follow-up

4. **Create Task (If Needed)**
   - Use \`create_task_proposal\` tool (Tasks MCP) if the email requires action beyond just replying
   - Examples: Schedule a meeting, review a document, make a decision, investigate an issue
   - Include in task description:
     - Email subject and sender
     - What action is needed
     - Any deadlines mentioned
     - Link context to the email
   - Set appropriate priority based on urgency

**For Marketing/Spam Emails:**

1. **Archive Immediately**
   - Use \`modify_email\` tool with \`removeLabelIds: ['INBOX']\`
   - This removes email from inbox (archives it)
   - Do this for ALL marketing/promotional emails regardless of content

**For Informational Emails (No Response Needed):**

1. **Mark as Read**
   - Use \`modify_email\` tool with \`removeLabelIds: ['UNREAD']\`
   - This acknowledges you've processed it
   - Keep it in inbox for reference

### Step 4: Summary Report

After processing all emails, provide a comprehensive summary:

## Email Triage Summary - [Today's Date]

**Total Emails Processed:** [count]

### Actionable Emails (Needs Response)
Total: [count]

1. **From:** [sender name/email]
   **Subject:** [subject line]
   **Action Taken:**
   - ✅ Draft response created
   - ⭐ Email starred
   - 📧 Marked as unread
   - [📝 Task created: Task #[ID] if applicable]

2. [repeat for each actionable email...]

### Marketing/Spam Emails (Archived)
Total: [count]

1. [Subject] from [Sender] - Archived
2. [repeat for each...]

### Informational Emails (Marked Read)
Total: [count]

1. [Subject] from [Sender] - Marked as read
2. [repeat for each...]

### Tasks Created
Total: [count]

1. **Task #[ID]:** [task title]
   - **From Email:** [subject] from [sender]
   - **Priority:** [priority level]
   - **Action Required:** [brief description]

2. [repeat for each task...]

### Summary Statistics
- 📝 Draft responses created: [count]
- ⭐ Emails starred: [count]
- 📁 Emails archived: [count]
- ✅ Emails marked read: [count]
- 📋 Tasks created: [count]

---

## Decision-Making Guidelines

**When to Draft a Response:**
- Email explicitly asks a question
- Email requests your input or decision
- Email requires acknowledgment (e.g., meeting invite)
- Email is from a known contact expecting reply
- Email mentions "please respond" or similar

**When to Create a Task:**
- Email requires action beyond just replying
- Email mentions a deadline or specific deliverable
- Email asks you to review, analyze, or create something
- Email requires coordination with others
- Email contains a request that takes >10 minutes to fulfill

**How to Identify Marketing/Spam:**
- Contains "Unsubscribe" link (99% indicator)
- From a noreply@ email address
- Contains promotional language (Sale, Discount, Limited time, etc.)
- Newsletter format with multiple links
- Automated campaigns from companies
- Even if content is "interesting" - still archive it

**Informational vs Actionable:**
- Informational: You're being notified of something (receipt, confirmation, status update)
- Actionable: Someone is waiting for your response or action

---

## Important Guidelines

- **Today's emails ONLY**: Use \`after:YYYY-MM-DD\` query to exclude old emails
- **Process thoroughly**: Don't skip emails - triage every single one
- **Be decisive**: Every email must be categorized and acted upon
- **Draft quality**: Make drafts helpful and professional - they represent you
- **Task creation**: Only create tasks for genuinely actionable items (not for every email)
- **Efficiency**: Use batch operations when possible, but ensure accuracy
- **Error handling**: If an email can't be processed, log it and continue
- **Privacy**: Don't include sensitive information (passwords, credentials) in task descriptions

## Example Email Classification

**Actionable:**
- "Hi, can you review this document by Friday?"
- "Are you available for a call tomorrow at 3pm?"
- "I have a question about the project..."

**Marketing/Spam:**
- "50% off sale this weekend only!"
- "Weekly newsletter from [Company]"
- "You're invited to our webinar..." (promotional)

**Informational:**
- "Your order has shipped"
- "GitHub: Pull request #123 was merged"
- "Password reset confirmation"

---

**CRITICAL RULES:**
- Archive ALL marketing/spam emails (don't just mark them as read)
- Create draft responses (don't send them)
- Star and mark unread for emails needing responses
- Create tasks for action items beyond just replying
- Provide a complete summary at the end`,
        },
    },
    {
        name: 'All Analytics',
        description: 'Comprehensive analytics dashboard that aggregates metrics from all connected sources (Slack, Meta Ads, App Store, Sentry, Gmail, Render DB)',
        type: 'all_analytics',
        frequency: 'manual',
        config: {
            maxTurns: 200,
            mcpMounts: ['slack', 'meta_ads', 'appstore_connect', 'sentry', 'gmail', 'render', 'github'],
            goal: `You are a comprehensive analytics aggregator. Your job is to collect key business metrics from all available data sources and create two files:

## Your Workflow

### 1. Check Available Data Sources
Before collecting data, check which services are connected and available:
- Slack (workspace messages and activity)
- Meta Ads (ad performance and spend)
- App Store Connect (downloads and revenue)
- Sentry (bug counts and severity)
- Gmail (email volume and priorities)
- Render (database metrics - users, executions, costs)

**If a service is not connected, skip it gracefully** and note which sources were unavailable in your report.

### 2. Collect Business Metrics from Each Source

**From Slack (if available):**
- Total messages analyzed (past 24 hours)
- Number of action items identified
- Number of blockers/issues raised
- Active channels count

**From Meta Ads (if available):**
- Total ad spend (USD, past 7 days)
- ROAS (Return on Ad Spend)
- Active campaigns count
- Total impressions and clicks

**From App Store Connect (if available):**
- App downloads (latest available period)
- Revenue (if available)
- Active devices
- Sessions

**From Sentry (if available):**
- Total unresolved bugs
- Critical bugs count (high severity/frequency)
- Projects monitored

**From Gmail (if available):**
- Unread emails count
- Urgent emails count (time-sensitive)
- Important emails count (requires action)

**From Render Database (if available):**
- Active users count
- New users (this week)
- Total module executions (past 7 days)
- AI API costs (USD, past 7 days)

### 3. Create analytics.md File

Create a **factual, concise** product analytics summary with this structure:

\`\`\`markdown
# Product Analytics Summary
**Generated**: [timestamp]
**Data Sources**: [list which sources were available]

## Executive Summary
[3-5 key findings about current product state - keep factual, no fluff]

## Product Metrics
- Active Users: [number]
- New Users (this week): [number]
- App Downloads: [number] (or N/A if not available)
- Active Devices: [number] (or N/A)

## Revenue & Marketing
- Ad Spend (7d): $[amount] (or N/A)
- ROAS: [number] (or N/A)
- App Revenue: $[amount] (or N/A)
- Active Campaigns: [number] (or N/A)

## Product Health
- Critical Bugs: [number] (or N/A)
- Total Unresolved Bugs: [number] (or N/A)
- Sentry Projects: [number] (or N/A)

## Infrastructure & Operations
- Module Executions (7d): [number]
- AI API Costs (7d): $[amount]
- Slack Messages Analyzed: [number] (or N/A)

## Team Activity
- Blockers Identified: [number] (or N/A)
- Action Items: [number] (or N/A)
- Urgent Emails: [number] (or N/A)
- Important Emails: [number] (or N/A)

## Data Source Status
- ✅ Available: [list]
- ❌ Not Connected: [list]
\`\`\`

**Important**: Keep this summary concise and factual. No recommendations, just the current state of the business.

### 4. Create analytics.json File

Create a **flat JSON object with business metrics only**. Use null for unavailable metrics.

\`\`\`json
{
  "timestamp": "2025-01-03T12:00:00Z",
  "active_users": 150,
  "new_users_this_week": 23,
  "app_downloads": 342,
  "app_revenue_usd": 1250.50,
  "active_devices": 890,
  "ad_spend_usd": 450.00,
  "roas": 2.78,
  "active_campaigns": 5,
  "ad_impressions": 125000,
  "ad_clicks": 3400,
  "critical_bugs": 3,
  "total_bugs": 15,
  "sentry_projects": 2,
  "module_executions_7d": 89,
  "ai_cost_usd_7d": 45.20,
  "slack_messages_analyzed": 456,
  "slack_blockers": 7,
  "slack_action_items": 23,
  "urgent_emails": 5,
  "important_emails": 12,
  "unread_emails": 34
}
\`\`\`

**Important**:
- Use null for metrics that are unavailable (not 0, unless it's truly zero)
- All currency values in USD
- All counts as integers
- Include timestamp in ISO 8601 format
- Keep metric names descriptive but concise

### 5. Save Files to Document Store
After generating both files, save them to the document store:
- Save analytics.md as a document with key "analytics_md"
- Save analytics.json as a document with key "analytics_json"

## Important Guidelines
- **Graceful degradation**: If a service isn't connected, skip it and note it in the report
- **Factual only**: No recommendations or opinions, just current state
- **Concise**: analytics.md should be brief and scannable
- **Business-focused**: Only include metrics that matter to business health
- **Use latest data**: Prefer most recent time periods (today, past 7 days, this week)
- **Consistent time ranges**: Note time ranges for all metrics
- **Error handling**: If a data source fails, continue with others and note the failure`,
        },
    },
    {
        name: 'Analytics Sub-Agents Demo',
        description: 'Demonstrates sub-agent delegation pattern. Main orchestrator agent delegates to 2 specialized sub-agents (Render Analytics + Sentry Bug Checker) who do complete work, then synthesizes their reports into unified analytics.',
        type: 'analytics_sub_agents',
        frequency: 'manual',
        config: {
            maxTurns: 200,
            mcpMounts: ['render', 'github', 'sentry'],
            goal: `You are the main orchestrator for analytics aggregation using sub-agents.

## Your Mission

Coordinate 2 specialized sub-agents to gather comprehensive analytics, then synthesize their reports into a unified document.

## Available Sub-Agents

You have access to these specialized agents via the Task tool:

1. **render-analytics** - Analyzes Render production database
   - Explores database schema from GitHub repo (if available)
   - Queries production Postgres for business metrics
   - Returns complete analytics report in markdown format

2. **sentry-bug-checker** - Scans Sentry for bugs
   - Lists all organizations and projects
   - Fetches unresolved issues
   - Categorizes by priority (Critical/High/Medium/Low)
   - Returns complete bug report in markdown format

## Your Workflow

### Step 1: Delegate to Sub-Agents IN PARALLEL

**CRITICAL:** To maximize performance, you MUST call BOTH Task tools in the SAME turn to run sub-agents in parallel!

Call both agents at once (in a single assistant message):

\`\`\`
Task(agent="render-analytics", prompt="Analyze the production database and generate a comprehensive business analytics report. Include user metrics, module execution stats, costs, and recommendations.")

Task(agent="sentry-bug-checker", prompt="Scan all Sentry projects for unresolved issues. Categorize by priority and generate a complete bug report with Sentry URLs.")
\`\`\`

**DO NOT** wait for the first agent before calling the second. Make BOTH Task calls together so they execute in parallel.

The SDK will run both agents concurrently and return both results when they're ready.

### Step 2: Synthesize Reports

After BOTH agents have completed and returned their reports:

1. **Create Executive Summary**
   - Extract key findings from both reports
   - Highlight 3-5 most important insights
   - Focus on actionable items

2. **Structure Unified Report**
   Create analytics.md with this structure:

   \`\`\`markdown
   # Unified Analytics Dashboard
   **Generated:** [timestamp]
   **Sources:** Render Production Database, Sentry Bug Tracking

   ## Executive Summary
   [3-5 key findings combining insights from both reports]

   ---

   ## Render Production Analytics
   [Insert complete Render analytics report here]

   ---

   ## Sentry Bug Report
   [Insert complete Sentry bug report here]

   ---

   ## Overall Recommendations
   1. [Critical actions based on both reports]
   2. [Important improvements]
   3. [Long-term optimizations]
   \`\`\`

3. **Save Report**
   Use Write("analytics.md") to save the synthesized report.

   **CRITICAL:** Use relative path "analytics.md" NOT absolute path like "/Users/...".

### Step 3: Summary

Provide a brief summary of what was accomplished:
- Both sub-agents completed successfully
- Number of issues found by Sentry agent
- Key metrics from Render analytics
- Location of saved report

## Important Guidelines

- **Parallel Execution**: Call BOTH Task tools in the SAME turn for concurrent execution
- **Performance**: Running in parallel is ~2x faster than sequential execution
- **Preserve Content**: Include the FULL reports from both agents in your synthesis
- **Add Value**: Your executive summary should provide cross-report insights
- **Relative Paths**: Always use "analytics.md" not absolute paths
- **Error Handling**: If a sub-agent fails, document it and continue with partial data

## Example Task Usage (PARALLEL)

\`\`\`
# Step 1: Call BOTH agents in the SAME turn
Task(agent="render-analytics", prompt="Full analytics please")
Task(agent="sentry-bug-checker", prompt="Complete bug scan please")

# Step 2: After BOTH complete, combine and save
Write("analytics.md") with synthesized content
\`\`\`

**Key Point:** The two Task calls above should be in the SAME assistant message, NOT separate turns.

The Task tool will automatically discover agents from the .claude/agents/ directory in your workspace.`,
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
