#!/usr/bin/env node

/**
 * Custom Sentry MCP Server
 * A reliable, simple MCP server for Sentry using direct REST API calls
 * No OpenAI required, no schema bugs
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { SentryAPIClient } = require('./sentry-api-service.js');

// Security: Get access token from environment variable instead of command-line args
// Command-line args are visible in process listings (ps, pstree)
const accessToken = process.env.SENTRY_ACCESS_TOKEN;

if (!accessToken) {
    console.error('Error: SENTRY_ACCESS_TOKEN environment variable is required');
    process.exit(1);
}

// Initialize Sentry API client
const sentryClient = new SentryAPIClient(accessToken);

// Create MCP server
const server = new Server(
    {
        name: 'sentry-custom',
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
                name: 'whoami',
                description: 'Get information about the authenticated Sentry user',
                inputSchema: {
                    type: 'object',
                    properties: {},
                    required: []
                }
            },
            {
                name: 'list_organizations',
                description: 'List all Sentry organizations the user has access to',
                inputSchema: {
                    type: 'object',
                    properties: {},
                    required: []
                }
            },
            {
                name: 'list_projects',
                description: 'List all projects in a Sentry organization',
                inputSchema: {
                    type: 'object',
                    properties: {
                        organizationSlug: {
                            type: 'string',
                            description: 'The organization slug (e.g., "my-org")'
                        }
                    },
                    required: ['organizationSlug']
                }
            },
            {
                name: 'list_issues',
                description: 'List issues in a Sentry project. Can filter by status, priority, etc.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        organizationSlug: {
                            type: 'string',
                            description: 'The organization slug'
                        },
                        projectSlug: {
                            type: 'string',
                            description: 'The project slug'
                        },
                        query: {
                            type: 'string',
                            description: 'Sentry query filter (e.g., "is:unresolved", "is:unresolved level:error")',
                            default: 'is:unresolved'
                        },
                        limit: {
                            type: 'number',
                            description: 'Maximum number of issues to return',
                            default: 100
                        }
                    },
                    required: ['organizationSlug', 'projectSlug']
                }
            },
            {
                name: 'get_issue_details',
                description: 'Get detailed information about a specific issue, including the latest event and stacktrace',
                inputSchema: {
                    type: 'object',
                    properties: {
                        issueId: {
                            type: 'string',
                            description: 'The Sentry issue ID'
                        }
                    },
                    required: ['issueId']
                }
            },
            {
                name: 'update_issue_status',
                description: 'Update the status of a Sentry issue (e.g., mark as resolved, ignored, etc.). Use this to prevent re-processing issues.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        organizationSlug: {
                            type: 'string',
                            description: 'The organization slug'
                        },
                        issueId: {
                            type: 'string',
                            description: 'The Sentry issue ID'
                        },
                        status: {
                            type: 'string',
                            enum: ['resolved', 'unresolved', 'ignored', 'resolvedInNextRelease'],
                            description: 'New status for the issue'
                        },
                        statusDetails: {
                            type: 'object',
                            description: 'Additional status context (optional)',
                            properties: {
                                inRelease: {
                                    type: 'string',
                                    description: 'Release version (for resolved status)'
                                },
                                ignoreDuration: {
                                    type: 'number',
                                    description: 'Minutes to ignore issue (for ignored status)'
                                },
                                ignoreCount: {
                                    type: 'number',
                                    description: 'Ignore until N occurrences'
                                },
                                ignoreUserCount: {
                                    type: 'number',
                                    description: 'Ignore until N users affected'
                                }
                            }
                        }
                    },
                    required: ['organizationSlug', 'issueId', 'status']
                }
            },
            {
                name: 'assign_issue',
                description: 'Assign a Sentry issue to a user or team',
                inputSchema: {
                    type: 'object',
                    properties: {
                        organizationSlug: {
                            type: 'string',
                            description: 'The organization slug'
                        },
                        issueId: {
                            type: 'string',
                            description: 'The Sentry issue ID'
                        },
                        assignedTo: {
                            type: 'string',
                            description: 'Email address or actor ID to assign to'
                        }
                    },
                    required: ['organizationSlug', 'issueId', 'assignedTo']
                }
            },
            {
                name: 'add_issue_note',
                description: 'Add a comment/note to a Sentry issue for documentation purposes',
                inputSchema: {
                    type: 'object',
                    properties: {
                        issueId: {
                            type: 'string',
                            description: 'The Sentry issue ID'
                        },
                        comment: {
                            type: 'string',
                            description: 'The comment text to add'
                        }
                    },
                    required: ['issueId', 'comment']
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
            case 'whoami': {
                const user = await sentryClient.whoami();
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(user, null, 2)
                    }]
                };
            }

            case 'list_organizations': {
                const orgs = await sentryClient.listOrganizations();
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(orgs, null, 2)
                    }]
                };
            }

            case 'list_projects': {
                const { organizationSlug } = args;
                const projects = await sentryClient.listProjects(organizationSlug);
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(projects, null, 2)
                    }]
                };
            }

            case 'list_issues': {
                const { organizationSlug, projectSlug, query, limit } = args;
                const issues = await sentryClient.listIssues(organizationSlug, projectSlug, {
                    query: query || 'is:unresolved',
                    limit: limit || 100
                });
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(issues, null, 2)
                    }]
                };
            }

            case 'get_issue_details': {
                const { issueId } = args;

                // Get issue metadata
                const issue = await sentryClient.getIssue(issueId);

                // Get latest event with stacktrace
                const latestEvent = await sentryClient.getLatestEvent(issueId);

                const result = {
                    issue,
                    latestEvent
                };

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(result, null, 2)
                    }]
                };
            }

            case 'update_issue_status': {
                const { organizationSlug, issueId, status, statusDetails } = args;

                const updates = { status };
                if (statusDetails) {
                    updates.statusDetails = statusDetails;
                }

                const result = await sentryClient.updateIssue(organizationSlug, issueId, updates);

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            message: `Issue ${issueId} status updated to: ${status}`,
                            result
                        }, null, 2)
                    }]
                };
            }

            case 'assign_issue': {
                const { organizationSlug, issueId, assignedTo } = args;

                const updates = { assignedTo };
                const result = await sentryClient.updateIssue(organizationSlug, issueId, updates);

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            message: `Issue ${issueId} assigned to: ${assignedTo}`,
                            result
                        }, null, 2)
                    }]
                };
            }

            case 'add_issue_note': {
                const { issueId, comment } = args;

                const result = await sentryClient.addIssueNote(issueId, comment);

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            message: `Note added to issue ${issueId}`,
                            result
                        }, null, 2)
                    }]
                };
            }

            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    } catch (error) {
        return {
            content: [{
                type: 'text',
                text: `Error: ${error.message}\n\nStack: ${error.stack}`
            }],
            isError: true
        };
    }
});

// Start server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Custom Sentry MCP server running on stdio');
}

main().catch((error) => {
    console.error('Server error:', error);
    process.exit(1);
});
