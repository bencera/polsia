#!/usr/bin/env node

/**
 * Custom App Store Connect MCP Server
 * MCP server for Apple's App Store Connect API using JWT authentication
 * Provides tools for TestFlight, app management, analytics, and releases
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { AppStoreConnectClient } = require('./appstore-connect-service.js');

// Get credentials from command line arguments
const keyId = process.argv.find(arg => arg.startsWith('--key-id='))?.split('=')[1];
const issuerId = process.argv.find(arg => arg.startsWith('--issuer-id='))?.split('=')[1];
const privateKeyArg = process.argv.find(arg => arg.startsWith('--private-key='));

if (!keyId || !issuerId || !privateKeyArg) {
    console.error('Error: --key-id, --issuer-id, and --private-key arguments are required');
    process.exit(1);
}

// Extract private key (handle base64 encoding if needed)
const privateKey = privateKeyArg.split('=').slice(1).join('='); // Handle = in key

// Initialize App Store Connect API client
const appStoreClient = new AppStoreConnectClient(keyId, issuerId, privateKey);

// Create MCP server
const server = new Server(
    {
        name: 'appstore-connect-custom',
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
            // ========== APP MANAGEMENT ==========
            {
                name: 'list_apps',
                description: 'List all apps in your App Store Connect account',
                inputSchema: {
                    type: 'object',
                    properties: {
                        limit: {
                            type: 'number',
                            description: 'Maximum number of apps to return (default: 20, max: 200)',
                            default: 20
                        }
                    },
                    required: []
                }
            },
            {
                name: 'get_app_details',
                description: 'Get detailed information about a specific app',
                inputSchema: {
                    type: 'object',
                    properties: {
                        appId: {
                            type: 'string',
                            description: 'The app ID'
                        }
                    },
                    required: ['appId']
                }
            },
            {
                name: 'list_app_versions',
                description: 'List all versions for a specific app',
                inputSchema: {
                    type: 'object',
                    properties: {
                        appId: {
                            type: 'string',
                            description: 'The app ID'
                        },
                        limit: {
                            type: 'number',
                            description: 'Maximum number of versions to return (default: 20)',
                            default: 20
                        }
                    },
                    required: ['appId']
                }
            },
            {
                name: 'update_app_metadata',
                description: 'Update app metadata like description, keywords, promotional text, etc.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        versionId: {
                            type: 'string',
                            description: 'The app version ID to update'
                        },
                        description: {
                            type: 'string',
                            description: 'App description (optional)'
                        },
                        keywords: {
                            type: 'string',
                            description: 'App keywords (optional)'
                        },
                        promotionalText: {
                            type: 'string',
                            description: 'Promotional text (optional)'
                        },
                        whatsNew: {
                            type: 'string',
                            description: "What's new in this version (optional)"
                        }
                    },
                    required: ['versionId']
                }
            },
            {
                name: 'submit_for_review',
                description: 'Submit an app version for App Store review',
                inputSchema: {
                    type: 'object',
                    properties: {
                        versionId: {
                            type: 'string',
                            description: 'The app version ID to submit'
                        }
                    },
                    required: ['versionId']
                }
            },

            // ========== TESTFLIGHT ==========
            {
                name: 'list_builds',
                description: 'List builds available in TestFlight',
                inputSchema: {
                    type: 'object',
                    properties: {
                        appId: {
                            type: 'string',
                            description: 'Filter builds by app ID (optional)'
                        },
                        limit: {
                            type: 'number',
                            description: 'Maximum number of builds to return (default: 20)',
                            default: 20
                        }
                    },
                    required: []
                }
            },
            {
                name: 'get_build_details',
                description: 'Get detailed information about a specific build',
                inputSchema: {
                    type: 'object',
                    properties: {
                        buildId: {
                            type: 'string',
                            description: 'The build ID'
                        }
                    },
                    required: ['buildId']
                }
            },
            {
                name: 'list_beta_testers',
                description: 'List beta testers in TestFlight',
                inputSchema: {
                    type: 'object',
                    properties: {
                        appId: {
                            type: 'string',
                            description: 'Filter testers by app ID (optional)'
                        },
                        limit: {
                            type: 'number',
                            description: 'Maximum number of testers to return (default: 20)',
                            default: 20
                        }
                    },
                    required: []
                }
            },
            {
                name: 'add_beta_tester',
                description: 'Add a new beta tester to TestFlight',
                inputSchema: {
                    type: 'object',
                    properties: {
                        email: {
                            type: 'string',
                            description: 'Tester email address'
                        },
                        firstName: {
                            type: 'string',
                            description: 'Tester first name'
                        },
                        lastName: {
                            type: 'string',
                            description: 'Tester last name'
                        },
                        betaGroupIds: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Beta group IDs to add the tester to (optional)',
                            default: []
                        }
                    },
                    required: ['email', 'firstName', 'lastName']
                }
            },
            {
                name: 'remove_beta_tester',
                description: 'Remove a beta tester from TestFlight',
                inputSchema: {
                    type: 'object',
                    properties: {
                        testerId: {
                            type: 'string',
                            description: 'The beta tester ID to remove'
                        }
                    },
                    required: ['testerId']
                }
            },
            {
                name: 'list_beta_groups',
                description: 'List beta testing groups',
                inputSchema: {
                    type: 'object',
                    properties: {
                        appId: {
                            type: 'string',
                            description: 'Filter groups by app ID (optional)'
                        },
                        limit: {
                            type: 'number',
                            description: 'Maximum number of groups to return (default: 20)',
                            default: 20
                        }
                    },
                    required: []
                }
            },

            // ========== ANALYTICS & REVIEWS ==========
            {
                name: 'get_app_analytics',
                description: 'Get analytics metrics for an app (downloads, sessions, crashes, etc.)',
                inputSchema: {
                    type: 'object',
                    properties: {
                        appId: {
                            type: 'string',
                            description: 'The app ID'
                        }
                    },
                    required: ['appId']
                }
            },
            {
                name: 'list_customer_reviews',
                description: 'List customer reviews from the App Store',
                inputSchema: {
                    type: 'object',
                    properties: {
                        appId: {
                            type: 'string',
                            description: 'The app ID'
                        },
                        limit: {
                            type: 'number',
                            description: 'Maximum number of reviews to return (default: 20)',
                            default: 20
                        },
                        sort: {
                            type: 'string',
                            description: 'Sort order (e.g., "-createdDate" for newest first)',
                            default: '-createdDate'
                        }
                    },
                    required: ['appId']
                }
            },
            {
                name: 'respond_to_review',
                description: 'Respond to a customer review on the App Store',
                inputSchema: {
                    type: 'object',
                    properties: {
                        reviewId: {
                            type: 'string',
                            description: 'The review ID to respond to'
                        },
                        responseText: {
                            type: 'string',
                            description: 'Your response to the review'
                        }
                    },
                    required: ['reviewId', 'responseText']
                }
            },

            // ========== PRICING & RELEASES ==========
            {
                name: 'get_app_pricing',
                description: 'Get pricing information for an app',
                inputSchema: {
                    type: 'object',
                    properties: {
                        appId: {
                            type: 'string',
                            description: 'The app ID'
                        }
                    },
                    required: ['appId']
                }
            },
            {
                name: 'configure_phased_release',
                description: 'Configure phased release for an app version (gradual rollout)',
                inputSchema: {
                    type: 'object',
                    properties: {
                        versionId: {
                            type: 'string',
                            description: 'The app version ID'
                        },
                        state: {
                            type: 'number',
                            description: 'Release state: 0=inactive, 1=active, 2=paused, 3=complete',
                            enum: [0, 1, 2, 3]
                        }
                    },
                    required: ['versionId', 'state']
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
            // ========== APP MANAGEMENT ==========
            case 'list_apps': {
                const apps = await appStoreClient.listApps({
                    limit: args.limit || 20
                });
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(apps, null, 2)
                    }]
                };
            }

            case 'get_app_details': {
                const app = await appStoreClient.getAppInfo(args.appId);
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(app, null, 2)
                    }]
                };
            }

            case 'list_app_versions': {
                const versions = await appStoreClient.listAppVersions(args.appId, {
                    limit: args.limit || 20
                });
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(versions, null, 2)
                    }]
                };
            }

            case 'update_app_metadata': {
                const metadata = {};
                if (args.description) metadata.description = args.description;
                if (args.keywords) metadata.keywords = args.keywords;
                if (args.promotionalText) metadata.promotionalText = args.promotionalText;
                if (args.whatsNew) metadata.whatsNew = args.whatsNew;

                const updated = await appStoreClient.updateAppMetadata(args.versionId, metadata);
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(updated, null, 2)
                    }]
                };
            }

            case 'submit_for_review': {
                const submission = await appStoreClient.submitForReview(args.versionId);
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(submission, null, 2)
                    }]
                };
            }

            // ========== TESTFLIGHT ==========
            case 'list_builds': {
                const builds = await appStoreClient.listBuilds({
                    appId: args.appId,
                    limit: args.limit || 20
                });
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(builds, null, 2)
                    }]
                };
            }

            case 'get_build_details': {
                const build = await appStoreClient.getBuildInfo(args.buildId);
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(build, null, 2)
                    }]
                };
            }

            case 'list_beta_testers': {
                const testers = await appStoreClient.listBetaTesters({
                    appId: args.appId,
                    limit: args.limit || 20
                });
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(testers, null, 2)
                    }]
                };
            }

            case 'add_beta_tester': {
                const tester = await appStoreClient.addBetaTester({
                    email: args.email,
                    firstName: args.firstName,
                    lastName: args.lastName
                }, args.betaGroupIds || []);
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(tester, null, 2)
                    }]
                };
            }

            case 'remove_beta_tester': {
                const success = await appStoreClient.removeBetaTester(args.testerId);
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({ success, message: 'Beta tester removed successfully' }, null, 2)
                    }]
                };
            }

            case 'list_beta_groups': {
                const groups = await appStoreClient.listBetaGroups({
                    appId: args.appId,
                    limit: args.limit || 20
                });
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(groups, null, 2)
                    }]
                };
            }

            // ========== ANALYTICS & REVIEWS ==========
            case 'get_app_analytics': {
                const analytics = await appStoreClient.getAppMetrics(args.appId);
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(analytics, null, 2)
                    }]
                };
            }

            case 'list_customer_reviews': {
                const reviews = await appStoreClient.listCustomerReviews(args.appId, {
                    limit: args.limit || 20,
                    sort: args.sort || '-createdDate'
                });
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(reviews, null, 2)
                    }]
                };
            }

            case 'respond_to_review': {
                const response = await appStoreClient.respondToReview(args.reviewId, args.responseText);
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(response, null, 2)
                    }]
                };
            }

            // ========== PRICING & RELEASES ==========
            case 'get_app_pricing': {
                const pricing = await appStoreClient.getAppPricing(args.appId);
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(pricing, null, 2)
                    }]
                };
            }

            case 'configure_phased_release': {
                const config = await appStoreClient.configurePhasedRelease(args.versionId, args.state);
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(config, null, 2)
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
    console.error('Custom App Store Connect MCP server running on stdio');
}

main().catch((error) => {
    console.error('Server error:', error);
    process.exit(1);
});
