#!/usr/bin/env node

/**
 * Quick test to see if server starts with our changes
 */

const { spawn } = require('child_process');

console.log('Testing server startup...\n');

const server = spawn('node', ['server.js'], {
    stdio: 'pipe'
});

server.stdout.on('data', (data) => {
    console.log('[STDOUT]', data.toString());
});

server.stderr.on('data', (data) => {
    console.log('[STDERR]', data.toString());
});

server.on('exit', (code) => {
    console.log(`\nServer exited with code: ${code}`);
    process.exit(code);
});

// Kill after 5 seconds
setTimeout(() => {
    console.log('\nStopping server...');
    server.kill();
}, 5000);
