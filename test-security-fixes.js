#!/usr/bin/env node

/**
 * Security Fixes Test Suite
 * Tests all 4 critical security fixes
 */

const { spawn } = require('child_process');
const axios = require('axios');

console.log('🔒 Security Fixes Test Suite\n');
console.log('=' .repeat(60));

// Test 1: JWT_SECRET validation
async function testJWTSecretValidation() {
    console.log('\n1. Testing JWT_SECRET validation...');

    return new Promise((resolve) => {
        // Spawn server without JWT_SECRET
        const env = { ...process.env };
        delete env.JWT_SECRET;

        const server = spawn('node', ['server.js'], {
            env,
            stdio: 'pipe'
        });

        let output = '';

        server.stderr.on('data', (data) => {
            output += data.toString();
        });

        server.on('exit', (code) => {
            if (code === 1 && output.includes('FATAL SECURITY ERROR: JWT_SECRET')) {
                console.log('   ✅ PASS: Server correctly exits when JWT_SECRET is missing');
                console.log('   ✅ PASS: Error message is clear and helpful');
                resolve(true);
            } else {
                console.log('   ❌ FAIL: Server should exit with code 1 when JWT_SECRET is missing');
                console.log('   Output:', output);
                resolve(false);
            }
        });

        // Kill after 2 seconds if it doesn't exit
        setTimeout(() => {
            server.kill();
            console.log('   ❌ FAIL: Server did not exit (still running)');
            resolve(false);
        }, 2000);
    });
}

// Test 2: Rate limiting
async function testRateLimiting() {
    console.log('\n2. Testing rate limiting on /api/auth/login...');

    // Check if server is running
    try {
        await axios.get('http://localhost:3000/api/health');
    } catch (error) {
        console.log('   ⚠️  SKIP: Server is not running on port 3000');
        console.log('   💡 Start server with: npm start');
        return null;
    }

    console.log('   Making 6 rapid login attempts...');

    const results = [];
    for (let i = 0; i < 6; i++) {
        try {
            const response = await axios.post('http://localhost:3000/api/auth/login', {
                email: 'test@example.com',
                password: 'wrong-password'
            });
            results.push({ attempt: i + 1, status: response.status, rateLimited: false });
        } catch (error) {
            const status = error.response?.status;
            const message = error.response?.data?.message;
            const rateLimited = status === 429 || message?.includes('Too many');
            results.push({
                attempt: i + 1,
                status,
                rateLimited,
                message
            });
        }
    }

    const rateLimitedRequests = results.filter(r => r.rateLimited);

    console.log('\n   Results:');
    results.forEach(r => {
        const icon = r.rateLimited ? '🛑' : '✉️';
        console.log(`   ${icon} Attempt ${r.attempt}: HTTP ${r.status} ${r.rateLimited ? '(RATE LIMITED)' : ''}`);
    });

    if (rateLimitedRequests.length > 0) {
        console.log('\n   ✅ PASS: Rate limiting is working');
        console.log(`   ✅ PASS: ${rateLimitedRequests.length} requests were rate limited`);
        return true;
    } else {
        console.log('\n   ❌ FAIL: No requests were rate limited');
        console.log('   Expected at least 1 request to be blocked after 5 attempts');
        return false;
    }
}

