/**
 * Minimal SDK test
 */

require('dotenv').config();

async function testSDK() {
    try {
        console.log('Loading SDK...');
        const { query } = await import('@anthropic-ai/claude-agent-sdk');

        console.log('SDK loaded successfully');
        console.log('API Key set:', !!process.env.ANTHROPIC_API_KEY);
        console.log('Testing simple query...');

        const cwd = '/Users/benbroca/Documents/polsia/temp/test';

        // Create test directory
        const fs = require('fs').promises;
        await fs.mkdir(cwd, { recursive: true });

        const messages = [];

        for await (const message of query({
            prompt: 'Say hello',
            options: {
                maxTurns: 1,
                cwd,
                permissionMode: 'bypassPermissions'
            }
        })) {
            messages.push(message);
            console.log('Message:', message.type, message.subtype || '');
        }

        console.log('\n✅ Success! Got', messages.length, 'messages');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error(error.stack);
    } finally {
        process.exit(0);
    }
}

testSDK();
