/**
 * Claude Code SDK Demo Script
 * Run this to see the SDK in action!
 *
 * Usage: node test-claude-sdk.js
 */

require('dotenv').config();
const { executeTask, generateCode } = require('./services/claude-agent');
const path = require('path');
const fs = require('fs').promises;

// ANSI color codes for pretty output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(80));
  log(title, 'bright');
  console.log('='.repeat(80) + '\n');
}

async function demo() {
  logSection('🤖 CLAUDE CODE SDK DEMONSTRATION');

  // Check API key
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY.includes('your-api-key')) {
    log('❌ Error: ANTHROPIC_API_KEY not set in .env file', 'yellow');
    process.exit(1);
  }

  log('✅ API Key found', 'green');
  log(`🔧 Working directory: ${process.cwd()}`, 'cyan');

  // Create a temp directory for the demo
  const demoDir = path.join(process.cwd(), 'temp', `demo-${Date.now()}`);
  await fs.mkdir(demoDir, { recursive: true });
  log(`📁 Created demo directory: ${demoDir}`, 'cyan');

  // Demo 1: Generate a simple utility function
  logSection('📝 DEMO 1: Generate a Simple Utility Function');

  log('Prompt: "Create a JavaScript utility file with a function that validates email addresses"', 'blue');
  log('Starting code generation...', 'yellow');

  const result1 = await generateCode(
    'Create a JavaScript utility file with a function that validates email addresses. Include comments and examples.',
    demoDir
  );

  if (result1.success) {
    log('\n✅ Generation Complete!', 'green');
    log(`💰 Cost: $${result1.metadata.cost_usd.toFixed(6)}`, 'cyan');
    log(`⏱️  Duration: ${result1.metadata.duration_ms}ms`, 'cyan');
    log(`🔄 Turns: ${result1.metadata.num_turns}`, 'cyan');
    log(`📄 Files generated: ${Object.keys(result1.files).length}`, 'cyan');

    // Show generated files
    log('\n📁 Generated Files:', 'bright');
    for (const [filename, content] of Object.entries(result1.files)) {
      log(`\n  ${filename}:`, 'magenta');
      console.log('  ' + '-'.repeat(78));
      console.log(content.split('\n').map(line => '  ' + line).join('\n'));
      console.log('  ' + '-'.repeat(78));
    }
  } else {
    log(`❌ Error: ${result1.error}`, 'yellow');
  }

  // Demo 2: Execute a more complex task with progress tracking
  logSection('📝 DEMO 2: Execute Task with Progress Tracking');

  const demoDir2 = path.join(process.cwd(), 'temp', `demo2-${Date.now()}`);
  await fs.mkdir(demoDir2, { recursive: true });

  log('Prompt: "Create a simple Express.js REST API with two endpoints: GET /hello and POST /echo"', 'blue');
  log('Starting execution with progress tracking...', 'yellow');

  console.log('\n' + '-'.repeat(80));

  const result2 = await executeTask(
    'Create a simple Express.js REST API with two endpoints: GET /hello returns a greeting, and POST /echo returns back the request body',
    {
      cwd: demoDir2,
      maxTurns: 10,
      onProgress: (progress) => {
        // Show progress updates in real-time
        switch (progress.stage) {
          case 'initialized':
            log(`🎬 Initialized with model: ${progress.model}`, 'cyan');
            break;
          case 'thinking':
            log(`💭 Claude: ${progress.message.substring(0, 100)}...`, 'blue');
            break;
          case 'tool_use':
            log(`🔧 Using tool: ${progress.tool} (Turn ${progress.turnCount})`, 'magenta');
            break;
          case 'completed':
            log(`✅ Completed! Cost: $${progress.cost.toFixed(6)}`, 'green');
            break;
        }
      }
    }
  );

  console.log('-'.repeat(80) + '\n');

  if (result2.success) {
    log('✅ Task Execution Complete!', 'green');
    log(`💰 Total Cost: $${result2.metadata.cost_usd.toFixed(6)}`, 'cyan');
    log(`⏱️  Duration: ${result2.metadata.duration_ms}ms`, 'cyan');
    log(`🔄 Turns: ${result2.metadata.num_turns}`, 'cyan');
    log(`📄 Files generated: ${Object.keys(result2.files).length}`, 'cyan');

    log('\n📁 Generated Files:', 'bright');
    for (const filename of Object.keys(result2.files)) {
      log(`  • ${filename}`, 'magenta');
    }

    // Show one file as example
    if (Object.keys(result2.files).length > 0) {
      const firstFile = Object.keys(result2.files)[0];
      log(`\n📄 Preview of ${firstFile}:`, 'bright');
      console.log('  ' + '-'.repeat(78));
      const preview = result2.files[firstFile].split('\n').slice(0, 20).map(line => '  ' + line).join('\n');
      console.log(preview);
      if (result2.files[firstFile].split('\n').length > 20) {
        log('  ... (truncated)', 'cyan');
      }
      console.log('  ' + '-'.repeat(78));
    }
  } else {
    log(`❌ Error: ${result2.error}`, 'yellow');
  }

  // Summary
  logSection('📊 DEMONSTRATION SUMMARY');

  log('What just happened:', 'bright');
  log('✅ The Claude Code SDK executed real coding tasks', 'green');
  log('✅ Generated actual working code files', 'green');
  log('✅ Used Claude\'s code writing capabilities through the SDK', 'green');
  log('✅ Tracked progress and tool usage in real-time', 'green');

  log('\n💡 You can now use this SDK to:', 'bright');
  log('  • Build AI coding agents for your Modules', 'cyan');
  log('  • Generate code for users dynamically', 'cyan');
  log('  • Automate repetitive coding tasks', 'cyan');
  log('  • Create intelligent code editing tools', 'cyan');
  log('  • Integrate with MCPs for extended capabilities', 'cyan');

  log('\n📂 Generated files are in:', 'bright');
  log(`  ${demoDir}`, 'yellow');
  log(`  ${demoDir2}`, 'yellow');

  log('\n🚀 Next steps:', 'bright');
  log('  1. Check out the generated files', 'cyan');
  log('  2. Integrate the SDK into your agent modules', 'cyan');
  log('  3. Build custom agents using the executeTask() function', 'cyan');
  log('  4. Add database tracking for agent executions', 'cyan');

  logSection('✨ DEMO COMPLETE!');
}

// Run the demo
demo().catch(error => {
  console.error('\n❌ Demo failed:', error);
  process.exit(1);
});