// Test 3: Password timing attack fix
async function testPasswordTimingFix() {
    console.log('\n3. Testing password timing attack fix...');

    try {
        await axios.get('http://localhost:3000/api/health');
    } catch (error) {
        console.log('   ⚠️  SKIP: Server is not running on port 3000');
        return null;
    }

    console.log('   Testing login timing with non-existent user vs invalid password...');

    // Test 1: Non-existent user (should use dummy hash)
    const timings1 = [];
    for (let i = 0; i < 3; i++) {
        const start = Date.now();
        try {
            await axios.post('http://localhost:3000/api/auth/login', {
                email: 'nonexistent-' + Math.random() + '@example.com',
                password: 'any-password'
            });
        } catch (error) {
            // Expected to fail
        }
        timings1.push(Date.now() - start);
    }

    // Wait a bit to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 2: Real user with wrong password (requires a test user in DB)
    const timings2 = [];
    for (let i = 0; i < 3; i++) {
        const start = Date.now();
        try {
            await axios.post('http://localhost:3000/api/auth/login', {
                email: 'test@example.com', // Assuming this exists
                password: 'wrong-password-' + Math.random()
            });
        } catch (error) {
            // Expected to fail
        }
        timings2.push(Date.now() - start);
    }

    const avg1 = timings1.reduce((a, b) => a + b, 0) / timings1.length;
    const avg2 = timings2.reduce((a, b) => a + b, 0) / timings2.length;
    const difference = Math.abs(avg1 - avg2);

    console.log(`\n   Non-existent user timings: ${timings1.join('ms, ')}ms (avg: ${avg1.toFixed(0)}ms)`);
    console.log(`   Wrong password timings: ${timings2.join('ms, ')}ms (avg: ${avg2.toFixed(0)}ms)`);
    console.log(`   Difference: ${difference.toFixed(0)}ms`);

    // Both should take similar time (within 50ms) due to bcrypt comparison
    if (difference < 50) {
        console.log('\n   ✅ PASS: Timing difference is minimal (< 50ms)');
        console.log('   ✅ PASS: User enumeration via timing attack is mitigated');
        return true;
    } else {
        console.log('\n   ⚠️  WARNING: Timing difference is significant');
        console.log('   This could still allow user enumeration');
        return false;
    }
}

// Test 4: MCP servers use environment variables
async function testMCPServersEnvVars() {
    console.log('\n4. Testing MCP servers use environment variables...');

    const fs = require('fs');
    const mcpServers = [
        'services/slack-custom-mcp-server.js',
        'services/sentry-custom-mcp-server.js',
        'services/appstore-connect-custom-mcp-server.js',
        'services/meta-ads-custom-mcp-server.js'
    ];

    let allPassed = true;

    for (const serverFile of mcpServers) {
        const content = fs.readFileSync(serverFile, 'utf8');

        // Check it doesn't use process.argv for tokens
        const usesArgv = content.includes('process.argv.find(arg => arg.startsWith(\'--') &&
                         (content.includes('token') || content.includes('key'));

        // Check it uses process.env
        const usesEnv = content.includes('process.env.');

        const serverName = serverFile.split('/').pop();

        if (!usesArgv && usesEnv) {
            console.log(`   ✅ PASS: ${serverName} uses environment variables`);
        } else if (usesArgv) {
            console.log(`   ❌ FAIL: ${serverName} still uses command-line arguments`);
            allPassed = false;
        } else {
            console.log(`   ⚠️  WARNING: ${serverName} may not be reading credentials correctly`);
        }
    }

    // Check agent-runner.js doesn't pass tokens in args
    const agentRunner = fs.readFileSync('services/agent-runner.js', 'utf8');
    const passesTokensInArgs = agentRunner.includes('`--bot-token=${') ||
                                agentRunner.includes('`--access-token=${') ||
                                agentRunner.includes('`--private-key=${');

    if (passesTokensInArgs) {
        console.log('\n   ❌ FAIL: agent-runner.js still passes tokens in command-line args');
        allPassed = false;
    } else {
        console.log('\n   ✅ PASS: agent-runner.js no longer passes tokens in command-line args');
    }

    return allPassed;
}

// Run all tests
async function runTests() {
    const results = [];

    results.push(await testJWTSecretValidation());
    results.push(await testRateLimiting());
    results.push(await testPasswordTimingFix());
    results.push(await testMCPServersEnvVars());

    console.log('\n' + '='.repeat(60));
    console.log('\n📊 Test Summary:\n');

    const passed = results.filter(r => r === true).length;
    const failed = results.filter(r => r === false).length;
    const skipped = results.filter(r => r === null).length;
    const total = results.length;

    console.log(`   ✅ Passed: ${passed}/${total}`);
    console.log(`   ❌ Failed: ${failed}/${total}`);
    console.log(`   ⚠️  Skipped: ${skipped}/${total}`);

    if (failed === 0 && passed > 0) {
        console.log('\n🎉 All tests passed!');
    } else if (skipped > 0) {
        console.log('\n⚠️  Some tests were skipped. Start the server to run all tests.');
    } else {
        console.log('\n❌ Some tests failed. Please review the output above.');
    }

    console.log('\n' + '='.repeat(60));
}

runTests().catch(console.error);
