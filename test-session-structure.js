/**
 * Test to see what session structure Claude SDK creates
 */

require('dotenv').config();
const fs = require('fs').promises;

async function testSessionStructure() {
    try {
        console.log('Loading SDK...');
        const { query } = await import('@anthropic-ai/claude-agent-sdk');

        const cwd = '/Users/benbroca/Documents/polsia/temp/test-session';

        // Clean up and create fresh directory
        await fs.rm(cwd, { recursive: true, force: true });
        await fs.mkdir(cwd, { recursive: true });

        console.log('Creating initial session...');
        let sessionId = null;

        // First query to create a session
        for await (const message of query({
            prompt: 'Create a file called test.txt with the text "Hello World"',
            options: {
                maxTurns: 3,
                cwd,
                permissionMode: 'bypassPermissions'
            }
        })) {
            if (message.type === 'system' && message.subtype === 'init') {
                sessionId = message.session_id || message.sessionId;
                console.log('Session created:', sessionId);
            }
        }

        // List directory structure
        console.log('\n📁 Directory structure after session:');
        const { execSync } = require('child_process');
        const tree = execSync(`find "${cwd}" -type f -o -type d | head -n 50`, { encoding: 'utf8' });
        console.log(tree);

        // Try to resume
        console.log('\n🔄 Testing resume with session:', sessionId);

        for await (const message of query({
            prompt: 'List the files in the current directory',
            options: {
                maxTurns: 1,
                cwd,
                resume: sessionId,
                permissionMode: 'bypassPermissions'
            }
        })) {
            if (message.type === 'result') {
                console.log('Resume successful!');
            }
        }

        console.log('\n📁 Directory structure after resume:');
        const tree2 = execSync(`find "${cwd}" -type f -o -type d | head -n 50`, { encoding: 'utf8' });
        console.log(tree2);

    } catch (error) {
        console.error('\n❌ Error:', error.message);
    } finally {
        process.exit(0);
    }
}

testSessionStructure();
