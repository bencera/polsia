#!/usr/bin/env node

/**
 * Autonomous Repository Update Script
 *
 * This script demonstrates the full Polsia autonomous agent workflow:
 * 1. Authenticates with Polsia API
 * 2. Triggers Claude Code SDK agent to modify a GitHub repository
 * 3. Automatically commits and pushes changes via GitHub integration
 *
 * Usage:
 *   node scripts/autonomous-repo-update.js
 *
 * Environment Variables:
 *   POLSIA_API_URL - Polsia backend URL (default: http://localhost:3001)
 *   POLSIA_JWT_TOKEN - JWT authentication token
 */

const https = require('https');
const http = require('http');

// Configuration
const API_URL = process.env.POLSIA_API_URL || 'http://localhost:3000';
const JWT_TOKEN = process.env.POLSIA_JWT_TOKEN;

// Task configuration
const REPO_URL = 'https://github.com/Polsia-Inc/newco-app';
const TASK_PROMPT = `Find and modify the footer in the landing page HTML file. Look for the text "2025 Polsia" and change it to "2025 Polsia Inc." Make sure to preserve all other formatting and styling.`;
const COMMIT_MESSAGE = 'Big Update';
const BRANCH = 'main';

/**
 * Make HTTP request with promise wrapper
 */
function makeRequest(url, options, postData = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;

    const reqOptions = {
      ...options,
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
    };

    const req = client.request(reqOptions, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);

    if (postData) {
      req.write(JSON.stringify(postData));
    }

    req.end();
  });
}

/**
 * Execute autonomous task on GitHub repository
 */
async function executeAutonomousTask() {
  console.log('🤖 Polsia Autonomous Agent Task Execution\n');
  console.log('=' .repeat(60));
  console.log(`Repository: ${REPO_URL}`);
  console.log(`Branch: ${BRANCH}`);
  console.log(`Task: ${TASK_PROMPT.substring(0, 80)}...`);
  console.log('=' .repeat(60));
  console.log('');

  // Check for JWT token
  if (!JWT_TOKEN) {
    console.error('❌ Error: POLSIA_JWT_TOKEN environment variable not set');
    console.error('\nPlease set your JWT token:');
    console.error('  export POLSIA_JWT_TOKEN="your-jwt-token-here"');
    console.error('\nYou can get a token by logging into Polsia and checking your browser\'s localStorage or network requests.');
    process.exit(1);
  }

  console.log('📡 Connecting to Polsia API...');
  console.log(`   API URL: ${API_URL}`);
  console.log('');

  // Prepare request payload
  const payload = {
    repoUrl: REPO_URL,
    prompt: TASK_PROMPT,
    autoPush: true,
    commitMessage: COMMIT_MESSAGE,
    branch: BRANCH,
    maxTurns: 10
  };

  try {
    console.log('🚀 Launching Claude Code SDK Agent...');
    console.log('   This may take 1-3 minutes depending on task complexity');
    console.log('');

    const startTime = Date.now();

    // Make API request
    const result = await makeRequest(
      `${API_URL}/api/agent/github/execute`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${JWT_TOKEN}`,
          'Content-Type': 'application/json'
        }
      },
      payload
    );

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('✅ Task Completed!\n');
    console.log('=' .repeat(60));
    console.log('EXECUTION SUMMARY');
    console.log('=' .repeat(60));
    console.log(`Duration: ${duration} seconds`);
    console.log(`Turns: ${result.metadata?.turns || 'N/A'}`);
    console.log(`Cost: $${result.metadata?.totalCost?.toFixed(4) || 'N/A'}`);
    console.log('');

    // Show files modified
    if (result.files && result.files.length > 0) {
      console.log(`📝 Files Modified (${result.files.length}):`);
      result.files.forEach((file, idx) => {
        console.log(`   ${idx + 1}. ${file.path}`);
      });
      console.log('');
    }

    // Show push status
    if (result.metadata?.pushed) {
      console.log('✅ Changes successfully pushed to GitHub!');
      console.log(`   Commit: ${COMMIT_MESSAGE}`);
      console.log(`   Branch: ${BRANCH}`);
      console.log(`   Repository: ${REPO_URL}`);
    } else {
      console.log('⚠️  Changes were NOT pushed to GitHub');
      console.log('   (autoPush may be disabled or push failed)');
    }

    console.log('');
    console.log('=' .repeat(60));
    console.log('🎉 Autonomous task execution completed successfully!');
    console.log('=' .repeat(60));

    // Show sample of agent messages if available
    if (result.messages && result.messages.length > 0) {
      console.log('\n📋 Agent Activity Log (last 5 messages):');
      const lastMessages = result.messages.slice(-5);
      lastMessages.forEach((msg, idx) => {
        if (msg.type === 'assistant' && msg.content) {
          const preview = msg.content.substring(0, 100);
          console.log(`   ${idx + 1}. ${preview}${msg.content.length > 100 ? '...' : ''}`);
        }
      });
    }

  } catch (error) {
    console.error('\n❌ Error executing autonomous task:');
    console.error(`   ${error.message}`);

    if (error.message.includes('401') || error.message.includes('403')) {
      console.error('\n💡 Authentication failed. Please check:');
      console.error('   1. Your JWT token is valid and not expired');
      console.error('   2. You have connected your GitHub account to Polsia');
      console.error('   3. You have access to the specified repository');
    } else if (error.message.includes('ECONNREFUSED')) {
      console.error('\n💡 Cannot connect to Polsia API. Please check:');
      console.error('   1. The Polsia backend server is running');
      console.error(`   2. API URL is correct: ${API_URL}`);
    }

    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  executeAutonomousTask().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { executeAutonomousTask };
