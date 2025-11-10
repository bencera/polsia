#!/usr/bin/env node

/**
 * Custom Reports MCP Server
 * Allows CEO agents and other modules to save and query business reports
 * Built for Polsia's autonomous reporting system
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { createReport, getReportsByUserId, getReportsByDate } = require('../db.js');

// Get user ID from environment variable or command line argument
let userId;

// Try environment variable first (used by routine-executor)
if (process.env.USER_ID) {
    userId = parseInt(process.env.USER_ID);
} else {
    // Fallback to command line argument
    const userIdArg = process.argv.find(arg => arg.startsWith('--user-id='));
    if (!userIdArg) {
        console.error('Error: USER_ID environment variable or --user-id argument is required');
        process.exit(1);
    }
    userId = parseInt(userIdArg.split('=')[1]);
}

if (isNaN(userId)) {
    console.error('Error: USER_ID must be a valid integer');
    process.exit(1);
}

console.error(`[Reports MCP] Initialized for user ${userId}`);

// Create MCP server
const server = new Server(
    {
        name: 'reports',
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
                name: 'create_report',
                description: 'Save a new report with markdown content. Use this after analyzing metrics to create a permanent record.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        name: {
                            type: 'string',
                            description: 'Report name (e.g., "Render Analytics Daily Report")'
                        },
                        report_type: {
                            type: 'string',
                            description: 'Type identifier (e.g., "render_analytics", "meta_ads_performance", "slack_digest")'
                        },
                        report_date: {
                            type: 'string',
                            description: 'Date being reported on (YYYY-MM-DD format)'
                        },
                        content: {
                            type: 'string',
                            description: 'Report content in markdown format'
                        },
                        metadata: {
                            type: 'object',
                            description: 'Optional metadata (metrics summary, filters used, etc.)'
                        },
                        execution_id: {
                            type: 'number',
                            description: 'Optional: ID of the execution that created this report'
                        },
                        module_id: {
                            type: 'number',
                            description: 'Optional: ID of the module that created this report'
                        }
                    },
                    required: ['name', 'report_type', 'report_date', 'content']
                }
            },
            {
                name: 'query_reports',
                description: 'Query reports with optional filters. Returns reports sorted by date (newest first).',
                inputSchema: {
                    type: 'object',
                    properties: {
                        report_type: {
                            type: 'string',
                            description: 'Filter by report type (e.g., "render_analytics")'
                        },
                        start_date: {
                            type: 'string',
                            description: 'Start date filter (YYYY-MM-DD)'
                        },
                        end_date: {
                            type: 'string',
                            description: 'End date filter (YYYY-MM-DD)'
                        },
                        limit: {
                            type: 'number',
                            description: 'Maximum number of reports to return',
                            default: 50
                        }
                    },
                    required: []
                }
            },
            {
                name: 'get_reports_by_date',
                description: 'Get all reports for a specific date. Returns multiple reports if different modules reported on the same date.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        report_date: {
                            type: 'string',
                            description: 'Date to query (YYYY-MM-DD format)'
                        },
                        report_type: {
                            type: 'string',
                            description: 'Optional: Filter by report type'
                        }
                    },
                    required: ['report_date']
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
            case 'create_report': {
                const {
                    name: reportName,
                    report_type,
                    report_date,
                    content,
                    metadata,
                    execution_id,
                    module_id
                } = args;

                const reportData = {
                    name: reportName,
                    report_type,
                    report_date,
                    content,
                    metadata: metadata || null,
                    execution_id: execution_id || null,
                    module_id: module_id || null
                };

                const report = await createReport(userId, reportData);

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            message: 'Report created successfully',
                            report: {
                                id: report.id,
                                name: report.name,
                                report_type: report.report_type,
                                report_date: report.report_date,
                                created_at: report.created_at
                            }
                        }, null, 2)
                    }]
                };
            }

            case 'query_reports': {
                const {
                    report_type,
                    start_date,
                    end_date,
                    limit = 50
                } = args;

                const filters = {};
                if (report_type) filters.report_type = report_type;
                if (start_date) filters.start_date = start_date;
                if (end_date) filters.end_date = end_date;

                const reports = await getReportsByUserId(userId, filters, limit);

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            count: reports.length,
                            reports: reports
                        }, null, 2)
                    }]
                };
            }

            case 'get_reports_by_date': {
                const { report_date, report_type } = args;

                const reports = await getReportsByDate(userId, report_date, report_type || null);

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            date: report_date,
                            count: reports.length,
                            reports: reports
                        }, null, 2)
                    }]
                };
            }

            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    } catch (error) {
        console.error(`[Reports MCP] Error executing ${name}:`, error.message);
        return {
            content: [{
                type: 'text',
                text: JSON.stringify({
                    success: false,
                    error: error.message
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
    console.error('[Reports MCP] Server running on stdio');
}

main().catch((error) => {
    console.error('[Reports MCP] Fatal error:', error);
    process.exit(1);
});
