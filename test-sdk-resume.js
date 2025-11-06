/**
 * Test SDK with session resumption
 */

require('dotenv').config();

async function testSDKResume() {
    try {
        console.log('Loading SDK...');
        const { query } = await import('@anthropic-ai/claude-agent-sdk');

        console.log('SDK loaded successfully');

        const sessionId = '63a0cc23-3d4a-4b38-a537-0fc8b535bfb8';
        const cwd = '/Users/benbroca/Documents/polsia/temp/agent-sessions/agent-5';

        console.log('Testing resume of session:', sessionId);
        console.log('Working directory:', cwd);

        const messages = [];

        for await (const message of query({
            prompt: 'What is 2+2?',
            options: {
                maxTurns: 1,
                cwd,
                resume: sessionId,
                permissionMode: 'bypassPermissions'
            }
        })) {
            messages.push(message);
            console.log('Message:', message.type, message.subtype || '');
            if (message.type === 'error') {
                console.error('Error message:', message);
            }
        }

        console.log('\n✅ Success! Got', messages.length, 'messages');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error('Stack:', error.stack);
    } finally {
        process.exit(0);
    }
}

testSDKResume();
