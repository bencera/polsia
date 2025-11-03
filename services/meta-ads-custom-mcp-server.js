#!/usr/bin/env node

/**
 * Custom Meta Ads MCP Server
 * MCP server for Meta (Facebook) Marketing API
 * Provides read-only tools for ad account analysis and insights
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { MetaMarketingAPIClient } = require('./meta-marketing-api-service.js');

// Get credentials from command line arguments
const accessToken = process.argv.find(arg => arg.startsWith('--access-token='))?.split('=')[1];
const adAccountId = process.argv.find(arg => arg.startsWith('--ad-account-id='))?.split('=')[1];

if (!accessToken || !adAccountId) {
    console.error('Error: --access-token and --ad-account-id arguments are required');
    process.exit(1);
}

// Initialize Meta Marketing API client
const metaClient = new MetaMarketingAPIClient(accessToken, adAccountId);

// Create MCP server
const server = new Server(
    {
        name: 'meta-ads-custom',
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
            // ========== AD ACCOUNT ==========
            {
                name: 'get_ad_account',
                description: 'Get ad account details including name, currency, status, balance, and spend information',
                inputSchema: {
                    type: 'object',
                    properties: {},
                    required: []
                }
            },
            {
                name: 'get_ad_account_insights',
                description: 'Get performance metrics for the entire ad account. Returns comprehensive insights including spend, impressions, clicks, conversions, ROAS, and efficiency metrics.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        datePreset: {
                            type: 'string',
                            description: 'Date range preset',
                            enum: ['today', 'yesterday', 'last_7d', 'last_14d', 'last_30d', 'this_month', 'last_month', 'lifetime'],
                            default: 'last_7d'
                        },
                        timeRange: {
                            type: 'string',
                            description: 'Custom time range as JSON string (e.g., \'{"since":"2024-01-01","until":"2024-01-31"}\'). Overrides datePreset if provided.'
                        },
                        metrics: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Specific metrics to fetch. Defaults to comprehensive set including ROAS, CPA, CTR, etc.'
                        }
                    },
                    required: []
                }
            },

            // ========== CAMPAIGNS ==========
            {
                name: 'list_campaigns',
                description: 'List all campaigns in the ad account with their status, budgets, and basic information',
                inputSchema: {
                    type: 'object',
                    properties: {
                        limit: {
                            type: 'number',
                            description: 'Maximum number of campaigns to return (default: 100, max: 500)',
                            default: 100
                        },
                        status: {
                            type: 'string',
                            description: 'Filter by status',
                            enum: ['ACTIVE', 'PAUSED', 'DELETED', 'ARCHIVED']
                        }
                    },
                    required: []
                }
            },
            {
                name: 'get_campaign_details',
                description: 'Get detailed information about a specific campaign including budget, objective, and bid strategy',
                inputSchema: {
                    type: 'object',
                    properties: {
                        campaignId: {
                            type: 'string',
                            description: 'The campaign ID'
                        }
                    },
                    required: ['campaignId']
                }
            },
            {
                name: 'get_campaign_insights',
                description: 'Get performance metrics for a specific campaign',
                inputSchema: {
                    type: 'object',
                    properties: {
                        campaignId: {
                            type: 'string',
                            description: 'The campaign ID'
                        },
                        datePreset: {
                            type: 'string',
                            description: 'Date range preset',
                            enum: ['today', 'yesterday', 'last_7d', 'last_14d', 'last_30d', 'this_month', 'last_month', 'lifetime'],
                            default: 'last_7d'
                        },
                        timeRange: {
                            type: 'string',
                            description: 'Custom time range as JSON string. Overrides datePreset if provided.'
                        }
                    },
                    required: ['campaignId']
                }
            },

            // ========== AD SETS ==========
            {
                name: 'list_ad_sets',
                description: 'List ad sets in the ad account. Can be filtered by campaign.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        campaignId: {
                            type: 'string',
                            description: 'Filter by campaign ID (optional)'
                        },
                        limit: {
                            type: 'number',
                            description: 'Maximum number of ad sets to return (default: 100)',
                            default: 100
                        },
                        status: {
                            type: 'string',
                            description: 'Filter by status',
                            enum: ['ACTIVE', 'PAUSED', 'DELETED', 'ARCHIVED']
                        }
                    },
                    required: []
                }
            },
            {
                name: 'get_ad_set_details',
                description: 'Get detailed information about a specific ad set including targeting, budget, and optimization settings',
                inputSchema: {
                    type: 'object',
                    properties: {
                        adSetId: {
                            type: 'string',
                            description: 'The ad set ID'
                        },
                        includeTargeting: {
                            type: 'boolean',
                            description: 'Include detailed targeting information (default: true)',
                            default: true
                        }
                    },
                    required: ['adSetId']
                }
            },
            {
                name: 'get_ad_set_insights',
                description: 'Get performance metrics for a specific ad set',
                inputSchema: {
                    type: 'object',
                    properties: {
                        adSetId: {
                            type: 'string',
                            description: 'The ad set ID'
                        },
                        datePreset: {
                            type: 'string',
                            description: 'Date range preset',
                            enum: ['today', 'yesterday', 'last_7d', 'last_14d', 'last_30d', 'this_month', 'last_month', 'lifetime'],
                            default: 'last_7d'
                        },
                        timeRange: {
                            type: 'string',
                            description: 'Custom time range as JSON string. Overrides datePreset if provided.'
                        }
                    },
                    required: ['adSetId']
                }
            },

            // ========== ADS ==========
            {
                name: 'list_ads',
                description: 'List ads in the ad account. Can be filtered by campaign or ad set.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        campaignId: {
                            type: 'string',
                            description: 'Filter by campaign ID (optional)'
                        },
                        adSetId: {
                            type: 'string',
                            description: 'Filter by ad set ID (optional)'
                        },
                        limit: {
                            type: 'number',
                            description: 'Maximum number of ads to return (default: 100)',
                            default: 100
                        },
                        status: {
                            type: 'string',
                            description: 'Filter by status',
                            enum: ['ACTIVE', 'PAUSED', 'DELETED', 'ARCHIVED']
                        }
                    },
                    required: []
                }
            },
            {
                name: 'get_ad_details',
                description: 'Get detailed information about a specific ad including creative details',
                inputSchema: {
                    type: 'object',
                    properties: {
                        adId: {
                            type: 'string',
                            description: 'The ad ID'
                        },
                        includeCreative: {
                            type: 'boolean',
                            description: 'Include creative details (default: true)',
                            default: true
                        }
                    },
                    required: ['adId']
                }
            },
            {
                name: 'get_ad_creative',
                description: 'Get creative details for an ad including images, videos, text, and call-to-action',
                inputSchema: {
                    type: 'object',
                    properties: {
                        creativeId: {
                            type: 'string',
                            description: 'The creative ID (obtained from get_ad_details)'
                        }
                    },
                    required: ['creativeId']
                }
            },
            {
                name: 'get_ad_insights',
                description: 'Get performance metrics for a specific ad',
                inputSchema: {
                    type: 'object',
                    properties: {
                        adId: {
                            type: 'string',
                            description: 'The ad ID'
                        },
                        datePreset: {
                            type: 'string',
                            description: 'Date range preset',
                            enum: ['today', 'yesterday', 'last_7d', 'last_14d', 'last_30d', 'this_month', 'last_month', 'lifetime'],
                            default: 'last_7d'
                        },
                        timeRange: {
                            type: 'string',
                            description: 'Custom time range as JSON string. Overrides datePreset if provided.'
                        }
                    },
                    required: ['adId']
                }
            },

            // ========== AUDIENCES ==========
            {
                name: 'list_custom_audiences',
                description: 'List custom audiences (lookalikes, custom lists, website traffic, etc.)',
                inputSchema: {
                    type: 'object',
                    properties: {
                        limit: {
                            type: 'number',
                            description: 'Maximum number of audiences to return (default: 100)',
                            default: 100
                        }
                    },
                    required: []
                }
            },
            {
                name: 'list_saved_audiences',
                description: 'List saved audiences (targeting templates)',
                inputSchema: {
                    type: 'object',
                    properties: {
                        limit: {
                            type: 'number',
                            description: 'Maximum number of audiences to return (default: 100)',
                            default: 100
                        }
                    },
                    required: []
                }
            },

            // ========== INSIGHTS & BREAKDOWNS ==========
            {
                name: 'get_insights_by_demographics',
                description: 'Get insights broken down by age and gender to understand audience performance',
                inputSchema: {
                    type: 'object',
                    properties: {
                        level: {
                            type: 'string',
                            description: 'Level of aggregation',
                            enum: ['account', 'campaign', 'adset', 'ad'],
                            default: 'account'
                        },
                        datePreset: {
                            type: 'string',
                            description: 'Date range preset',
                            enum: ['today', 'yesterday', 'last_7d', 'last_14d', 'last_30d', 'this_month', 'last_month'],
                            default: 'last_7d'
                        },
                        timeRange: {
                            type: 'string',
                            description: 'Custom time range as JSON string. Overrides datePreset if provided.'
                        }
                    },
                    required: []
                }
            },
            {
                name: 'get_insights_by_placement',
                description: 'Get insights broken down by placement (Facebook Feed, Instagram Stories, etc.)',
                inputSchema: {
                    type: 'object',
                    properties: {
                        level: {
                            type: 'string',
                            description: 'Level of aggregation',
                            enum: ['account', 'campaign', 'adset', 'ad'],
                            default: 'account'
                        },
                        datePreset: {
                            type: 'string',
                            description: 'Date range preset',
                            enum: ['today', 'yesterday', 'last_7d', 'last_14d', 'last_30d', 'this_month', 'last_month'],
                            default: 'last_7d'
                        },
                        timeRange: {
                            type: 'string',
                            description: 'Custom time range as JSON string. Overrides datePreset if provided.'
                        }
                    },
                    required: []
                }
            },
            {
                name: 'get_insights_by_device',
                description: 'Get insights broken down by device platform (mobile, desktop, etc.)',
                inputSchema: {
                    type: 'object',
                    properties: {
                        level: {
                            type: 'string',
                            description: 'Level of aggregation',
                            enum: ['account', 'campaign', 'adset', 'ad'],
                            default: 'account'
                        },
                        datePreset: {
                            type: 'string',
                            description: 'Date range preset',
                            enum: ['today', 'yesterday', 'last_7d', 'last_14d', 'last_30d', 'this_month', 'last_month'],
                            default: 'last_7d'
                        },
                        timeRange: {
                            type: 'string',
                            description: 'Custom time range as JSON string. Overrides datePreset if provided.'
                        }
                    },
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
            // ========== AD ACCOUNT ==========
            case 'get_ad_account': {
                const account = await metaClient.getAdAccount();
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(account, null, 2)
                    }]
                };
            }

            case 'get_ad_account_insights': {
                const options = {
                    datePreset: args.datePreset || 'last_7d'
                };
                if (args.timeRange) {
                    options.timeRange = args.timeRange;
                }
                if (args.metrics && Array.isArray(args.metrics)) {
                    options.fields = args.metrics;
                }

                const insights = await metaClient.getAdAccountInsights(options);
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(insights, null, 2)
                    }]
                };
            }

            // ========== CAMPAIGNS ==========
            case 'list_campaigns': {
                const options = {
                    limit: args.limit || 100
                };

                if (args.status) {
                    options.filtering = [{
                        field: 'effective_status',
                        operator: 'IN',
                        value: [args.status]
                    }];
                }

                const campaigns = await metaClient.listCampaigns(options);
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(campaigns, null, 2)
                    }]
                };
            }

            case 'get_campaign_details': {
                const campaign = await metaClient.getCampaign(args.campaignId);
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(campaign, null, 2)
                    }]
                };
            }

            case 'get_campaign_insights': {
                const options = {
                    datePreset: args.datePreset || 'last_7d'
                };
                if (args.timeRange) {
                    options.timeRange = args.timeRange;
                }

                const insights = await metaClient.getCampaignInsights(args.campaignId, options);
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(insights, null, 2)
                    }]
                };
            }

            // ========== AD SETS ==========
            case 'list_ad_sets': {
                const options = {
                    limit: args.limit || 100
                };

                if (args.campaignId) {
                    options.campaignId = args.campaignId;
                }

                if (args.status) {
                    options.filtering = [{
                        field: 'effective_status',
                        operator: 'IN',
                        value: [args.status]
                    }];
                }

                const adSets = await metaClient.listAdSets(options);
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(adSets, null, 2)
                    }]
                };
            }

            case 'get_ad_set_details': {
                const includeTargeting = args.includeTargeting !== false;
                const adSet = await metaClient.getAdSet(args.adSetId, includeTargeting);
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(adSet, null, 2)
                    }]
                };
            }

            case 'get_ad_set_insights': {
                const options = {
                    datePreset: args.datePreset || 'last_7d'
                };
                if (args.timeRange) {
                    options.timeRange = args.timeRange;
                }

                const insights = await metaClient.getAdSetInsights(args.adSetId, options);
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(insights, null, 2)
                    }]
                };
            }

            // ========== ADS ==========
            case 'list_ads': {
                const options = {
                    limit: args.limit || 100
                };

                if (args.campaignId) {
                    options.campaignId = args.campaignId;
                }

                if (args.adSetId) {
                    options.adSetId = args.adSetId;
                }

                if (args.status) {
                    options.filtering = [{
                        field: 'effective_status',
                        operator: 'IN',
                        value: [args.status]
                    }];
                }

                const ads = await metaClient.listAds(options);
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(ads, null, 2)
                    }]
                };
            }

            case 'get_ad_details': {
                const includeCreative = args.includeCreative !== false;
                const ad = await metaClient.getAd(args.adId, includeCreative);
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(ad, null, 2)
                    }]
                };
            }

            case 'get_ad_creative': {
                const creative = await metaClient.getAdCreative(args.creativeId);
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(creative, null, 2)
                    }]
                };
            }

            case 'get_ad_insights': {
                const options = {
                    datePreset: args.datePreset || 'last_7d'
                };
                if (args.timeRange) {
                    options.timeRange = args.timeRange;
                }

                const insights = await metaClient.getAdInsights(args.adId, options);
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(insights, null, 2)
                    }]
                };
            }

            // ========== AUDIENCES ==========
            case 'list_custom_audiences': {
                const audiences = await metaClient.listCustomAudiences({
                    limit: args.limit || 100
                });
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(audiences, null, 2)
                    }]
                };
            }

            case 'list_saved_audiences': {
                const audiences = await metaClient.listSavedAudiences({
                    limit: args.limit || 100
                });
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(audiences, null, 2)
                    }]
                };
            }

            // ========== INSIGHTS & BREAKDOWNS ==========
            case 'get_insights_by_demographics': {
                const options = {
                    level: args.level || 'account',
                    breakdowns: ['age', 'gender'],
                    datePreset: args.datePreset || 'last_7d'
                };
                if (args.timeRange) {
                    options.timeRange = args.timeRange;
                }

                const insights = await metaClient.getInsightsWithBreakdowns(options);
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(insights, null, 2)
                    }]
                };
            }

            case 'get_insights_by_placement': {
                const options = {
                    level: args.level || 'account',
                    breakdowns: ['publisher_platform', 'platform_position'],
                    datePreset: args.datePreset || 'last_7d'
                };
                if (args.timeRange) {
                    options.timeRange = args.timeRange;
                }

                const insights = await metaClient.getInsightsWithBreakdowns(options);
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(insights, null, 2)
                    }]
                };
            }

            case 'get_insights_by_device': {
                const options = {
                    level: args.level || 'account',
                    breakdowns: ['device_platform'],
                    datePreset: args.datePreset || 'last_7d'
                };
                if (args.timeRange) {
                    options.timeRange = args.timeRange;
                }

                const insights = await metaClient.getInsightsWithBreakdowns(options);
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify(insights, null, 2)
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
    console.error('Custom Meta Ads MCP server running on stdio');
}

main().catch((error) => {
    console.error('Server error:', error);
    process.exit(1);
});
