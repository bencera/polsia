#!/usr/bin/env node

/**
 * Test the Reports MCP Server
 * This spawns the MCP server and sends it test commands
 */

const { spawn } = require('child_process');
const path = require('path');

const TEST_USER_ID = 1;
const serverPath = path.join(__dirname, 'services', 'reports-custom-mcp-server.js');

console.log('🧪 Testing Reports MCP Server\n');
console.log(`Starting MCP server: ${serverPath}`);
console.log(`User ID: ${TEST_USER_ID}\n`);

// Spawn the MCP server
const mcpServer = spawn('node', [serverPath, `--user-id=${TEST_USER_ID}`]);

let responseBuffer = '';

mcpServer.stdout.on('data', (data) => {
    responseBuffer += data.toString();

    // Try to parse JSON-RPC responses
    const lines = responseBuffer.split('\n');
    for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (line) {
            try {
                const response = JSON.parse(line);
                console.log('📥 Response:', JSON.stringify(response, null, 2));
            } catch (e) {
                // Not JSON, skip
            }
        }
    }
    responseBuffer = lines[lines.length - 1];
});

mcpServer.stderr.on('data', (data) => {
    console.log('📢 Server:', data.toString().trim());
});

mcpServer.on('close', (code) => {
    console.log(`\n✅ MCP server exited with code ${code}`);
    process.exit(code);
});

// Wait for server to initialize
setTimeout(() => {
    console.log('\n📤 Test 1: List available tools...\n');

    const listToolsRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {}
    };

    mcpServer.stdin.write(JSON.stringify(listToolsRequest) + '\n');

    setTimeout(() => {
        console.log('\n📤 Test 2: Create a test report...\n');

        const createReportRequest = {
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: {
                name: 'create_report',
                arguments: {
                    name: 'MCP Test Report',
                    report_type: 'test_report',
                    report_date: new Date().toISOString().split('T')[0],
                    content: '# MCP Test Report\n\nThis report was created via MCP server!',
                    metadata: { test: true, method: 'mcp_direct' }
                }
            }
        };

        mcpServer.stdin.write(JSON.stringify(createReportRequest) + '\n');

        setTimeout(() => {
            console.log('\n📤 Test 3: Query reports...\n');

            const queryReportsRequest = {
                jsonrpc: '2.0',
                id: 3,
                method: 'tools/call',
                params: {
                    name: 'query_reports',
                    arguments: {
                        limit: 5
                    }
                }
            };

            mcpServer.stdin.write(JSON.stringify(queryReportsRequest) + '\n');

            setTimeout(() => {
                console.log('\n✅ Tests complete! Shutting down server...\n');
                mcpServer.kill();
            }, 2000);
        }, 2000);
    }, 2000);
}, 1000);
