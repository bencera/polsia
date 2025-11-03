#!/usr/bin/env node

/**
 * Custom Slack MCP Server
 * Uses Slack bot token (xoxb-) via Slack Web API
 * Built for Polsia to work with OAuth bot tokens
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { SlackAPIClient } = require('./slack-api-service.js');

// Get bot token from command line argument
const botToken = process.argv.find(arg => arg.startsWith('--bot-token='))?.split('=')[1];

if (!botToken) {
    console.error('Error: --bot-token argument is required');
    process.exit(1);
}

// Initialize Slack API client
const slackClient = new SlackAPIClient(botToken);

// Create MCP server
const server = new Server(
    {
        name: 'slack-custom',
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
                name: 'auth_test',
                description: 'Test Slack authentication and get workspace info',
                inputSchema: {
                    type: 'object',
                    properties: {},
                    required: []
                }
            },
            {
                name: 'list_channels',
                description: 'List all channels in the workspace. Returns public channels, private channels (if bot is member), and DMs.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        types: {
                            type: 'string',
                            description: 'Comma-separated channel types: public_channel, private_channel, im (DMs), mpim (group DMs)',
                            default: 'public_channel,private_channel'
                        },
                        limit: {
                            type: 'number',
                            description: 'Maximum number of channels to return (1-1000)',
                            default: 100
                        },
                        cursor: {
                            type: 'string',
                            description: 'Pagination cursor from previous response'
                        }
                    }
                }
            },
            {
                name: 'get_channel_history',
                description: 'Get message history from a channel. Returns recent messages with timestamps, user IDs, and text content.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        channel_id: {
                            type: 'string',
                            description: 'Channel ID (e.g., C1234567890)'
                        },
                        limit: {
                            type: 'number',
                            description: 'Number of messages to fetch (1-1000)',
                            default: 100
                        },
                        oldest: {
                            type: 'string',
                            description: 'Oldest timestamp to fetch from (Unix timestamp)'
                        },
                        latest: {
                            type: 'string',
                            description: 'Latest timestamp to fetch from (Unix timestamp)'
                        },
                        cursor: {
                            type: 'string',
                            description: 'Pagination cursor'
                        }
                    },
                    required: ['channel_id']
                }
            },
            {
                name: 'get_thread_replies',
                description: 'Get all replies in a thread',
                inputSchema: {
                    type: 'object',
                    properties: {
                        channel_id: {
                            type: 'string',
                            description: 'Channel ID containing the thread'
                        },
                        thread_ts: {
                            type: 'string',
                            description: 'Timestamp of the parent message'
                        },
                        limit: {
                            type: 'number',
                            description: 'Number of replies to fetch',
                            default: 100
                        }
                    },
                    required: ['channel_id', 'thread_ts']
                }
            },
            {
                name: 'search_messages',
                description: 'Search for messages across the workspace using Slack search query syntax',
                inputSchema: {
                    type: 'object',
                    properties: {
                        query: {
                            type: 'string',
                            description: 'Search query (e.g., "project update", "from:@user", "in:#channel")'
                        },
                        limit: {
                            type: 'number',
                            description: 'Number of results to return (1-100)',
                            default: 20
                        },
                        sort: {
                            type: 'string',
                            description: 'Sort by: timestamp or score',
                            default: 'timestamp'
                        }
                    },
                    required: ['query']
                }
            },
            {
                name: 'list_users',
                description: 'List all users in the workspace',
                inputSchema: {
                    type: 'object',
                    properties: {
                        limit: {
                            type: 'number',
                            description: 'Number of users to return',
                            default: 100
                        },
                        cursor: {
                            type: 'string',
                            description: 'Pagination cursor'
                        }
                    }
                }
            },
            {
                name: 'get_user_info',
                description: 'Get detailed information about a specific user',
                inputSchema: {
                    type: 'object',
                    properties: {
                        user_id: {
                            type: 'string',
                            description: 'User ID (e.g., U1234567890)'
                        }
                    },
                    required: ['user_id']
                }
            },
            {
                name: 'post_message',
                description: 'Post a message to a channel or thread',
                inputSchema: {
                    type: 'object',
                    properties: {
                        channel_id: {
                            type: 'string',
                            description: 'Channel ID to post to'
                        },
                        text: {
                            type: 'string',
                            description: 'Message text (supports markdown)'
                        },
                        thread_ts: {
                            type: 'string',
                            description: 'Optional: Thread timestamp to reply in thread'
                        }
                    },
                    required: ['channel_id', 'text']
                }
            },
            {
                name: 'get_team_info',
                description: 'Get information about the workspace/team',
                inputSchema: {
                    type: 'object',
                    properties: {},
                    required: []
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
            case 'auth_test': {
                const auth = await slackClient.authTest();
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(auth, null, 2)
                    }]
                };
            }

            case 'list_channels': {
                const { types = 'public_channel,private_channel', limit = 100, cursor } = args;
                const channels = await slackClient.listConversations(types, limit, cursor);
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(channels, null, 2)
                    }]
                };
            }

            case 'get_channel_history': {
                const { channel_id, limit = 100, oldest, latest, cursor } = args;
                const options = { limit };
                if (oldest) options.oldest = oldest;
                if (latest) options.latest = latest;
                if (cursor) options.cursor = cursor;

                const history = await slackClient.getConversationHistory(channel_id, options);
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(history, null, 2)
                    }]
                };
            }

            case 'get_thread_replies': {
                const { channel_id, thread_ts, limit = 100 } = args;
                const replies = await slackClient.getThreadReplies(channel_id, thread_ts, limit);
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(replies, null, 2)
                    }]
                };
            }

            case 'search_messages': {
                const { query, limit = 20, sort = 'timestamp' } = args;
                const results = await slackClient.searchMessages(query, { limit, sort });
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(results, null, 2)
                    }]
                };
            }

            case 'list_users': {
                const { limit = 100, cursor } = args;
                const users = await slackClient.listUsers(limit, cursor);
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(users, null, 2)
                    }]
                };
            }

            case 'get_user_info': {
                const { user_id } = args;
                const user = await slackClient.getUserInfo(user_id);
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(user, null, 2)
                    }]
                };
            }

            case 'post_message': {
                const { channel_id, text, thread_ts } = args;
                const options = {};
                if (thread_ts) options.thread_ts = thread_ts;

                const result = await slackClient.postMessage(channel_id, text, options);
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(result, null, 2)
                    }]
                };
            }

            case 'get_team_info': {
                const team = await slackClient.getTeamInfo();
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(team, null, 2)
                    }]
                };
            }

            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    } catch (error) {
        console.error(`[Slack MCP] Error executing ${name}:`, error.message);
        return {
            content: [{
                type: 'text',
                text: `Error: ${error.message}`
            }],
            isError: true
        };
    }
});

// Start the server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('[Slack MCP] Server running on stdio');
}

main().catch((error) => {
    console.error('[Slack MCP] Fatal error:', error);
    process.exit(1);
});
