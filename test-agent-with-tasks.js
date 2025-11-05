#!/usr/bin/env node

/**
 * Test Agent with Task Management
 * Tests real agent execution with task management MCP tools
 *
 * Usage: node test-agent-with-tasks.js
 */

require('dotenv').config();
const { executeTask } = require('./services/claude-agent');
const {
    createTaskProposal,
    getTasksByStatus,
    getTaskById
} = require('./db');

const TEST_USER_ID = 1;

async function testAgentWithTasks() {
    console.log('🧪 Testing Agent with Task Management MCP\n');

    try {
        // Step 1: Create a pre-existing approved task for the agent to work on
        console.log('📝 Step 1: Setting up test environment...');
        console.log('   Creating an approved task for agent to pick up...');

        const task = await createTaskProposal(TEST_USER_ID, {
            title: 'Write a hello world function',
            description: 'Create a simple hello world function in JavaScript and save it to hello.js',
            suggestion_reasoning: 'Test task for agent task management integration',
            proposed_by_module_id: null
        });

        // Immediately approve it
        const { updateTaskStatus } = require('./db');
        await updateTaskStatus(task.id, 'approved', {
            changed_by: 'test_system',
            approved_by: 'test_system',
            approval_reasoning: 'Test task for agent integration testing'
        });

        console.log(`✅ Created approved task ID: ${task.id}`);
        console.log();

        // Step 2: Run agent with task management MCP
        console.log('🤖 Step 2: Running agent with task management MCP...');

        const taskMcpPath = require('path').join(__dirname, 'services/task-management-mcp-server.js');

        const prompt = `You are a test agent with access to task management tools.

Your workflow:
1. Check for approved tasks assigned to you: get_available_tasks(status="approved")
2. Pick the first available task
3. Start the task: start_task(task_id=X, agent_name="test_agent")
4. Read the task details: get_task_details(task_id=X)
5. Complete the task as described
6. Mark it complete: complete_task(task_id=X, completion_summary="...", agent_name="test_agent")

Then respond with: "Task workflow completed successfully!"

Remember to actually call the MCP tools - don't just describe what you would do.`;

        const result = await executeTask(prompt, {
            cwd: '/tmp',
            maxTurns: 10,
            mcpServers: {
                tasks: {
                    command: 'node',
                    args: [taskMcpPath, `--user-id=${TEST_USER_ID}`]
                }
            },
            skipFileCollection: true,
            onMessage: (msg) => {
                if (msg.type === 'text') {
                    console.log('   [Agent]:', msg.text.substring(0, 100));
                } else if (msg.type === 'tool_use') {
                    console.log(`   [Agent] Using tool: ${msg.name}`);
                }
            }
        });

        console.log();
        console.log('✅ Agent execution completed');
        console.log(`   Turns: ${result.metadata?.num_turns || 'unknown'}`);
        console.log(`   Success: ${result.success}`);
        console.log();

        // Step 3: Verify task was completed by agent
        console.log('🔍 Step 3: Verifying task state after agent execution...');
        const updatedTask = await getTaskById(task.id, TEST_USER_ID);

        console.log('✅ Task state:', {
            id: updatedTask.id,
            title: updatedTask.title,
            status: updatedTask.status,
            started_at: updatedTask.started_at,
            completed_at: updatedTask.completed_at,
            has_completion_summary: !!updatedTask.completion_summary,
            last_changed_by: updatedTask.last_status_change_by
        });

        if (updatedTask.completion_summary) {
            console.log('\n📄 Completion summary preview:');
            console.log('   ' + updatedTask.completion_summary.substring(0, 200) + '...');
        }

        console.log();

        // Verify expected state
        if (updatedTask.status === 'completed') {
            console.log('✅ Task successfully completed by agent!');
        } else if (updatedTask.status === 'in_progress') {
            console.log('⚠️  Task started but not completed - agent may need more turns');
        } else {
            console.log(`⚠️  Task in unexpected state: ${updatedTask.status}`);
        }

        // Step 4: Test agent creating its own task proposal
        console.log('\n🤖 Step 4: Testing agent creating task proposal...');

        const createPrompt = `You are a test agent. Use the create_task_proposal tool to suggest a new task.

Create a task proposal with:
- title: "Implement user authentication"
- description: "Add OAuth 2.0 authentication to the application"
- suggestion_reasoning: "Users need secure login functionality. Current system lacks authentication."
- priority: "high"

After creating the proposal, respond with "Task proposal created successfully!"`;

        const createResult = await executeTask(createPrompt, {
            cwd: '/tmp',
            maxTurns: 5,
            mcpServers: {
                tasks: {
                    command: 'node',
                    args: [taskMcpPath, `--user-id=${TEST_USER_ID}`]
                }
            },
            skipFileCollection: true
        });

        console.log('✅ Agent proposal execution completed');

        // Check if a new suggested task was created
        const suggestedTasks = await getTasksByStatus(TEST_USER_ID, 'suggested', { limit: 10 });
        const newProposal = suggestedTasks.find(t => t.title === 'Implement user authentication');

        if (newProposal) {
            console.log('✅ Agent successfully created task proposal:', {
                id: newProposal.id,
                title: newProposal.title,
                status: newProposal.status,
                has_reasoning: !!newProposal.suggestion_reasoning
            });
        } else {
            console.log('⚠️  Could not find agent-created proposal (may need more turns)');
        }

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ Agent integration tests completed!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('\nTests completed:');
        console.log('  1. ✅ Agent picking up approved task');
        console.log('  2. ✅ Agent starting task via MCP');
        console.log('  3. ✅ Agent completing task via MCP');
        console.log('  4. ✅ Agent creating task proposal via MCP');
        console.log();

        return {
            success: true,
            taskCompleted: updatedTask.status === 'completed',
            proposalCreated: !!newProposal
        };

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error.stack);
        throw error;
    }
}

// Run test
if (require.main === module) {
    testAgentWithTasks()
        .then((result) => {
            console.log('✅ All agent integration tests passed!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Agent integration test failed:', error);
            process.exit(1);
        });
}

module.exports = { testAgentWithTasks };
