#!/usr/bin/env node

/**
 * Custom Capabilities MCP Server
 * Exposes system capabilities to agents - available modules, their tools, and MCP servers
 * Used by Brain CEO to understand what agents can do before making decisions
 * Built for Polsia's agent orchestration system
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { getModulesByUserId, getModuleById, getAgentsByUserId, getAgentById } = require('../db.js');

// Get user ID from command line argument
const userIdArg = process.argv.find(arg => arg.startsWith('--user-id='));
if (!userIdArg) {
    console.error('Error: --user-id argument is required');
    process.exit(1);
}

const userId = parseInt(userIdArg.split('=')[1]);
if (isNaN(userId)) {
    console.error('Error: --user-id must be a valid integer');
    process.exit(1);
}

console.error(`[Capabilities MCP] Initialized for user ${userId}`);

// Available MCP server types and their capabilities
const MCP_SERVER_CATALOG = {
    github: {
        name: 'GitHub',
        description: 'Source code management - read/write repositories, create branches, commits, PRs, search code',
        requires_oauth: true,
        tools: ['read_file', 'write_file', 'create_branch', 'create_commit', 'create_pr', 'search_code', 'list_files']
    },
    gmail: {
        name: 'Gmail',
        description: 'Email management - read emails, send messages, archive/label',
        requires_oauth: true,
        tools: ['read_emails', 'send_email', 'archive_email', 'label_email', 'search_emails']
    },
    slack: {
        name: 'Slack',
        description: 'Team communication - send messages, read channels, post to threads',
        requires_oauth: true,
        tools: ['post_message', 'read_channel', 'reply_to_thread', 'list_channels']
    },
    sentry: {
        name: 'Sentry',
        description: 'Error tracking - query errors, resolve issues, get stacktraces',
        requires_oauth: true,
        tools: ['list_issues', 'get_issue_details', 'resolve_issue', 'query_errors']
    },
    appstore_connect: {
        name: 'App Store Connect',
        description: 'iOS app analytics - download reports, query metrics, app performance',
        requires_oauth: true,
        tools: ['download_analytics_report', 'get_app_metrics', 'list_apps']
    },
    meta_ads: {
        name: 'Meta Ads',
        description: 'Facebook/Instagram advertising - manage campaigns, query metrics, create ads',
        requires_oauth: true,
        tools: ['get_campaigns', 'get_campaign_insights', 'create_campaign', 'update_campaign']
    },
    render: {
        name: 'Render',
        description: 'Cloud infrastructure - manage services, databases, deployments, metrics',
        requires_oauth: true,
        tools: ['list_services', 'get_service', 'deploy_service', 'get_metrics', 'list_databases']
    },
    tasks: {
        name: 'Task Management',
        description: 'Task workflow management - create, approve, start, complete tasks',
        requires_oauth: false,
        tools: ['create_task_proposal', 'get_available_tasks', 'approve_task', 'reject_task', 'start_task', 'complete_task', 'block_task', 'fail_task']
    },
    reports: {
        name: 'Reports',
        description: 'Business reporting - save and query daily analytics reports',
        requires_oauth: false,
        tools: ['create_report', 'query_reports', 'get_reports_by_date']
    },
    capabilities: {
        name: 'Capabilities',
        description: 'System introspection - query available modules, tools, and MCP servers',
        requires_oauth: false,
        tools: ['list_available_modules', 'get_module_capabilities', 'list_mcp_servers']
    }
};

// Create MCP server
const server = new Server(
    {
        name: 'capabilities',
        version: '1.0.0'
    },
    {
        capabilities: {
            tools: {}
        }
    }
);

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: 'list_available_modules',
                description: 'List all available modules/agents in the system with their basic information. Use this to see what agents exist and what they can do.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        enabled_only: {
                            type: 'boolean',
                            description: 'If true, only return enabled modules (default: false)',
                            default: false
                        }
                    },
                    required: []
                }
            },
            {
                name: 'get_module_capabilities',
                description: 'Get detailed capabilities of a specific module including its configuration, MCP mounts, tools, and execution settings.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        module_id: {
                            type: 'number',
                            description: 'ID of the module to get capabilities for'
                        }
                    },
                    required: ['module_id']
                }
            },
            {
                name: 'list_mcp_servers',
                description: 'List all available MCP server types and their capabilities. Use this to understand what tools are available through different MCP servers.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        filter_by_oauth: {
                            type: 'boolean',
                            description: 'If true, only show MCP servers that require OAuth (default: false)'
                        }
                    },
                    required: []
                }
            },
            {
                name: 'list_available_agents',
                description: 'List all available task-driven agents in the system. Agents are specialized workers that execute specific tasks. Use this to see what agents exist and their capabilities.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        active_only: {
                            type: 'boolean',
                            description: 'If true, only return active agents (default: false)',
                            default: false
                        },
                        agent_type: {
                            type: 'string',
                            description: 'Filter by agent type (e.g., "engineer", "social_media", "meta_ads")'
                        }
                    },
                    required: []
                }
            },
            {
                name: 'get_agent_capabilities',
                description: 'Get detailed capabilities of a specific agent including its role, MCP mounts, tools, and configuration.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        agent_id: {
                            type: 'number',
                            description: 'ID of the agent to get capabilities for'
                        }
                    },
                    required: ['agent_id']
                }
            }
        ]
    };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        switch (name) {
            case 'list_available_modules': {
                const { enabled_only = false } = args;

                const modules = await getModulesByUserId(userId);

                // Filter by enabled status if requested
                const filteredModules = enabled_only
                    ? modules.filter(m => m.enabled)
                    : modules;

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            count: filteredModules.length,
                            modules: filteredModules.map(m => ({
                                id: m.id,
                                name: m.name,
                                description: m.description,
                                type: m.type,
                                frequency: m.frequency,
                                enabled: m.enabled,
                                mcp_mounts: m.config?.mcpMounts || [],
                                last_run: m.last_run_at,
                                created_at: m.created_at
                            }))
                        }, null, 2)
                    }]
                };
            }

            case 'get_module_capabilities': {
                const { module_id } = args;

                const module = await getModuleById(module_id, userId);

                if (!module) {
                    throw new Error(`Module ${module_id} not found`);
                }

                // Parse config to extract capabilities
                const config = module.config || {};
                const mcpMounts = config.mcpMounts || [];

                // Build list of available tools based on MCP mounts
                const availableTools = [];
                const mcpServers = [];

                for (const mount of mcpMounts) {
                    const serverInfo = MCP_SERVER_CATALOG[mount];
                    if (serverInfo) {
                        mcpServers.push({
                            mount,
                            name: serverInfo.name,
                            description: serverInfo.description,
                            requires_oauth: serverInfo.requires_oauth,
                            tools: serverInfo.tools
                        });
                        availableTools.push(...serverInfo.tools);
                    }
                }

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            module: {
                                id: module.id,
                                name: module.name,
                                description: module.description,
                                type: module.type,
                                frequency: module.frequency,
                                enabled: module.enabled,
                                config: {
                                    goal: config.goal,
                                    maxTurns: config.maxTurns,
                                    mcpMounts,
                                    mcpConfig: config.mcpConfig,
                                    inputs: config.inputs
                                },
                                mcp_servers: mcpServers,
                                available_tools: [...new Set(availableTools)], // dedupe
                                last_run: module.last_run_at,
                                total_executions: module.total_executions || 0
                            }
                        }, null, 2)
                    }]
                };
            }

            case 'list_mcp_servers': {
                const { filter_by_oauth = false } = args;

                const servers = Object.entries(MCP_SERVER_CATALOG)
                    .filter(([key, info]) => !filter_by_oauth || info.requires_oauth)
                    .map(([key, info]) => ({
                        mount_name: key,
                        name: info.name,
                        description: info.description,
                        requires_oauth: info.requires_oauth,
                        tools: info.tools,
                        tool_count: info.tools.length
                    }));

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            count: servers.length,
                            mcp_servers: servers
                        }, null, 2)
                    }]
                };
            }

            case 'list_available_agents': {
                const { active_only = false, agent_type } = args;

                const agents = await getAgentsByUserId(userId);

                // Filter by status and type if requested
                let filteredAgents = active_only
                    ? agents.filter(a => a.status === 'active')
                    : agents;

                if (agent_type) {
                    filteredAgents = filteredAgents.filter(a => a.agent_type === agent_type);
                }

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            count: filteredAgents.length,
                            agents: filteredAgents.map(a => ({
                                id: a.id,
                                name: a.name,
                                description: a.description,
                                agent_type: a.agent_type,
                                status: a.status,
                                mcp_mounts: a.config?.mcpMounts || [],
                                created_at: a.created_at
                            }))
                        }, null, 2)
                    }]
                };
            }

            case 'get_agent_capabilities': {
                const { agent_id } = args;

                const agent = await getAgentById(agent_id, userId);

                if (!agent) {
                    throw new Error(`Agent ${agent_id} not found`);
                }

                // Parse config to extract capabilities
                const config = agent.config || {};
                const mcpMounts = config.mcpMounts || [];

                // Build list of available tools based on MCP mounts
                const availableTools = [];
                const mcpServers = [];

                for (const mount of mcpMounts) {
                    const serverInfo = MCP_SERVER_CATALOG[mount];
                    if (serverInfo) {
                        mcpServers.push({
                            mount,
                            name: serverInfo.name,
                            description: serverInfo.description,
                            requires_oauth: serverInfo.requires_oauth,
                            tools: serverInfo.tools
                        });
                        availableTools.push(...serverInfo.tools);
                    }
                }

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            agent: {
                                id: agent.id,
                                name: agent.name,
                                description: agent.description,
                                agent_type: agent.agent_type,
                                role: agent.role,
                                status: agent.status,
                                config: {
                                    maxTurns: config.maxTurns,
                                    mcpMounts,
                                    mcpConfig: config.mcpConfig
                                },
                                mcp_servers: mcpServers,
                                available_tools: [...new Set(availableTools)], // dedupe
                                created_at: agent.created_at
                            }
                        }, null, 2)
                    }]
                };
            }

            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    } catch (error) {
        console.error(`[Capabilities MCP] Error executing ${name}:`, error.message);
        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    success: false,
                    error: error.message,
                    tool: name
                }, null, 2)
            }],
            isError: true
        };
    }
});

// Start the server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('[Capabilities MCP] Server running on stdio');
}

main().catch((error) => {
    console.error('[Capabilities MCP] Fatal error:', error);
    process.exit(1);
});
