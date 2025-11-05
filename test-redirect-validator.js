#!/usr/bin/env node

/**
 * Test Redirect Validator
 * Tests that server exits when FRONTEND_URL is invalid
 */

const { spawn } = require('child_process');

console.log('🔒 Testing Redirect Validator\n');

// Test 1: Server should start with valid FRONTEND_URL
console.log('1. Testing server starts with valid FRONTEND_URL...');
console.log('─'.repeat(70));

const validEnv = { ...process.env };
validEnv.FRONTEND_URL = 'http://localhost:5173'; // Valid URL

const validTest = spawn('node', ['server.js'], {
    env: validEnv,
    stdio: 'pipe'
});

let validOutput = '';
let validStarted = false;

validTest.stderr.on('data', (data) => {
    validOutput += data.toString();
    if (data.toString().includes('Polsia server running')) {
        validStarted = true;
    }
});

validTest.stdout.on('data', (data) => {
    validOutput += data.toString();
    if (data.toString().includes('Polsia server running')) {
        validStarted = true;
    }
});

setTimeout(() => {
    if (validStarted || validTest.exitCode === null) {
        console.log('   ✅ PASS: Server started with valid FRONTEND_URL');
        validTest.kill();

        // Test 2: Server should exit with invalid FRONTEND_URL
        console.log('\n2. Testing server exits with invalid FRONTEND_URL...');
        console.log('─'.repeat(70));

        const invalidEnv = { ...process.env };
        delete invalidEnv.FRONTEND_URL;
        invalidEnv.FRONTEND_URL = 'https://evil-hacker.com'; // NOT in whitelist

        const invalidTest = spawn('node', ['server.js'], {
            env: invalidEnv,
            stdio: 'pipe'
        });

        let invalidOutput = '';

        invalidTest.stderr.on('data', (data) => {
            invalidOutput += data.toString();
            process.stderr.write(data);
        });

        invalidTest.on('exit', (code) => {
            console.log(`\n   Server exited with code: ${code}`);

            if (code === 1) {
                console.log('   ✅ PASS: Server correctly exits with invalid FRONTEND_URL');

                if (invalidOutput.includes('FATAL SECURITY ERROR')) {
                    console.log('   ✅ PASS: Shows fatal security error');
                }
                if (invalidOutput.includes('FRONTEND_URL is not in the allowed origins')) {
                    console.log('   ✅ PASS: Clear error about invalid URL');
                }
                if (invalidOutput.includes('ALLOWED_ORIGINS')) {
                    console.log('   ✅ PASS: Shows whitelist for reference');
                }

                console.log('\n' + '='.repeat(70));
                console.log('🎉 Redirect validator is working correctly!');
                console.log('='.repeat(70));
                process.exit(0);
            } else {
                console.log('   ❌ FAIL: Server should exit with code 1');
                console.log('   Actual exit code:', code);
                process.exit(1);
            }
        });

        setTimeout(() => {
            if (!invalidTest.killed) {
                console.log('\n   ❌ FAIL: Server did not exit (still running)');
                invalidTest.kill();
                process.exit(1);
            }
        }, 3000);

    } else {
        console.log('   ❌ FAIL: Server did not start with valid URL');
        validTest.kill();
        process.exit(1);
    }
}, 4000);
