/**
 * Simple Claude Agent SDK Test
 * Quick test to verify the SDK is working
 *
 * Usage: node test-simple.js
 */

require('dotenv').config();
const { generateCode } = require('./services/claude-agent');

async function quickTest() {
  console.log('🧪 Quick Test: Generating a simple function...\n');

  const result = await generateCode(
    'Create a simple hello.js file with a function that returns "Hello, World!"',
    './temp/quick-test'
  );

  if (result.success) {
    console.log('✅ Success!\n');
    console.log('Generated files:');
    for (const [filename, content] of Object.entries(result.files)) {
      console.log(`\n📄 ${filename}:`);
      console.log(content);
    }
    console.log(`\n💰 Cost: $${result.metadata.cost_usd.toFixed(6)}`);
    console.log(`⏱️  Time: ${result.metadata.duration_ms}ms`);
  } else {
    console.error('❌ Failed:', result.error);
  }
}

quickTest();
