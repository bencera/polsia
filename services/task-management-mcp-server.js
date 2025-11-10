#!/usr/bin/env node

/**
 * Custom Task Management MCP Server
 * Allows agents to manage tasks through the workflow lifecycle
 * Agents can create, approve, start, block, resume, and complete tasks
 * Built for Polsia's agent-driven task management system
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const {
    createTaskProposal,
    updateTaskStatus,
    getTasksByStatus,
    getTaskById,
    getTasksByModuleId,
    createTaskSummary
} = require('../db.js');

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

// Optional: Get current module ID from environment or args
const moduleIdArg = process.argv.find(arg => arg.startsWith('--module-id='));
const currentModuleId = moduleIdArg ? parseInt(moduleIdArg.split('=')[1]) : null;

console.error(`[Tasks MCP] Initialized for user ${userId}${currentModuleId ? `, module ${currentModuleId}` : ''}`);

// Create MCP server
const server = new Server(
    {
        name: 'task-management',
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
                name: 'create_task_proposal',
                description: 'Create a new task suggestion. The task will start with status="suggested" and await CEO Brain approval. Use this when you identify work that needs to be done.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        title: {
                            type: 'string',
                            description: 'Clear, concise task title (e.g., "Update API documentation for v2.0")'
                        },
                        description: {
                            type: 'string',
                            description: 'Detailed task description explaining WHAT needs to be done, HOW to do it, and providing full context (links, stacktraces, etc.). This is the technical details.'
                        },
                        suggestion_reasoning: {
                            type: 'string',
                            description: 'WHY this task is needed - the business justification, impact, and urgency (e.g., "Critical bug affecting 89 users with 247 events"). This is separate from description and helps decision-makers understand the importance. REQUIRED field - do not put this in description.'
                        },
                        suggested_module: {
                            type: 'string',
                            description: 'Name or type of module/agent that should handle this task'
                        },
                        assigned_to_module_id: {
                            type: 'number',
                            description: 'Optional: Module ID to assign this task to'
                        },
                        priority: {
                            type: 'string',
                            description: 'Task priority: low, medium, high, critical',
                            enum: ['low', 'medium', 'high', 'critical']
                        }
                    },
                    required: ['title', 'description', 'suggestion_reasoning']
                }
            },
            {
                name: 'get_available_tasks',
                description: 'Get tasks available for agents to work on. Can filter by status and module assignment. Use this to find work.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        status: {
                            type: 'string',
                            description: 'Filter by status: suggested, approved, in_progress, waiting, blocked, completed, rejected',
                            enum: ['suggested', 'approved', 'in_progress', 'waiting', 'blocked', 'completed', 'rejected']
                        },
                        assigned_to_me: {
                            type: 'boolean',
                            description: 'If true, only return tasks assigned to the current module'
                        },
                        limit: {
                            type: 'number',
                            description: 'Maximum number of tasks to return',
                            default: 20
                        }
                    },
                    required: []
                }
            },
            {
                name: 'get_task_details',
                description: 'Get full details of a specific task including all reasoning fields and status history.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        task_id: {
                            type: 'number',
                            description: 'ID of the task to retrieve'
                        }
                    },
                    required: ['task_id']
                }
            },
            {
                name: 'start_task',
                description: 'Mark a task as in_progress and start working on it. Use this after reading task details and deciding to work on it.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        task_id: {
                            type: 'number',
                            description: 'ID of the task to start'
                        },
                        agent_name: {
                            type: 'string',
                            description: 'Name/identifier of the agent starting this task'
                        },
                        execution_id: {
                            type: 'number',
                            description: 'Optional: Module execution ID to link this task to'
                        }
                    },
                    required: ['task_id', 'agent_name']
                }
            },
            {
                name: 'block_task',
                description: 'Mark a task as blocked/waiting when you encounter a dependency or need external input. Task stays assigned but paused.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        task_id: {
                            type: 'number',
                            description: 'ID of the task to block'
                        },
                        reason: {
                            type: 'string',
                            description: 'Detailed reason for blocking (e.g., "Waiting for customer response to requirements question")'
                        },
                        agent_name: {
                            type: 'string',
                            description: 'Name/identifier of the agent blocking this task'
                        },
                        use_status: {
                            type: 'string',
                            description: 'Status to use: "waiting" or "blocked" (default: waiting)',
                            enum: ['waiting', 'blocked'],
                            default: 'waiting'
                        }
                    },
                    required: ['task_id', 'reason', 'agent_name']
                }
            },
            {
                name: 'resume_task',
                description: 'Resume a blocked/waiting task and move it back to in_progress. Use this when blocker is resolved.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        task_id: {
                            type: 'number',
                            description: 'ID of the task to resume'
                        },
                        agent_name: {
                            type: 'string',
                            description: 'Name/identifier of the agent resuming this task'
                        },
                        resume_note: {
                            type: 'string',
                            description: 'Optional note explaining how blocker was resolved'
                        }
                    },
                    required: ['task_id', 'agent_name']
                }
            },
            {
                name: 'complete_task',
                description: 'Mark a task as completed with a summary of what was accomplished. Use this after successfully finishing the work.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        task_id: {
                            type: 'number',
                            description: 'ID of the task to complete'
                        },
                        completion_summary: {
                            type: 'string',
                            description: 'Detailed summary of what was accomplished (markdown supported)'
                        },
                        agent_name: {
                            type: 'string',
                            description: 'Name/identifier of the agent completing this task'
                        }
                    },
                    required: ['task_id', 'completion_summary', 'agent_name']
                }
            },
            {
                name: 'approve_task',
                description: 'Approve a suggested task and optionally assign it to a module or agent. CEO Brain uses this to approve proposed work.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        task_id: {
                            type: 'number',
                            description: 'ID of the task to approve'
                        },
                        approval_reasoning: {
                            type: 'string',
                            description: 'Why this task is being approved and prioritized'
                        },
                        assign_to_module_id: {
                            type: 'number',
                            description: 'Module ID to assign this task to (for scheduled modules)'
                        },
                        assign_to_agent_id: {
                            type: 'number',
                            description: 'Agent ID to assign this task to (for task-driven agents)'
                        },
                        approved_by: {
                            type: 'string',
                            description: 'Identifier of who approved (e.g., "ceo_brain", "user")',
                            default: 'ceo_brain'
                        }
                    },
                    required: ['task_id', 'approval_reasoning']
                }
            },
            {
                name: 'reject_task',
                description: 'Reject a suggested task with reasoning. CEO Brain uses this to decline proposed work.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        task_id: {
                            type: 'number',
                            description: 'ID of the task to reject'
                        },
                        rejection_reasoning: {
                            type: 'string',
                            description: 'Why this task is being rejected'
                        },
                        rejected_by: {
                            type: 'string',
                            description: 'Identifier of who rejected (e.g., "ceo_brain", "user")',
                            default: 'ceo_brain'
                        }
                    },
                    required: ['task_id', 'rejection_reasoning']
                }
            },
            {
                name: 'fail_task',
                description: 'Mark a task as failed when work cannot be completed due to errors. Include error details.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        task_id: {
                            type: 'number',
                            description: 'ID of the task that failed'
                        },
                        error_message: {
                            type: 'string',
                            description: 'Error message or reason for failure'
                        },
                        agent_name: {
                            type: 'string',
                            description: 'Name/identifier of the agent that encountered the failure'
                        }
                    },
                    required: ['task_id', 'error_message', 'agent_name']
                }
            },
            {
                name: 'log_activity',
                description: 'Log a completed activity to the user\'s dashboard. Use this at the end of ANY execution to post a summary of what you accomplished. This is not for task workflow - it\'s for posting activity summaries that appear in the dashboard feed.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        title: {
                            type: 'string',
                            description: 'Short, outcome-focused activity title (1-8 words). Be specific about what was accomplished, not just what action was taken. Good: "Generated daily analytics report with 156 users". Bad: "Ran analytics routine".'
                        },
                        description: {
                            type: 'string',
                            description: 'Detailed description of what was accomplished (2-4 sentences). Include specific metrics, numbers, outcomes, and any important findings or actions taken. Use markdown formatting if helpful.'
                        },
                        services_used: {
                            type: 'array',
                            items: { type: 'string' },
                            description: 'Optional: Array of service/MCP names used during execution (e.g., ["render", "reports", "github"])'
                        },
                        execution_id: {
                            type: 'number',
                            description: 'Optional: Execution ID to link this activity to a specific routine/agent run'
                        },
                        module_id: {
                            type: 'number',
                            description: 'Optional: Module ID if this activity is associated with a specific module'
                        },
                        cost_usd: {
                            type: 'number',
                            description: 'Optional: Cost of this execution in USD'
                        },
                        duration_ms: {
                            type: 'number',
                            description: 'Optional: Duration of execution in milliseconds'
                        }
                    },
                    required: ['title', 'description']
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
            case 'create_task_proposal': {
                const {
                    title,
                    description,
                    suggestion_reasoning,
                    suggested_module,
                    assigned_to_module_id,
                    priority
                } = args;

                const taskData = {
                    title,
                    description,
                    suggestion_reasoning,
                    proposed_by_module_id: currentModuleId,
                    assigned_to_module_id: assigned_to_module_id || null,
                    priority
                };

                const task = await createTaskProposal(userId, taskData);

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            message: 'Task proposal created successfully. Status: suggested (awaiting approval)',
                            task: {
                                id: task.id,
                                title: task.title,
                                status: task.status,
                                suggestion_reasoning: task.suggestion_reasoning,
                                created_at: task.created_at
                            }
                        }, null, 2)
                    }]
                };
            }

            case 'get_available_tasks': {
                const { status, assigned_to_me, limit = 20 } = args;

                let tasks;
                if (assigned_to_me && currentModuleId) {
                    tasks = await getTasksByModuleId(userId, currentModuleId, status || null);
                } else {
                    const options = { limit };
                    if (currentModuleId && assigned_to_me !== false) {
                        options.assigned_to_module_id = currentModuleId;
                    }
                    tasks = await getTasksByStatus(userId, status, options);
                }

                // Limit results
                tasks = tasks.slice(0, limit);

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            count: tasks.length,
                            filter: { status, assigned_to_me, limit },
                            tasks: tasks.map(t => ({
                                id: t.id,
                                title: t.title,
                                description: t.description,
                                status: t.status,
                                suggestion_reasoning: t.suggestion_reasoning,
                                approval_reasoning: t.approval_reasoning,
                                blocked_reason: t.blocked_reason,
                                assigned_to_module_id: t.assigned_to_module_id,
                                created_at: t.created_at,
                                started_at: t.started_at
                            }))
                        }, null, 2)
                    }]
                };
            }

            case 'get_task_details': {
                const { task_id } = args;

                const task = await getTaskById(task_id, userId);

                if (!task) {
                    throw new Error(`Task ${task_id} not found`);
                }

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            task: task
                        }, null, 2)
                    }]
                };
            }

            case 'start_task': {
                const { task_id, agent_name, execution_id } = args;

                const task = await updateTaskStatus(task_id, 'in_progress', {
                    changed_by: agent_name,
                    execution_id: execution_id || null
                });

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            message: 'Task started successfully. Status: in_progress',
                            task: {
                                id: task.id,
                                title: task.title,
                                status: task.status,
                                started_at: task.started_at
                            }
                        }, null, 2)
                    }]
                };
            }

            case 'block_task': {
                const { task_id, reason, agent_name, use_status = 'waiting' } = args;

                const task = await updateTaskStatus(task_id, use_status, {
                    changed_by: agent_name,
                    blocked_reason: reason
                });

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            message: `Task blocked successfully. Status: ${use_status}`,
                            task: {
                                id: task.id,
                                title: task.title,
                                status: task.status,
                                blocked_reason: task.blocked_reason,
                                blocked_at: task.blocked_at
                            }
                        }, null, 2)
                    }]
                };
            }

            case 'resume_task': {
                const { task_id, agent_name, resume_note } = args;

                // Clear blocked reason when resuming
                const task = await updateTaskStatus(task_id, 'in_progress', {
                    changed_by: agent_name,
                    blocked_reason: resume_note ? `Resumed: ${resume_note}` : null
                });

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            message: 'Task resumed successfully. Status: in_progress',
                            task: {
                                id: task.id,
                                title: task.title,
                                status: task.status
                            }
                        }, null, 2)
                    }]
                };
            }

            case 'complete_task': {
                const { task_id, completion_summary, agent_name } = args;

                const task = await updateTaskStatus(task_id, 'completed', {
                    changed_by: agent_name,
                    completion_summary
                });

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            message: 'Task completed successfully! 🎉',
                            task: {
                                id: task.id,
                                title: task.title,
                                status: task.status,
                                completion_summary: task.completion_summary,
                                completed_at: task.completed_at
                            }
                        }, null, 2)
                    }]
                };
            }

            case 'approve_task': {
                const { task_id, approval_reasoning, assign_to_module_id, assign_to_agent_id, approved_by = 'ceo_brain' } = args;

                // Prepare updates object
                const updates = {
                    changed_by: approved_by,
                    approval_reasoning,
                    approved_by,
                };

                // Handle assignment (agent takes precedence over module if both provided)
                if (assign_to_agent_id) {
                    updates.assigned_to_agent_id = assign_to_agent_id;
                    updates.assigned_to_module_id = null; // Clear module assignment
                } else if (assign_to_module_id) {
                    updates.assigned_to_module_id = assign_to_module_id;
                    updates.assigned_to_agent_id = null; // Clear agent assignment
                }

                const task = await updateTaskStatus(task_id, 'approved', updates);

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            message: `Task approved successfully. Status: approved (ready for execution)${assign_to_agent_id ? ' - Assigned to agent' : assign_to_module_id ? ' - Assigned to module' : ''}`,
                            task: {
                                id: task.id,
                                title: task.title,
                                status: task.status,
                                approval_reasoning: task.approval_reasoning,
                                approved_by: task.approved_by,
                                approved_at: task.approved_at,
                                assigned_to_module_id: task.assigned_to_module_id,
                                assigned_to_agent_id: task.assigned_to_agent_id
                            }
                        }, null, 2)
                    }]
                };
            }

            case 'reject_task': {
                const { task_id, rejection_reasoning, rejected_by = 'ceo_brain' } = args;

                const task = await updateTaskStatus(task_id, 'rejected', {
                    changed_by: rejected_by,
                    rejection_reasoning
                });

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            message: 'Task rejected. Status: rejected',
                            task: {
                                id: task.id,
                                title: task.title,
                                status: task.status,
                                rejection_reasoning: task.rejection_reasoning
                            }
                        }, null, 2)
                    }]
                };
            }

            case 'fail_task': {
                const { task_id, error_message, agent_name } = args;

                const task = await updateTaskStatus(task_id, 'failed', {
                    changed_by: agent_name,
                    completion_summary: `Failed: ${error_message}`
                });

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            message: 'Task marked as failed',
                            task: {
                                id: task.id,
                                title: task.title,
                                status: task.status,
                                error_message
                            }
                        }, null, 2)
                    }]
                };
            }

            case 'log_activity': {
                const {
                    title,
                    description,
                    services_used,
                    execution_id,
                    module_id,
                    cost_usd,
                    duration_ms
                } = args;

                // Map services_used array to service IDs (will need to look them up)
                // For now, we'll just create the task without service mapping
                // The agent-runner already handles service mapping via mcpMounts

                const taskData = {
                    title,
                    description,
                    status: 'completed',
                    completed_at: new Date(),
                    execution_id: execution_id || null,
                    module_id: module_id || null,
                    cost_usd: cost_usd || null,
                    duration_ms: duration_ms || null
                };

                const task = await createTaskSummary(userId, taskData);

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            message: 'Activity logged successfully to dashboard! 📊',
                            activity: {
                                id: task.id,
                                title: task.title,
                                description: task.description,
                                created_at: task.created_at
                            }
                        }, null, 2)
                    }]
                };
            }

            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    } catch (error) {
        console.error(`[Tasks MCP] Error executing ${name}:`, error.message);
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
    console.error('[Tasks MCP] Server running on stdio');
}

main().catch((error) => {
    console.error('[Tasks MCP] Fatal error:', error);
    process.exit(1);
});
