#!/usr/bin/env node

/**
 * Comprehensive Task System Verification
 * Verifies all components of the task management system are properly installed
 *
 * Usage: node verify-task-system.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function verifyTaskSystem() {
    console.log('🔍 Comprehensive Task Management System Verification\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    let allPassed = true;
    const results = [];

    // Test 1: Database Schema
    console.log('📊 TEST 1: Database Schema');
    try {
        const client = await pool.connect();

        // Check if new columns exist
        const schemaQuery = `
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'tasks'
            AND column_name IN (
                'suggestion_reasoning',
                'approval_reasoning',
                'completion_summary',
                'rejection_reasoning',
                'blocked_reason',
                'approved_by',
                'approved_at',
                'assigned_to_module_id',
                'started_at',
                'blocked_at',
                'last_status_change_at'
            )
            ORDER BY column_name;
        `;
        const result = await client.query(schemaQuery);

        const expectedColumns = [
            'approval_reasoning',
            'approved_at',
            'approved_by',
            'assigned_to_module_id',
            'blocked_at',
            'blocked_reason',
            'completion_summary',
            'last_status_change_at',
            'rejection_reasoning',
            'started_at',
            'suggestion_reasoning'
        ];

        const foundColumns = result.rows.map(r => r.column_name).sort();

        if (foundColumns.length === expectedColumns.length) {
            console.log('   ✅ All 11 new columns exist');
            foundColumns.forEach(col => console.log(`      - ${col}`));
            results.push({ test: 'Database Schema', status: 'PASS' });
        } else {
            console.log('   ❌ Missing columns');
            console.log('      Expected:', expectedColumns.length);
            console.log('      Found:', foundColumns.length);
            allPassed = false;
            results.push({ test: 'Database Schema', status: 'FAIL' });
        }

        // Check indexes
        const indexQuery = `
            SELECT indexname
            FROM pg_indexes
            WHERE tablename = 'tasks'
            AND indexname LIKE 'idx_tasks_%';
        `;
        const indexResult = await client.query(indexQuery);
        console.log(`   ✅ Found ${indexResult.rows.length} indexes`);

        client.release();
    } catch (error) {
        console.log('   ❌ Schema check failed:', error.message);
        allPassed = false;
        results.push({ test: 'Database Schema', status: 'FAIL' });
    }
    console.log();

    // Test 2: Database Functions
    console.log('📚 TEST 2: Database Functions');
    try {
        const {
            createTaskProposal,
            updateTaskStatus,
            getTasksByStatus,
            getTaskById,
            getTasksByModuleId
        } = require('./db');

        const functions = [
            'createTaskProposal',
            'updateTaskStatus',
            'getTasksByStatus',
            'getTaskById',
            'getTasksByModuleId'
        ];

        let allFunctionsExist = true;
        functions.forEach(fn => {
            if (eval(fn)) {
                console.log(`   ✅ ${fn} exported`);
            } else {
                console.log(`   ❌ ${fn} missing`);
                allFunctionsExist = false;
            }
        });

        if (allFunctionsExist) {
            results.push({ test: 'Database Functions', status: 'PASS' });
        } else {
            allPassed = false;
            results.push({ test: 'Database Functions', status: 'FAIL' });
        }
    } catch (error) {
        console.log('   ❌ Function check failed:', error.message);
        allPassed = false;
        results.push({ test: 'Database Functions', status: 'FAIL' });
    }
    console.log();

    // Test 3: MCP Server File
    console.log('🖥️  TEST 3: MCP Server');
    try {
        const mcpServerPath = path.join(__dirname, 'services/task-management-mcp-server.js');

        if (fs.existsSync(mcpServerPath)) {
            console.log('   ✅ MCP server file exists');

            const stats = fs.statSync(mcpServerPath);
            const isExecutable = !!(stats.mode & fs.constants.S_IXUSR);
            if (isExecutable) {
                console.log('   ✅ MCP server is executable');
            } else {
                console.log('   ⚠️  MCP server not executable (chmod +x needed)');
            }

            const content = fs.readFileSync(mcpServerPath, 'utf8');
            const toolNames = [
                'create_task_proposal',
                'get_available_tasks',
                'get_task_details',
                'start_task',
                'block_task',
                'resume_task',
                'complete_task',
                'approve_task',
                'reject_task',
                'fail_task'
            ];

            let allToolsImplemented = true;
            toolNames.forEach(tool => {
                if (content.includes(`name: '${tool}'`) || content.includes(`name: "${tool}"`)) {
                    console.log(`   ✅ Tool implemented: ${tool}`);
                } else {
                    console.log(`   ❌ Tool missing: ${tool}`);
                    allToolsImplemented = false;
                }
            });

            if (allToolsImplemented) {
                results.push({ test: 'MCP Server', status: 'PASS' });
            } else {
                allPassed = false;
                results.push({ test: 'MCP Server', status: 'FAIL' });
            }
        } else {
            console.log('   ❌ MCP server file not found');
            allPassed = false;
            results.push({ test: 'MCP Server', status: 'FAIL' });
        }
    } catch (error) {
        console.log('   ❌ MCP server check failed:', error.message);
        allPassed = false;
        results.push({ test: 'MCP Server', status: 'FAIL' });
    }
    console.log();

    // Test 4: Agent Runner Integration
    console.log('🤖 TEST 4: Agent Runner Integration');
    try {
        const agentRunnerPath = path.join(__dirname, 'services/agent-runner.js');
        const content = fs.readFileSync(agentRunnerPath, 'utf8');

        if (content.includes("mcpName === 'tasks'")) {
            console.log('   ✅ Tasks MCP mount added to agent-runner.js');
            console.log('   ✅ MCP server configuration found');
            results.push({ test: 'Agent Runner Integration', status: 'PASS' });
        } else {
            console.log('   ❌ Tasks MCP not found in agent-runner.js');
            allPassed = false;
            results.push({ test: 'Agent Runner Integration', status: 'FAIL' });
        }
    } catch (error) {
        console.log('   ❌ Agent runner check failed:', error.message);
        allPassed = false;
        results.push({ test: 'Agent Runner Integration', status: 'FAIL' });
    }
    console.log();

    // Test 5: Brain Integration
    console.log('🧠 TEST 5: Brain Orchestrator Integration');
    try {
        const brainPath = path.join(__dirname, 'services/brain-orchestrator.js');
        const content = fs.readFileSync(brainPath, 'utf8');

        if (content.includes('task-management-mcp-server.js') && content.includes('Task Management')) {
            console.log('   ✅ Task Management MCP mounted in Brain');
            console.log('   ✅ Brain prompt includes task review instructions');
            results.push({ test: 'Brain Integration', status: 'PASS' });
        } else {
            console.log('   ❌ Tasks MCP not found in brain-orchestrator.js');
            allPassed = false;
            results.push({ test: 'Brain Integration', status: 'FAIL' });
        }
    } catch (error) {
        console.log('   ❌ Brain check failed:', error.message);
        allPassed = false;
        results.push({ test: 'Brain Integration', status: 'FAIL' });
    }
    console.log();

    // Test 6: REST API Routes
    console.log('🌐 TEST 6: REST API Routes');
    try {
        const taskRoutesPath = path.join(__dirname, 'routes/task-routes.js');

        if (fs.existsSync(taskRoutesPath)) {
            console.log('   ✅ Task routes file exists');

            const content = fs.readFileSync(taskRoutesPath, 'utf8');
            const routes = [
                "router.get('/'",
                "router.get('/stats'",
                "router.get('/:id'",
                "router.post('/'",
                "router.patch('/:id/status'",
                "router.post('/:id/approve'",
                "router.post('/:id/reject'"
            ];

            let allRoutesExist = true;
            routes.forEach(route => {
                if (content.includes(route)) {
                    console.log(`   ✅ Route: ${route}`);
                } else {
                    console.log(`   ❌ Route missing: ${route}`);
                    allRoutesExist = false;
                }
            });

            // Check server.js registration
            const serverPath = path.join(__dirname, 'server.js');
            const serverContent = fs.readFileSync(serverPath, 'utf8');

            if (serverContent.includes("require('./routes/task-routes')")) {
                console.log('   ✅ Routes registered in server.js');
            } else {
                console.log('   ❌ Routes not registered in server.js');
                allRoutesExist = false;
            }

            if (allRoutesExist) {
                results.push({ test: 'REST API Routes', status: 'PASS' });
            } else {
                allPassed = false;
                results.push({ test: 'REST API Routes', status: 'FAIL' });
            }
        } else {
            console.log('   ❌ Task routes file not found');
            allPassed = false;
            results.push({ test: 'REST API Routes', status: 'FAIL' });
        }
    } catch (error) {
        console.log('   ❌ API routes check failed:', error.message);
        allPassed = false;
        results.push({ test: 'REST API Routes', status: 'FAIL' });
    }
    console.log();

    // Test 7: Functional Test
    console.log('⚙️  TEST 7: Functional Workflow Test');
    try {
        const {
            createTaskProposal,
            updateTaskStatus,
            getTaskById
        } = require('./db');

        // Create test task
        const task = await createTaskProposal(1, {
            title: 'Verification test task',
            description: 'This is a test task for system verification',
            suggestion_reasoning: 'System verification test',
            proposed_by_module_id: null
        });

        console.log('   ✅ Created task:', task.id);

        // Approve it
        const approved = await updateTaskStatus(task.id, 'approved', {
            changed_by: 'verification_script',
            approved_by: 'verification_script',
            approval_reasoning: 'Test approval'
        });
        console.log('   ✅ Approved task');

        // Start it
        const started = await updateTaskStatus(task.id, 'in_progress', {
            changed_by: 'verification_script'
        });
        console.log('   ✅ Started task');

        // Complete it
        const completed = await updateTaskStatus(task.id, 'completed', {
            changed_by: 'verification_script',
            completion_summary: 'Test completed successfully'
        });
        console.log('   ✅ Completed task');

        // Verify final state
        const final = await getTaskById(task.id, 1);
        if (final.status === 'completed' && final.completion_summary) {
            console.log('   ✅ Task workflow verification complete');
            results.push({ test: 'Functional Workflow', status: 'PASS' });
        } else {
            console.log('   ❌ Task state incorrect');
            allPassed = false;
            results.push({ test: 'Functional Workflow', status: 'FAIL' });
        }
    } catch (error) {
        console.log('   ❌ Functional test failed:', error.message);
        allPassed = false;
        results.push({ test: 'Functional Workflow', status: 'FAIL' });
    }
    console.log();

    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 TEST SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    results.forEach(result => {
        const icon = result.status === 'PASS' ? '✅' : '❌';
        console.log(`   ${icon} ${result.test}: ${result.status}`);
    });

    console.log();
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (allPassed) {
        console.log('🎉 ALL TESTS PASSED!');
        console.log('\nTask Management System is fully operational and ready to use!\n');
        console.log('To enable for modules, add "tasks" to mcpMounts in module config:');
        console.log('  "mcpMounts": ["github", "gmail", "tasks"]\n');
    } else {
        console.log('❌ SOME TESTS FAILED');
        console.log('\nPlease review the failures above.\n');
    }

    await pool.end();
    return allPassed;
}

// Run verification
verifyTaskSystem()
    .then((passed) => {
        process.exit(passed ? 0 : 1);
    })
    .catch((error) => {
        console.error('❌ Verification failed:', error);
        process.exit(1);
    });
