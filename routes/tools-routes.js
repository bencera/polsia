/**
 * Tools Routes
 * API endpoints for MCP server catalog and system tools
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// MCP Server catalog with all functions
const MCP_CATALOG = {
    github: {
        name: 'GitHub MCP',
        type: 'third-party',
        package: '@modelcontextprotocol/server-github',
        description: 'Source code management and repository operations',
        oauthRequired: true,
        oauthService: 'github',
        functions: [
            { name: 'create_or_update_file', description: 'Write files to repository', params: 'path, content, message, branch, sha' },
            { name: 'push_files', description: 'Push multiple file changes', params: 'files[], message, branch' },
            { name: 'create_pull_request', description: 'Create pull request', params: 'title, body, head, base' },
            { name: 'search_code', description: 'Search repository code', params: 'query, repo, owner' },
            { name: 'get_file_contents', description: 'Read files from repository', params: 'path, owner, repo, branch' },
            { name: 'create_branch', description: 'Create new branch', params: 'branch, from_branch' },
            { name: 'create_commit', description: 'Create commit', params: 'message, tree, parents' },
            { name: 'list_files', description: 'List repository files', params: 'path, owner, repo' }
        ]
    },
    gmail: {
        name: 'Gmail MCP',
        type: 'third-party',
        package: '@gongrzhe/server-gmail-autoauth-mcp',
        description: 'Email management and automation',
        oauthRequired: true,
        oauthService: 'gmail',
        functions: [
            { name: 'read_emails', description: 'Fetch emails with filters', params: 'maxResults, query, labelIds' },
            { name: 'send_email', description: 'Send email message', params: 'to, subject, body, cc, bcc' },
            { name: 'archive_email', description: 'Archive email message', params: 'messageId' },
            { name: 'label_email', description: 'Apply labels to email', params: 'messageId, labelIds' },
            { name: 'search_emails', description: 'Search inbox', params: 'query, maxResults' }
        ]
    },
    slack: {
        name: 'Slack MCP',
        type: 'custom',
        package: 'services/slack-custom-mcp-server.js',
        description: 'Team communication and workspace integration',
        oauthRequired: true,
        oauthService: 'slack',
        functions: [
            { name: 'auth_test', description: 'Test authentication and get workspace info', params: '' },
            { name: 'list_channels', description: 'List all channels', params: 'types, limit, cursor' },
            { name: 'get_channel_history', description: 'Get message history', params: 'channel_id, limit, oldest, latest' },
            { name: 'get_thread_replies', description: 'Get thread replies', params: 'channel_id, thread_ts, limit' },
            { name: 'search_messages', description: 'Search messages', params: 'query, limit, sort' },
            { name: 'list_users', description: 'List workspace users', params: 'limit, cursor' },
            { name: 'get_user_info', description: 'Get user information', params: 'user_id' },
            { name: 'post_message', description: 'Post message to channel', params: 'channel_id, text, thread_ts' },
            { name: 'get_team_info', description: 'Get workspace information', params: '' }
        ]
    },
    sentry: {
        name: 'Sentry MCP',
        type: 'custom',
        package: 'services/sentry-custom-mcp-server.js',
        description: 'Error tracking and issue management',
        oauthRequired: true,
        oauthService: 'sentry',
        functions: [
            { name: 'whoami', description: 'Get authenticated user info', params: '' },
            { name: 'list_organizations', description: 'List Sentry organizations', params: '' },
            { name: 'list_projects', description: 'List projects in organization', params: 'organizationSlug' },
            { name: 'list_issues', description: 'List issues with filters', params: 'organizationSlug, projectSlug, query, limit' },
            { name: 'get_issue_details', description: 'Get issue details and stacktrace', params: 'issueId' },
            { name: 'update_issue_status', description: 'Change issue status', params: 'organizationSlug, issueId, status' },
            { name: 'add_issue_note', description: 'Add comment to issue', params: 'issueId, comment' }
        ]
    },
    appstore_connect: {
        name: 'App Store Connect MCP',
        type: 'custom',
        package: 'services/appstore-connect-custom-mcp-server.js',
        description: 'iOS app analytics, TestFlight, and App Store operations',
        oauthRequired: true,
        oauthService: 'appstore_connect',
        functions: [
            { name: 'list_apps', description: 'List all apps', params: 'limit' },
            { name: 'get_app_details', description: 'Get app information', params: 'appId' },
            { name: 'list_app_versions', description: 'List app versions', params: 'appId' },
            { name: 'update_app_metadata', description: 'Update app description and keywords', params: 'versionId, description, keywords' },
            { name: 'submit_for_review', description: 'Submit version for review', params: 'versionId' },
            { name: 'list_builds', description: 'List TestFlight builds', params: 'appId, limit' },
            { name: 'get_build_details', description: 'Get build information', params: 'buildId' },
            { name: 'list_beta_testers', description: 'List beta testers', params: 'appId, limit' },
            { name: 'add_beta_tester', description: 'Add new beta tester', params: 'email, firstName, lastName, groupId' },
            { name: 'remove_beta_tester', description: 'Remove beta tester', params: 'testerId' },
            { name: 'list_beta_groups', description: 'List testing groups', params: 'appId' },
            { name: 'get_app_analytics', description: 'Get app metadata and versions', params: 'appId' },
            { name: 'list_customer_reviews', description: 'Get App Store reviews', params: 'appId, limit' },
            { name: 'respond_to_review', description: 'Reply to customer review', params: 'reviewId, responseBody' },
            { name: 'create_analytics_report_request', description: 'Request analytics report', params: 'appId, reportType' },
            { name: 'get_analytics_report_status', description: 'Check report status', params: 'requestId' },
            { name: 'get_analytics_report_instances', description: 'Get downloadable reports', params: 'requestId' },
            { name: 'download_analytics_report', description: 'Download and parse CSV report', params: 'reportUrl' },
            { name: 'get_app_pricing', description: 'Get pricing information', params: 'appId' },
            { name: 'configure_phased_release', description: 'Set gradual rollout', params: 'versionId, phasedRelease' }
        ]
    },
    meta_ads: {
        name: 'Meta Ads MCP',
        type: 'custom',
        package: 'services/meta-ads-custom-mcp-server.js',
        description: 'Facebook/Instagram advertising analytics and campaign management',
        oauthRequired: true,
        oauthService: 'meta',
        functions: [
            { name: 'get_ad_account', description: 'Get account details and balance', params: '' },
            { name: 'get_ad_account_insights', description: 'Account performance metrics', params: 'datePreset, timeRange, metrics' },
            { name: 'list_campaigns', description: 'List campaigns with filters', params: 'limit, status' },
            { name: 'get_campaign_details', description: 'Get campaign configuration', params: 'campaignId' },
            { name: 'get_campaign_insights', description: 'Campaign performance metrics', params: 'campaignId, datePreset, metrics' },
            { name: 'list_ad_sets', description: 'List ad sets by campaign', params: 'campaignId, limit' },
            { name: 'get_ad_set_details', description: 'Get targeting and optimization', params: 'adSetId' },
            { name: 'get_ad_set_insights', description: 'Ad set performance', params: 'adSetId, datePreset, metrics' },
            { name: 'list_ads', description: 'List ads by campaign/ad set', params: 'adSetId, limit' },
            { name: 'get_ad_details', description: 'Get ad details', params: 'adId' },
            { name: 'get_ad_creative', description: 'Get creative assets', params: 'adId' },
            { name: 'get_ad_insights', description: 'Ad performance', params: 'adId, datePreset, metrics' },
            { name: 'list_custom_audiences', description: 'List custom audiences', params: 'limit' },
            { name: 'list_saved_audiences', description: 'List saved targeting templates', params: 'limit' },
            { name: 'get_insights_by_demographics', description: 'Performance by age/gender', params: 'accountId, datePreset' },
            { name: 'get_insights_by_placement', description: 'Performance by platform', params: 'accountId, datePreset' },
            { name: 'get_insights_by_device', description: 'Performance by device type', params: 'accountId, datePreset' }
        ]
    },
    render: {
        name: 'Render MCP',
        type: 'http',
        package: 'https://mcp.render.com/mcp',
        description: 'Cloud infrastructure management for Render.com deployments',
        oauthRequired: true,
        oauthService: 'render',
        functions: [
            { name: 'list_services', description: 'List all services', params: 'includePreviews' },
            { name: 'get_service', description: 'Get service details', params: 'serviceId' },
            { name: 'list_deploys', description: 'List deployments', params: 'serviceId, limit' },
            { name: 'get_deploy', description: 'Get deployment details', params: 'serviceId, deployId' },
            { name: 'list_postgres_instances', description: 'List databases', params: '' },
            { name: 'get_postgres', description: 'Get database info', params: 'postgresId' },
            { name: 'query_render_postgres', description: 'Run SQL queries (read-only)', params: 'postgresId, sql' },
            { name: 'list_key_value', description: 'List Redis/KV stores', params: '' },
            { name: 'get_metrics', description: 'Get CPU, memory, HTTP metrics', params: 'resourceId, metricTypes, startTime, endTime' },
            { name: 'list_logs', description: 'Query service logs', params: 'resource, startTime, endTime, limit' },
            { name: 'list_workspaces', description: 'List workspaces/teams', params: '' },
            { name: 'create_web_service', description: 'Create new service', params: 'name, runtime, repo, buildCommand, startCommand' },
            { name: 'create_static_site', description: 'Create static site', params: 'name, repo, buildCommand, publishPath' },
            { name: 'create_postgres', description: 'Create database', params: 'name, plan' },
            { name: 'update_environment_variables', description: 'Update env vars', params: 'serviceId, envVars' }
        ]
    },
    tasks: {
        name: 'Task Management MCP',
        type: 'custom',
        package: 'services/task-management-mcp-server.js',
        description: 'Agent-driven task workflow (suggest → approve → execute → complete)',
        oauthRequired: false,
        oauthService: null,
        functions: [
            { name: 'create_task_proposal', description: 'Suggest new task', params: 'title, description, suggestion_reasoning, priority' },
            { name: 'get_available_tasks', description: 'Find tasks to work on', params: 'status, assigned_to_me, limit' },
            { name: 'get_task_details', description: 'Get full task info', params: 'task_id' },
            { name: 'start_task', description: 'Mark task as in_progress', params: 'task_id, agent_name' },
            { name: 'block_task', description: 'Pause task due to blocker', params: 'task_id, reason, use_status' },
            { name: 'resume_task', description: 'Resume blocked task', params: 'task_id, agent_name' },
            { name: 'complete_task', description: 'Finish task successfully', params: 'task_id, completion_summary' },
            { name: 'approve_task', description: 'Approve suggested task', params: 'task_id, approval_reasoning, assign_to_agent_id' },
            { name: 'reject_task', description: 'Reject suggested task', params: 'task_id, rejection_reasoning' }
        ]
    },
    reports: {
        name: 'Reports MCP',
        type: 'custom',
        package: 'services/reports-custom-mcp-server.js',
        description: 'Save and query business reports for persistent metrics and analytics',
        oauthRequired: false,
        oauthService: null,
        functions: [
            { name: 'create_report', description: 'Save new markdown report', params: 'name, report_type, report_date, content, metadata' },
            { name: 'query_reports', description: 'Query reports with filters', params: 'report_type, start_date, end_date, limit' },
            { name: 'get_reports_by_date', description: 'Get all reports for specific date', params: 'report_date, report_type' }
        ]
    },
    capabilities: {
        name: 'Capabilities MCP',
        type: 'custom',
        package: 'services/capabilities-custom-mcp-server.js',
        description: 'System introspection - discover available agents and MCP servers',
        oauthRequired: false,
        oauthService: null,
        functions: [
            { name: 'list_available_agents', description: 'List all task-driven agents', params: 'active_only, agent_type' },
            { name: 'get_agent_capabilities', description: 'Get agent details and tools', params: 'agent_id' },
            { name: 'list_mcp_servers', description: 'List all available MCP types', params: 'filter_by_oauth' }
        ]
    }
};

/**
 * GET /api/tools/mcp-servers
 * Get comprehensive MCP server catalog with OAuth status and agent usage
 */
