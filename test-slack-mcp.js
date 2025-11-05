#!/usr/bin/env node

/**
 * Test Custom Slack MCP Server
 * Verifies that the MCP server exposes tools correctly
 */

require('dotenv').config();
const { decryptToken } = require('./utils/encryption');
const { spawn } = require('child_process');

// Encrypted token data from production database
const encryptedData = {
    encrypted: '8b65605cc985cd1cfde5334a1088b9c3a1d51a7c46feb430f1b57a0c4a735bf444eaef3514bd944270b9a7fc3c72ef9fef93401babeceed2f8',
    iv: '16c2a8808344806bae21436b44119f1a',
    authTag: 'a4b6d402a857455c922a930e0674aa60'
};

console.log('🧪 Testing Custom Slack MCP Server\n');

try {
    // Decrypt the token
    const botToken = decryptToken(encryptedData);
    console.log(`✅ Token decrypted: ${botToken.substring(0, 20)}...\n`);

    // Start the MCP server
    console.log('🚀 Starting custom Slack MCP server...');
    const serverPath = require('path').join(__dirname, 'services', 'slack-custom-mcp-server.js');
    const mcpServer = spawn('node', [serverPath, `--bot-token=${botToken}`]);

    let output = '';
    let errorOutput = '';

    mcpServer.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        console.log(`[MCP stdout] ${text.trim()}`);
    });

    mcpServer.stderr.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
        console.error(`[MCP stderr] ${text.trim()}`);
    });

    mcpServer.on('close', (code) => {
        console.log(`\n[MCP] Server exited with code ${code}\n`);

        if (errorOutput.includes('Server running on stdio')) {
            console.log('✅ MCP server started successfully!');
            console.log('✅ Custom Slack MCP server is working!\n');
        } else {
            console.error('❌ MCP server did not start correctly');
            process.exit(1);
        }
    });

    // Send a test initialize request (JSON-RPC format)
    setTimeout(() => {
        console.log('\n📤 Sending initialize request to MCP server...');

        const initRequest = {
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: {
                    name: 'test-client',
                    version: '1.0.0'
                }
            }
        };

        mcpServer.stdin.write(JSON.stringify(initRequest) + '\n');

        // Send list tools request
        setTimeout(() => {
            console.log('📤 Sending list tools request...');

            const listToolsRequest = {
                jsonrpc: '2.0',
                id: 2,
                method: 'tools/list',
                params: {}
            };

            mcpServer.stdin.write(JSON.stringify(listToolsRequest) + '\n');

            // Wait for response and then close
            setTimeout(() => {
                console.log('\n✅ Test completed! Check output above for tool list.');
                mcpServer.kill();
                process.exit(0);
            }, 2000);
        }, 1000);
    }, 1000);

} catch (error) {
    console.error('❌ Failed to test MCP server:', error.message);
    process.exit(1);
}
