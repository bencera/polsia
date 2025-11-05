#!/usr/bin/env node

/**
 * Test JWT_SECRET validation in isolation
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('Testing JWT_SECRET validation...\n');

// Create a minimal test environment without JWT_SECRET
const env = {};

// Only copy safe environment variables
['PATH', 'NODE_ENV', 'HOME', 'USER'].forEach(key => {
    if (process.env[key]) {
        env[key] = process.env[key];
    }
});

// Start server without JWT_SECRET
const server = spawn('node', ['server.js'], {
    env,
    stdio: 'pipe',
    cwd: __dirname
});

let stderr = '';
let stdout = '';

server.stderr.on('data', (data) => {
    stderr += data.toString();
    process.stderr.write(data);
});

server.stdout.on('data', (data) => {
    stdout += data.toString();
    process.stdout.write(data);
});

server.on('exit', (code) => {
    console.log(`\n\nServer exited with code: ${code}`);

    if (code === 1) {
        console.log('✅ PASS: Server correctly exits when JWT_SECRET is missing');

        if (stderr.includes('FATAL SECURITY ERROR')) {
            console.log('✅ PASS: Shows fatal security error message');
        }

        if (stderr.includes('JWT_SECRET environment variable is not set')) {
            console.log('✅ PASS: Clear error message about missing JWT_SECRET');
        }

        if (stderr.includes('randomBytes')) {
            console.log('✅ PASS: Includes helpful instructions for generating secret');
        }

        console.log('\n🎉 JWT_SECRET validation is working correctly!');
    } else {
        console.log('❌ FAIL: Server should exit with code 1 when JWT_SECRET is missing');
        console.log('Actual exit code:', code);
    }
});

// Kill after 3 seconds if it doesn't exit
setTimeout(() => {
    if (!server.killed) {
        console.log('\n❌ FAIL: Server did not exit within 3 seconds');
        console.log('This means the server is still running despite missing JWT_SECRET');
        server.kill('SIGTERM');
        process.exit(1);
    }
}, 3000);
