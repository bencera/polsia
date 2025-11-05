#!/usr/bin/env node

/**
 * Test Task Management REST API
 * Tests all API endpoints for task management
 *
 * Prerequisites: Server must be running on http://localhost:3001
 * Usage: node test-task-api.js
 */

require('dotenv').config();
const axios = require('axios');

const BASE_URL = 'http://localhost:3001';
const TEST_EMAIL = 'test@example.com'; // Update with your test user email
const TEST_PASSWORD = 'test123'; // Update with your test user password

let authToken = null;
let testTaskId = null;

async function login() {
    console.log('🔐 Logging in...');
    try {
        const response = await axios.post(`${BASE_URL}/api/auth/login`, {
            email: TEST_EMAIL,
            password: TEST_PASSWORD
        });
        authToken = response.data.token;
        console.log('✅ Logged in successfully');
        return authToken;
    } catch (error) {
        console.error('❌ Login failed. Make sure:');
        console.error('   1. Server is running: npm run server');
        console.error(`   2. Test user exists with email: ${TEST_EMAIL}`);
        console.error(`   3. You can create a test user with: node create-test-user.js`);
        throw error;
    }
}

async function testAPI() {
    console.log('🧪 Testing Task Management REST API\n');

    const headers = {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
    };

    try {
        // Test 1: Create task proposal
        console.log('📝 Test 1: POST /api/tasks (create task proposal)...');
        const createResponse = await axios.post(
            `${BASE_URL}/api/tasks`,
            {
                title: 'Implement rate limiting on API',
                description: 'Add rate limiting middleware to prevent API abuse. Should limit to 100 requests per minute per IP.',
                suggestion_reasoning: 'Recent traffic analysis shows potential abuse patterns. Rate limiting will protect our infrastructure and improve reliability for legitimate users.'
            },
            { headers }
        );
        testTaskId = createResponse.data.task.id;
        console.log('✅ Task created:', {
            id: createResponse.data.task.id,
            status: createResponse.data.task.status,
            success: createResponse.data.success
        });
        console.log();

        // Test 2: Get all tasks
        console.log('📋 Test 2: GET /api/tasks (list all tasks)...');
        const listResponse = await axios.get(`${BASE_URL}/api/tasks`, { headers });
        console.log('✅ Tasks retrieved:', {
            count: listResponse.data.count,
            success: listResponse.data.success
        });
        console.log();

        // Test 3: Get tasks by status
        console.log('🔍 Test 3: GET /api/tasks?status=suggested...');
        const suggestedResponse = await axios.get(
            `${BASE_URL}/api/tasks?status=suggested&limit=10`,
            { headers }
        );
        console.log('✅ Suggested tasks:', {
            count: suggestedResponse.data.count,
            filter: suggestedResponse.data.filter
        });
        console.log();

        // Test 4: Get task by ID
        console.log('🔍 Test 4: GET /api/tasks/:id...');
        const getResponse = await axios.get(
            `${BASE_URL}/api/tasks/${testTaskId}`,
            { headers }
        );
        console.log('✅ Task retrieved:', {
            id: getResponse.data.task.id,
            title: getResponse.data.task.title,
            status: getResponse.data.task.status
        });
        console.log();

        // Test 5: Approve task
        console.log('✅ Test 5: POST /api/tasks/:id/approve...');
        const approveResponse = await axios.post(
            `${BASE_URL}/api/tasks/${testTaskId}/approve`,
            {
                approval_reasoning: 'Critical for infrastructure protection. Rate limiting aligns with our security roadmap and will prevent potential DDoS attacks. High priority.',
                approved_by: 'api_test'
            },
            { headers }
        );
        console.log('✅ Task approved:', {
            id: approveResponse.data.task.id,
            status: approveResponse.data.task.status,
            approved_by: approveResponse.data.task.approved_by
        });
        console.log();

        // Test 6: Update task status (start task)
        console.log('🤖 Test 6: PATCH /api/tasks/:id/status (start task)...');
        const startResponse = await axios.patch(
            `${BASE_URL}/api/tasks/${testTaskId}/status`,
            {
                status: 'in_progress',
                changed_by: 'api_test_agent'
            },
            { headers }
        );
        console.log('✅ Task started:', {
            id: startResponse.data.task.id,
            status: startResponse.data.task.status
        });
        console.log();

        // Test 7: Update task status (block task)
        console.log('⏸️  Test 7: PATCH /api/tasks/:id/status (block task)...');
        const blockResponse = await axios.patch(
            `${BASE_URL}/api/tasks/${testTaskId}/status`,
            {
                status: 'waiting',
                changed_by: 'api_test_agent',
                blocked_reason: 'Waiting for DevOps team to review rate limiting strategy before implementation.'
            },
            { headers }
        );
        console.log('✅ Task blocked:', {
            id: blockResponse.data.task.id,
            status: blockResponse.data.task.status,
            blocked_reason: blockResponse.data.task.blocked_reason.substring(0, 60) + '...'
        });
        console.log();

        // Test 8: Update task status (resume task)
        console.log('▶️  Test 8: PATCH /api/tasks/:id/status (resume task)...');
        const resumeResponse = await axios.patch(
            `${BASE_URL}/api/tasks/${testTaskId}/status`,
            {
                status: 'in_progress',
                changed_by: 'api_test_agent'
            },
            { headers }
        );
        console.log('✅ Task resumed:', {
            id: resumeResponse.data.task.id,
            status: resumeResponse.data.task.status
        });
        console.log();

        // Test 9: Update task status (complete task)
        console.log('🎉 Test 9: PATCH /api/tasks/:id/status (complete task)...');
        const completeResponse = await axios.patch(
            `${BASE_URL}/api/tasks/${testTaskId}/status`,
            {
                status: 'completed',
                changed_by: 'api_test_agent',
                completion_summary: `# Rate Limiting Implementation Complete

## Implementation Details:
- ✅ Added express-rate-limit middleware
- ✅ Configured 100 requests per minute per IP
- ✅ Added custom error responses (429 Too Many Requests)
- ✅ Implemented Redis-backed store for distributed rate limiting
- ✅ Added monitoring and alerting for rate limit violations

## Testing:
- Unit tests: 15/15 passed
- Load testing: Successfully blocks after 100 requests
- Production deployment: Monitoring shows no issues

**Rate limiting successfully deployed and operational.**`
            },
            { headers }
        );
        console.log('✅ Task completed:', {
            id: completeResponse.data.task.id,
            status: completeResponse.data.task.status,
            has_completion_summary: !!completeResponse.data.task.completion_summary
        });
        console.log();

        // Test 10: Get task stats
        console.log('📊 Test 10: GET /api/tasks/stats...');
        const statsResponse = await axios.get(
            `${BASE_URL}/api/tasks/stats`,
            { headers }
        );
        console.log('✅ Task statistics:', statsResponse.data.stats);
        console.log();

        // Test 11: Test rejection workflow
        console.log('🚫 Test 11: Test rejection workflow...');
        const rejectTaskResponse = await axios.post(
            `${BASE_URL}/api/tasks`,
            {
                title: 'Migrate to PHP',
                description: 'Rewrite application in PHP',
                suggestion_reasoning: 'PHP is popular'
            },
            { headers }
        );
        const rejectTaskId = rejectTaskResponse.data.task.id;

        const rejectResponse = await axios.post(
            `${BASE_URL}/api/tasks/${rejectTaskId}/reject`,
            {
                rejection_reasoning: 'Not aligned with technology stack. Current Node.js stack is performant and well-supported. No business justification for migration.',
                rejected_by: 'api_test'
            },
            { headers }
        );
        console.log('✅ Task rejected:', {
            id: rejectResponse.data.task.id,
            status: rejectResponse.data.task.status
        });
        console.log();

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ All REST API tests passed!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('\nAPI Endpoints Tested:');
        console.log('  1. ✅ POST /api/tasks (create task)');
        console.log('  2. ✅ GET /api/tasks (list all)');
        console.log('  3. ✅ GET /api/tasks?status=X (filter by status)');
        console.log('  4. ✅ GET /api/tasks/:id (get single task)');
        console.log('  5. ✅ POST /api/tasks/:id/approve (approve)');
        console.log('  6. ✅ PATCH /api/tasks/:id/status (update status)');
        console.log('  7. ✅ POST /api/tasks/:id/reject (reject)');
        console.log('  8. ✅ GET /api/tasks/stats (statistics)');
        console.log();

    } catch (error) {
        console.error('\n❌ API test failed:');
        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Error:', error.response.data);
        } else {
            console.error('   Error:', error.message);
        }
        throw error;
    }
}

async function main() {
    try {
        await login();
        await testAPI();
        console.log('✅ All API tests completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Tests failed');
        process.exit(1);
    }
}

main();
