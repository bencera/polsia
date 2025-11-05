#!/usr/bin/env node

/**
 * Test Task Management Workflow
 * Tests the complete task lifecycle: suggest → approve → start → complete
 *
 * Usage: node test-task-workflow.js
 */

require('dotenv').config();
const {
    createTaskProposal,
    updateTaskStatus,
    getTasksByStatus,
    getTaskById
} = require('./db');

// Test user ID (update this to match your test user)
const TEST_USER_ID = 1;

async function testTaskWorkflow() {
    console.log('🧪 Starting Task Management Workflow Test\n');

    try {
        // Step 1: Create a suggested task
        console.log('📝 Step 1: Creating task proposal (status=suggested)...');
        const taskProposal = await createTaskProposal(TEST_USER_ID, {
            title: 'Update user documentation',
            description: 'The API documentation is outdated after the v2.0 release. Need to update all endpoint references and add new authentication examples.',
            suggestion_reasoning: 'Noticed breaking changes in v2.0 release that are not documented. This will reduce support tickets and improve developer experience.',
            proposed_by_module_id: null, // Manual test
            assigned_to_module_id: null
        });
        console.log('✅ Task created:', {
            id: taskProposal.id,
            title: taskProposal.title,
            status: taskProposal.status,
            suggestion_reasoning: taskProposal.suggestion_reasoning.substring(0, 80) + '...'
        });
        console.log();

        const taskId = taskProposal.id;

        // Step 2: Get suggested tasks (simulating CEO Brain review)
        console.log('👀 Step 2: Fetching suggested tasks (CEO Brain review)...');
        const suggestedTasks = await getTasksByStatus(TEST_USER_ID, 'suggested', { limit: 10 });
        console.log(`✅ Found ${suggestedTasks.length} suggested task(s)`);
        console.log();

        // Step 3: Approve the task (CEO Brain decision)
        console.log('✅ Step 3: Approving task (CEO Brain decision)...');
        const approvedTask = await updateTaskStatus(taskId, 'approved', {
            changed_by: 'ceo_brain',
            approved_by: 'ceo_brain',
            approval_reasoning: 'Critical for reducing support load. Documentation updates align with Q1 goals for developer experience. Assigning to documentation team.',
            assigned_to_module_id: null // Would be a real module ID in production
        });
        console.log('✅ Task approved:', {
            id: approvedTask.id,
            status: approvedTask.status,
            approved_by: approvedTask.approved_by,
            approved_at: approvedTask.approved_at,
            approval_reasoning: approvedTask.approval_reasoning.substring(0, 80) + '...'
        });
        console.log();

        // Step 4: Agent picks up the task and starts work
        console.log('🤖 Step 4: Agent starting task (status=in_progress)...');
        const inProgressTask = await updateTaskStatus(taskId, 'in_progress', {
            changed_by: 'documentation_agent',
            execution_id: null // Would be a real execution ID in production
        });
        console.log('✅ Task started:', {
            id: inProgressTask.id,
            status: inProgressTask.status,
            started_at: inProgressTask.started_at
        });
        console.log();

        // Step 5: Agent encounters a blocker
        console.log('⏸️  Step 5: Agent blocking task (needs external input)...');
        const blockedTask = await updateTaskStatus(taskId, 'waiting', {
            changed_by: 'documentation_agent',
            blocked_reason: 'Waiting for product team to clarify new authentication flow before documenting it. Sent Slack message to @product-team.'
        });
        console.log('✅ Task blocked:', {
            id: blockedTask.id,
            status: blockedTask.status,
            blocked_at: blockedTask.blocked_at,
            blocked_reason: blockedTask.blocked_reason
        });
        console.log();

        // Step 6: Agent resumes after blocker resolved
        console.log('▶️  Step 6: Agent resuming task (blocker resolved)...');
        const resumedTask = await updateTaskStatus(taskId, 'in_progress', {
            changed_by: 'documentation_agent',
            blocked_reason: 'Resumed: Product team provided clarification. Auth flow diagram received.'
        });
        console.log('✅ Task resumed:', {
            id: resumedTask.id,
            status: resumedTask.status
        });
        console.log();

        // Step 7: Agent completes the task
        console.log('🎉 Step 7: Agent completing task...');
        const completedTask = await updateTaskStatus(taskId, 'completed', {
            changed_by: 'documentation_agent',
            completion_summary: `# Documentation Update Complete

Updated API documentation across 3 main sections:

## Changes Made:
- ✅ Updated all endpoint references from v1.x to v2.0
- ✅ Added new OAuth 2.1 authentication examples with code snippets
- ✅ Documented breaking changes in migration guide
- ✅ Added auth flow diagram provided by product team
- ✅ Updated SDK installation instructions

## Files Modified:
- docs/api-reference.md
- docs/authentication.md
- docs/migration-guide.md
- docs/quickstart.md

## Validation:
- Reviewed by tech writer
- Code examples tested and working
- Deployed to docs.example.com

Documentation is now accurate and ready for v2.0 launch.`
        });
        console.log('✅ Task completed:', {
            id: completedTask.id,
            status: completedTask.status,
            completed_at: completedTask.completed_at,
            completion_summary_preview: completedTask.completion_summary.substring(0, 100) + '...'
        });
        console.log();

        // Step 8: Verify final state
        console.log('🔍 Step 8: Verifying final task state...');
        const finalTask = await getTaskById(taskId, TEST_USER_ID);
        console.log('✅ Final task state:', {
            id: finalTask.id,
            title: finalTask.title,
            status: finalTask.status,
            workflow_timeline: {
                created: finalTask.created_at,
                approved: finalTask.approved_at,
                started: finalTask.started_at,
                blocked: finalTask.blocked_at,
                completed: finalTask.completed_at
            }
        });
        console.log();

        // Summary
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ All workflow tests passed!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log();
        console.log('Task lifecycle verified:');
        console.log('  1. ✅ Task created (suggested)');
        console.log('  2. ✅ Task approved by CEO Brain');
        console.log('  3. ✅ Task started by agent');
        console.log('  4. ✅ Task blocked (waiting for input)');
        console.log('  5. ✅ Task resumed');
        console.log('  6. ✅ Task completed with summary');
        console.log();

        // Test rejection flow
        console.log('🧪 Bonus: Testing rejection workflow...');
        const rejectTask = await createTaskProposal(TEST_USER_ID, {
            title: 'Redesign entire website',
            description: 'Complete overhaul of website design',
            suggestion_reasoning: 'Current design is outdated',
            proposed_by_module_id: null
        });

        const rejectedTask = await updateTaskStatus(rejectTask.id, 'rejected', {
            changed_by: 'ceo_brain',
            rejection_reasoning: 'Too broad and not aligned with current priorities. Focus on documentation and core product features first.'
        });
        console.log('✅ Rejection workflow tested:', {
            id: rejectedTask.id,
            status: rejectedTask.status,
            rejection_reasoning: rejectedTask.rejection_reasoning
        });
        console.log();

        console.log('🎉 Task management system fully functional!');
        console.log();

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run the test
testTaskWorkflow()
    .then(() => {
        console.log('✅ Test completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Test failed:', error);
        process.exit(1);
    });
