/**
 * Direct Claude Agent SDK Test
 * Following the official documentation pattern
 */

require('dotenv').config();

async function testDirect() {
  console.log('🧪 Testing Claude Agent SDK directly...\n');

  // Dynamic import for ES module
  const { query } = await import('@anthropic-ai/claude-agent-sdk');

  console.log('✅ SDK imported successfully');
  console.log(`🔑 API Key: ${process.env.ANTHROPIC_API_KEY ? 'Set' : 'Missing'}\n`);

  const testDir = './temp/direct-test';
  console.log(`📁 Working directory: ${testDir}\n`);

  // Create working directory
  const fs = require('fs');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  console.log('🚀 Starting query...\n');

  try {
    const result = query({
      prompt: 'Create a file called greeting.js with a function that returns "Hello from Claude Agent SDK!"',
      options: {
        cwd: testDir,
        permissionMode: 'bypassPermissions', // Don't ask for permissions
        maxTurns: 5
      }
    });

    console.log('📡 Streaming messages:\n');
    console.log('='.repeat(80));

    for await (const message of result) {
      console.log(`\n[${message.type}]`);

      if (message.type === 'system') {
        if (message.subtype === 'init') {
          console.log(`  Model: ${message.model}`);
          console.log(`  Session: ${message.session_id}`);
        }
      }

      if (message.type === 'assistant' && message.message?.content) {
        message.message.content.forEach(content => {
          if (content.type === 'text') {
            console.log(`  Text: ${content.text.substring(0, 100)}...`);
          } else if (content.type === 'tool_use') {
            console.log(`  Tool: ${content.name}`);
            if (content.input?.file_path) {
              console.log(`    File: ${content.input.file_path}`);
            }
          }
        });
      }

      if (message.type === 'result') {
        console.log(`\n  Result: ${message.subtype}`);
        console.log(`  Cost: $${message.total_cost_usd || 0}`);
        console.log(`  Duration: ${message.duration_ms}ms`);
        console.log(`  Turns: ${message.num_turns}`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('\n✅ Query completed!');

    // Check for generated files
    console.log(`\n📂 Checking ${testDir} for generated files...\n`);
    const files = fs.readdirSync(testDir);

    if (files.length > 0) {
      console.log(`✅ Found ${files.length} file(s):`);
      files.forEach(file => {
        const content = fs.readFileSync(`${testDir}/${file}`, 'utf8');
        console.log(`\n📄 ${file}:`);
        console.log('─'.repeat(80));
        console.log(content);
        console.log('─'.repeat(80));
      });
    } else {
      console.log('❌ No files found');
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  }
}

testDirect();
