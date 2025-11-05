#!/usr/bin/env node

/**
 * Test Task Management MCP Server
 * Tests the MCP server directly by simulating agent interactions
 *
 * Usage: node test-task-mcp-server.js
 */

require('dotenv').config();
const { spawn } = require('child_process');
const readline = require('readline');

const TEST_USER_ID = 1;

/**
 * Send a JSON-RPC request to the MCP server
 */
function sendRequest(process, request) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Request timeout'));
        }, 5000);

        const handleData = (data) => {
            clearTimeout(timeout);
            process.stdout.off('data', handleData);
            try {
                const response = JSON.parse(data.toString());
                resolve(response);
            } catch (error) {
                reject(error);
            }
        };

        process.stdout.on('data', handleData);
        process.stdin.write(JSON.stringify(request) + '\n');
    });
}

async function testMCPServer() {
    console.log('🧪 Testing Task Management MCP Server\n');

    // Start MCP server
    console.log('🚀 Starting MCP server...');
    const serverPath = './services/task-management-mcp-server.js';
    const mcpServer = spawn('node', [serverPath, `--user-id=${TEST_USER_ID}`], {
        stdio: ['pipe', 'pipe', 'pipe']
    });

    // Capture stderr for logging
    mcpServer.stderr.on('data', (data) => {
        console.log('  [MCP Server]', data.toString().trim());
    });

    // Wait for server to initialize
    await new Promise(resolve => setTimeout(resolve, 1000));

    try {
        // Test 1: List available tools
        console.log('\n📋 Test 1: List available tools...');
        const listToolsRequest = {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/list',
            params: {}
        };
        const toolsResponse = await sendRequest(mcpServer, listToolsRequest);
        console.log(`✅ Found ${toolsResponse.result.tools.length} tools:`);
        toolsResponse.result.tools.forEach(tool => {
            console.log(`   - ${tool.name}: ${tool.description.substring(0, 60)}...`);
        });

        // Test 2: Create task proposal
        console.log('\n📝 Test 2: Create task proposal...');
        const createTaskRequest = {
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: {
                name: 'create_task_proposal',
                arguments: {
                    title: 'Fix security vulnerability in authentication module',
                    description: 'CVE-2024-12345 affects our JWT implementation. Need to upgrade library and patch vulnerable endpoints.',
                    suggestion_reasoning: 'Critical security issue discovered during routine scan. High severity rating. Should be addressed immediately to prevent potential data breach.',
                    priority: 'critical'
                }
            }
        };
        const createResponse = await sendRequest(mcpServer, createTaskRequest);
        const taskResult = JSON.parse(createResponse.result.content[0].text);
        console.log('✅ Task created:', {
            success: taskResult.success,
            task_id: taskResult.task.id,
            status: taskResult.task.status
        });
        const taskId = taskResult.task.id;

        // Test 3: Get available tasks
        console.log('\n👀 Test 3: Get available tasks (status=suggested)...');
        const getTasksRequest = {
            jsonrpc: '2.0',
            id: 3,
            method: 'tools/call',
            params: {
                name: 'get_available_tasks',
                arguments: {
                    status: 'suggested',
                    limit: 10
                }
            }
        };
        const tasksResponse = await sendRequest(mcpServer, getTasksRequest);
        const tasksResult = JSON.parse(tasksResponse.result.content[0].text);
        console.log(`✅ Found ${tasksResult.count} suggested task(s)`);

        // Test 4: Approve task
        console.log('\n✅ Test 4: Approve task (CEO Brain)...');
        const approveRequest = {
            jsonrpc: '2.0',
            id: 4,
            method: 'tools/call',
            params: {
                name: 'approve_task',
                arguments: {
                    task_id: taskId,
                    approval_reasoning: 'Critical security vulnerability. Immediate action required. This aligns with our security-first policy and Q1 compliance goals. Assigning to security team.',
                    approved_by: 'ceo_brain'
                }
            }
        };
        const approveResponse = await sendRequest(mcpServer, approveRequest);
        const approveResult = JSON.parse(approveResponse.result.content[0].text);
        console.log('✅ Task approved:', {
            success: approveResult.success,
            status: approveResult.task.status,
            approved_by: approveResult.task.approved_by
        });

        // Test 5: Start task
        console.log('\n🤖 Test 5: Start task (agent)...');
        const startRequest = {
            jsonrpc: '2.0',
            id: 5,
            method: 'tools/call',
            params: {
                name: 'start_task',
                arguments: {
                    task_id: taskId,
                    agent_name: 'security_patcher_agent'
                }
            }
        };
        const startResponse = await sendRequest(mcpServer, startRequest);
        const startResult = JSON.parse(startResponse.result.content[0].text);
        console.log('✅ Task started:', {
            success: startResult.success,
            status: startResult.task.status
        });

        // Test 6: Block task
        console.log('\n⏸️  Test 6: Block task (waiting for dependency)...');
        const blockRequest = {
            jsonrpc: '2.0',
            id: 6,
            method: 'tools/call',
            params: {
                name: 'block_task',
                arguments: {
                    task_id: taskId,
                    reason: 'Waiting for security team to approve production deployment window. Patch ready but need approval for emergency deployment.',
                    agent_name: 'security_patcher_agent',
                    use_status: 'waiting'
                }
            }
        };
        const blockResponse = await sendRequest(mcpServer, blockRequest);
        const blockResult = JSON.parse(blockResponse.result.content[0].text);
        console.log('✅ Task blocked:', {
            success: blockResult.success,
            status: blockResult.task.status,
            blocked_reason: blockResult.task.blocked_reason.substring(0, 60) + '...'
        });

        // Test 7: Resume task
        console.log('\n▶️  Test 7: Resume task...');
        const resumeRequest = {
            jsonrpc: '2.0',
            id: 7,
            method: 'tools/call',
            params: {
                name: 'resume_task',
                arguments: {
                    task_id: taskId,
                    agent_name: 'security_patcher_agent',
                    resume_note: 'Deployment approved. Emergency maintenance window scheduled for 2AM UTC.'
                }
            }
        };
        const resumeResponse = await sendRequest(mcpServer, resumeRequest);
        const resumeResult = JSON.parse(resumeResponse.result.content[0].text);
        console.log('✅ Task resumed:', {
            success: resumeResult.success,
            status: resumeResult.task.status
        });

        // Test 8: Complete task
        console.log('\n🎉 Test 8: Complete task...');
        const completeRequest = {
            jsonrpc: '2.0',
            id: 8,
            method: 'tools/call',
            params: {
                name: 'complete_task',
                arguments: {
                    task_id: taskId,
                    agent_name: 'security_patcher_agent',
                    completion_summary: `# Security Patch Complete

## Vulnerability Fixed: CVE-2024-12345

### Actions Taken:
- ✅ Upgraded jsonwebtoken library from v8.5.1 to v9.0.2
- ✅ Updated JWT verification logic in auth middleware
- ✅ Patched vulnerable endpoints: /api/auth/login, /api/auth/refresh
- ✅ Deployed to production during emergency maintenance window (2AM UTC)
- ✅ Verified fix with security scanner - vulnerability no longer detected

### Testing:
- Unit tests: 47/47 passed
- Integration tests: 12/12 passed
- Security scan: PASSED (no vulnerabilities)

### Monitoring:
- No errors in production logs
- Authentication success rate: 99.8% (normal)
- Response times: <100ms (normal)

**Security vulnerability successfully patched and verified.**`
                }
            }
        };
        const completeResponse = await sendRequest(mcpServer, completeRequest);
        const completeResult = JSON.parse(completeResponse.result.content[0].text);
        console.log('✅ Task completed:', {
            success: completeResult.success,
            status: completeResult.task.status
        });

        // Test 9: Get task details
        console.log('\n🔍 Test 9: Get task details...');
        const detailsRequest = {
            jsonrpc: '2.0',
            id: 9,
            method: 'tools/call',
            params: {
                name: 'get_task_details',
                arguments: {
                    task_id: taskId
                }
            }
        };
        const detailsResponse = await sendRequest(mcpServer, detailsRequest);
        const detailsResult = JSON.parse(detailsResponse.result.content[0].text);
        console.log('✅ Task details retrieved:', {
            id: detailsResult.task.id,
            title: detailsResult.task.title,
            status: detailsResult.task.status,
            has_suggestion_reasoning: !!detailsResult.task.suggestion_reasoning,
            has_approval_reasoning: !!detailsResult.task.approval_reasoning,
            has_completion_summary: !!detailsResult.task.completion_summary
        });

        // Test 10: Test rejection workflow
        console.log('\n🚫 Test 10: Test rejection workflow...');
        const createRejectTaskRequest = {
            jsonrpc: '2.0',
            id: 10,
            method: 'tools/call',
            params: {
                name: 'create_task_proposal',
                arguments: {
                    title: 'Rewrite entire codebase in Rust',
                    description: 'Complete rewrite of the application',
                    suggestion_reasoning: 'Rust is faster',
                    priority: 'low'
                }
            }
        };
        const createRejectResponse = await sendRequest(mcpServer, createRejectTaskRequest);
        const createRejectResult = JSON.parse(createRejectResponse.result.content[0].text);
        const rejectTaskId = createRejectResult.task.id;

        const rejectRequest = {
            jsonrpc: '2.0',
            id: 11,
            method: 'tools/call',
            params: {
                name: 'reject_task',
                arguments: {
                    task_id: rejectTaskId,
                    rejection_reasoning: 'Too broad and disruptive. Current codebase is stable and performant. Focus on incremental improvements instead of complete rewrites.',
                    rejected_by: 'ceo_brain'
                }
            }
        };
        const rejectResponse = await sendRequest(mcpServer, rejectRequest);
        const rejectResult = JSON.parse(rejectResponse.result.content[0].text);
        console.log('✅ Task rejected:', {
            success: rejectResult.success,
            status: rejectResult.task.status
        });

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ All MCP server tests passed!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('\nMCP Tools Tested:');
        console.log('  1. ✅ list_tools');
        console.log('  2. ✅ create_task_proposal');
        console.log('  3. ✅ get_available_tasks');
        console.log('  4. ✅ approve_task');
        console.log('  5. ✅ start_task');
        console.log('  6. ✅ block_task');
        console.log('  7. ✅ resume_task');
        console.log('  8. ✅ complete_task');
        console.log('  9. ✅ get_task_details');
        console.log('  10. ✅ reject_task');
        console.log();

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        throw error;
    } finally {
        // Cleanup
        mcpServer.kill();
    }
}

// Run test
testMCPServer()
    .then(() => {
        console.log('✅ MCP server test completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Test failed:', error);
        process.exit(1);
    });