router.get('/mcp-servers', async (req, res) => {
    try {
        const userId = req.user.id;

        // Get OAuth connection status
        const connectionsResult = await pool.query(
            'SELECT service_name FROM service_connections WHERE user_id = $1',
            [userId]
        );
        const connectedServices = new Set(connectionsResult.rows.map(r => r.service_name));

        // Get agents and their MCP mounts
        const agentsResult = await pool.query(
            'SELECT id, name, agent_type, config FROM agents WHERE user_id = $1 AND status = $2',
            [userId, 'active']
        );

        // Build MCP servers array with enriched data
        const mcpServers = Object.entries(MCP_CATALOG).map(([key, mcp]) => {
            // Find agents using this MCP
            const usedByAgents = agentsResult.rows
                .filter(agent => {
                    const config = agent.config || {};
                    const mcpMounts = config.mcpMounts || [];
                    return mcpMounts.includes(key);
                })
                .map(agent => ({
                    id: agent.id,
                    name: agent.name,
                    type: agent.agent_type
                }));

            return {
                key,
                ...mcp,
                totalFunctions: mcp.functions.length,
                oauthConnected: mcp.oauthRequired ? connectedServices.has(mcp.oauthService) : null,
                usedByAgents
            };
        });

        // Calculate summary statistics
        const summary = {
            totalMcps: mcpServers.length,
            thirdParty: mcpServers.filter(m => m.type === 'third-party').length,
            custom: mcpServers.filter(m => m.type === 'custom').length,
            http: mcpServers.filter(m => m.type === 'http').length,
            totalFunctions: mcpServers.reduce((sum, m) => sum + m.totalFunctions, 0),
            oauthRequired: mcpServers.filter(m => m.oauthRequired).length,
            oauthConnected: mcpServers.filter(m => m.oauthConnected === true).length
        };

        res.json({
            success: true,
            mcpServers,
            summary
        });

    } catch (error) {
        console.error('[Tools API] Error fetching MCP servers:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch MCP servers',
            error: error.message
        });
    }
});

module.exports = router;
