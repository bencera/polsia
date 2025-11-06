#!/usr/bin/env node

/**
 * End-to-end test of the agents system
 * Creates a test task, assigns it to an agent, and verifies the flow
 */

const { pool, createTaskProposal, updateTaskStatus } = require('../db');

async function testAgentFlow() {
    try {
        console.log('🧪 Testing agents system end-to-end flow...\n');

        const userId = 1; // Test user
        const engineerAgentId = 1; // Engineer Agent

        // Step 1: Create a test task
        console.log('📝 Step 1: Creating test task...');
        const task = await createTaskProposal(userId, {
            title: '[TEST] Fix critical authentication bug',
            description: 'Users are unable to log in with OAuth. This is blocking all new signups.',
            suggestion_reasoning: 'Critical security issue affecting user access',
            priority: 'critical'
        });
        console.log(`   ✅ Created task ${task.id}: "${task.title}"`);
        console.log();

        // Step 2: Approve task and assign to Engineer Agent
        console.log('✅ Step 2: Approving task and assigning to Engineer Agent...');
        const approvedTask = await updateTaskStatus(task.id, 'approved', {
            changed_by: 'test_script',
            approval_reasoning: 'Critical bug that needs immediate attention from engineering team',
            assigned_to_agent_id: engineerAgentId
        });
        console.log(`   ✅ Approved task ${approvedTask.id}`);
        console.log(`   ✅ Assigned to agent ${engineerAgentId} (Engineer Agent)`);
        console.log();

        // Step 3: Verify task is ready for agent execution
        console.log('🔍 Step 3: Verifying task assignment...');
        const verification = await pool.query(`
            SELECT t.id, t.title, t.status, t.assigned_to_agent_id,
                   a.name as agent_name, a.agent_type, a.status as agent_status
            FROM tasks t
            INNER JOIN agents a ON a.id = t.assigned_to_agent_id
            WHERE t.id = $1
        `, [task.id]);

        if (verification.rows.length === 0) {
            throw new Error('Task-agent assignment not found!');
        }

        const result = verification.rows[0];
        console.log(`   ✅ Task: ${result.title}`);
        console.log(`   ✅ Status: ${result.status}`);
        console.log(`   ✅ Assigned Agent: ${result.agent_name} (${result.agent_type})`);
        console.log(`   ✅ Agent Status: ${result.agent_status}`);
        console.log();

        // Step 4: Explain what happens next
        console.log('🚀 Step 4: What happens next?');
        console.log('   1️⃣  Task Assignment Listener (running every 30s) will detect this task');
        console.log('   2️⃣  Agent Executor will load Engineer Agent role + task details');
        console.log('   3️⃣  Claude SDK executes with GitHub MCP tools');
        console.log('   4️⃣  Agent implements fix and creates PR');
        console.log('   5️⃣  Task status updated to "completed" or "failed"');
        console.log();

        // Clean up test task
        console.log('🧹 Cleaning up test task...');
        await pool.query('DELETE FROM tasks WHERE id = $1', [task.id]);
        console.log(`   ✅ Deleted test task ${task.id}`);
        console.log();

        console.log('🎉 End-to-end test complete!\n');
        console.log('✨ The agents system is ready to use!');
        console.log();
        console.log('📚 Next steps:');
        console.log('   - Run Brain CEO module (it will create and assign real tasks)');
        console.log('   - View agents at /api/agents');
        console.log('   - Monitor task executions in real-time');
        console.log();

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

testAgentFlow();
