#!/usr/bin/env node

/**
 * Test Module Frontend Integration
 * Tests the complete module flow including API and frontend
 */

const http = require('http');

const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsImlhdCI6MTc2MTgyNDM0NywiZXhwIjoxNzYyNDI5MTQ3fQ.obpRArd11dmHDpQD5bkhXmH8Xub_VGrsRmR-1Ktfy20';

async function makeRequest(options, postData = null) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(data);
                }
            });
        });
        req.on('error', reject);
        if (postData) {
            req.write(postData);
        }
        req.end();
    });
}

async function listModules() {
    console.log('📋 Listing all modules...\n');
    const options = {
        hostname: 'localhost',
        port: 3000,
        path: '/api/modules',
        method: 'GET',
        headers: { 'Authorization': `Bearer ${TOKEN}` }
    };

    const response = await makeRequest(options);
    console.log('Response:', JSON.stringify(response, null, 2));
    return response.modules || [];
}

async function getModuleExecutions(moduleId) {
    console.log(`\n📊 Getting execution history for module ${moduleId}...\n`);
    const options = {
        hostname: 'localhost',
        port: 3000,
        path: `/api/modules/${moduleId}/executions`,
        method: 'GET',
        headers: { 'Authorization': `Bearer ${TOKEN}` }
    };

    const response = await makeRequest(options);
    console.log('Executions:', JSON.stringify(response, null, 2));
    return response.executions || [];
}

async function updateModuleStatus(moduleId, status) {
    console.log(`\n⚙️  Updating module ${moduleId} status to '${status}'...\n`);
    const postData = JSON.stringify({ status });
    const options = {
        hostname: 'localhost',
        port: 3000,
        path: `/api/modules/${moduleId}`,
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${TOKEN}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    const response = await makeRequest(options, postData);
    console.log('Updated module:', JSON.stringify(response, null, 2));
    return response.module;
}

async function updateModuleFrequency(moduleId, frequency) {
    console.log(`\n⏰ Updating module ${moduleId} frequency to '${frequency}'...\n`);
    const postData = JSON.stringify({ frequency });
    const options = {
        hostname: 'localhost',
        port: 3000,
        path: `/api/modules/${moduleId}`,
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${TOKEN}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    const response = await makeRequest(options, postData);
    console.log('Updated module:', JSON.stringify(response, null, 2));
    return response.module;
}

async function triggerModuleExecution(moduleId) {
    console.log(`\n▶️  Triggering manual execution for module ${moduleId}...\n`);
    const options = {
        hostname: 'localhost',
        port: 3000,
        path: `/api/modules/${moduleId}/execute`,
        method: 'POST',
        headers: { 'Authorization': `Bearer ${TOKEN}` }
    };

    const response = await makeRequest(options, '');
    console.log('Execution trigger response:', JSON.stringify(response, null, 2));
    return response;
}

async function runTests() {
    try {
        console.log('🧪 Testing Module Frontend Integration\n');
        console.log('='  .repeat(60));

        // 1. List modules
        const modules = await listModules();

        if (modules.length === 0) {
            console.log('\n⚠️  No modules found. Run test-module-api.js first to create a test module.');
            return;
        }

        const testModule = modules[0];
        console.log(`\n✅ Found ${modules.length} module(s). Testing with: ${testModule.name} (ID: ${testModule.id})`);

        // 2. Update status (toggle it)
        const newStatus = testModule.status === 'active' ? 'paused' : 'active';
        await updateModuleStatus(testModule.id, newStatus);

        // 3. Update frequency
        await updateModuleFrequency(testModule.id, 'daily');

        // 4. Get execution history
        const executions = await getModuleExecutions(testModule.id);
        console.log(`\n✅ Found ${executions.length} execution(s) for module ${testModule.id}`);

        // 5. Trigger manual execution
        console.log('\n🎯 Testing manual execution trigger...');
        await triggerModuleExecution(testModule.id);

        console.log('\n' + '='.repeat(60));
        console.log('✅ All tests completed successfully!');
        console.log('\n📝 Next steps:');
        console.log('   1. Open http://localhost:5173 (or your Vite dev server URL)');
        console.log('   2. Login with your credentials');
        console.log('   3. Navigate to the Modules page');
        console.log('   4. You should see the "Security Patcher" module');
        console.log('   5. Try:');
        console.log('      - Toggling the module on/off');
        console.log('      - Changing frequency in settings');
        console.log('      - Clicking "Run Now" button');
        console.log('      - Clicking "View History" button');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error);
        process.exit(1);
    }
}

runTests();
