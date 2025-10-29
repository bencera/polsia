#!/usr/bin/env node

/**
 * Test GitHub Integration with Claude Agent SDK
 *
 * This script demonstrates:
 * 1. Connecting to GitHub OAuth (manual step)
 * 2. Reading code from a GitHub repository
 * 3. Executing AI tasks on GitHub repositories
 * 4. Auto-committing and pushing changes back to GitHub
 *
 * Prerequisites:
 * - User must have GitHub account connected via OAuth
 * - GitHub token must be stored in database
 * - User must have access to the repository
 */

require('dotenv').config();
const {
  executeTaskWithGitHub,
  readGitHubRepository
} = require('./services/claude-agent');

async function testGitHubIntegration() {
  console.log('\n=== Testing GitHub Integration with Claude Agent ===\n');

  // NOTE: In a real scenario, you would get this from the authenticated user
  // For testing, you need to:
  // 1. Login to your Polsia account
  // 2. Go to /connections and connect your GitHub account
  // 3. Get your user ID from the database

  const TEST_USER_ID = 1; // Replace with actual user ID
  const TEST_REPO_URL = 'https://github.com/YOUR_USERNAME/test-repo'; // Replace with actual repo

  console.log('⚠️  IMPORTANT: Update TEST_USER_ID and TEST_REPO_URL before running!\n');

  try {
    // Test 1: Read repository contents
    console.log('📖 Test 1: Reading repository contents');
    console.log('----------------------------------------\n');

    const readResult = await readGitHubRepository(
      TEST_USER_ID,
      TEST_REPO_URL,
      null, // Read entire repo
      { branch: 'main' }
    );

    if (readResult.success) {
      console.log('✅ Successfully read repository');
      console.log(`Repository: ${readResult.repository.full_name}`);
      console.log(`Description: ${readResult.repository.description || 'N/A'}`);
      console.log(`Files found: ${Object.keys(readResult.files).length}`);
      console.log('\nFile list:');
      Object.keys(readResult.files).forEach(file => {
        console.log(`  - ${file}`);
      });
    } else {
      console.error('❌ Failed to read repository:', readResult.error);
      return;
    }

    console.log('\n');

    // Test 2: Execute a simple task (without pushing)
    console.log('🤖 Test 2: Executing AI task on repository (dry run)');
    console.log('-----------------------------------------------------\n');

    const dryRunResult = await executeTaskWithGitHub(
      TEST_USER_ID,
      TEST_REPO_URL,
      'Add a README.md file with a brief description of this repository. Include a "Features" section and a "Getting Started" section.',
      {
        autoPush: false, // Don't push changes
        maxTurns: 5
      }
    );

    if (dryRunResult.success) {
      console.log('✅ Task completed successfully');
      console.log(`Duration: ${dryRunResult.metadata.total_duration_ms}ms`);
      console.log(`Cost: $${dryRunResult.metadata.cost_usd?.toFixed(6) || '0'}`);
      console.log(`Turns: ${dryRunResult.metadata.num_turns}`);
      console.log('\nGenerated/Modified files:');
      Object.keys(dryRunResult.files).forEach(file => {
        console.log(`  - ${file}`);
      });
      console.log('\n⚠️  Changes were NOT pushed (autoPush: false)');
    } else {
      console.error('❌ Task failed:', dryRunResult.error);
      return;
    }

    console.log('\n');

    // Test 3: Execute task with auto-push (commented out for safety)
    console.log('🚀 Test 3: Execute task with auto-push (COMMENTED OUT)');
    console.log('-------------------------------------------------------\n');
    console.log('⚠️  This test is commented out to prevent accidental pushes.');
    console.log('To enable, uncomment the code below and update the prompt.\n');

    /*
    const pushResult = await executeTaskWithGitHub(
      TEST_USER_ID,
      TEST_REPO_URL,
      'Add a comment to the main function explaining what it does',
      {
        autoPush: true,
        commitMessage: 'Add documentation comments (by Polsia AI Agent)',
        branch: 'main',
        createBranch: true,
        newBranchName: 'polsia-ai-docs',
        maxTurns: 5
      }
    );

    if (pushResult.success) {
      console.log('✅ Task completed and pushed successfully');
      console.log(`Branch: ${pushResult.metadata.branch}`);
      console.log(`Pushed: ${pushResult.metadata.pushed}`);
      console.log(`Commit message: ${pushResult.metadata.commit_message}`);
    } else {
      console.error('❌ Task failed:', pushResult.error);
    }
    */

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    console.error(error);
  }
}

// Example: Read a specific file from repository
async function testReadSpecificFile() {
  console.log('\n=== Testing Read Specific File ===\n');

  const TEST_USER_ID = 1;
  const TEST_REPO_URL = 'https://github.com/YOUR_USERNAME/test-repo';
  const FILE_PATH = 'package.json'; // Replace with actual file

  try {
    const result = await readGitHubRepository(
      TEST_USER_ID,
      TEST_REPO_URL,
      FILE_PATH,
      { branch: 'main' }
    );

    if (result.success) {
      console.log('✅ Successfully read file');
      console.log(`File: ${result.path}`);
      console.log(`Content length: ${result.content.length} bytes`);
      console.log('\nContent preview:');
      console.log(result.content.substring(0, 500));
      console.log('...');
    } else {
      console.error('❌ Failed to read file:', result.error);
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run tests
if (require.main === module) {
  console.log('\n⚠️  SETUP INSTRUCTIONS:');
  console.log('1. Login to Polsia at http://localhost:3000/login');
  console.log('2. Go to /connections and connect your GitHub account');
  console.log('3. Create a test repository on GitHub');
  console.log('4. Update TEST_USER_ID and TEST_REPO_URL in this script');
  console.log('5. Run this script: node test-github-integration.js\n');

  testGitHubIntegration()
    .then(() => {
      console.log('\n✅ All tests completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Tests failed:', error);
      process.exit(1);
    });
}

module.exports = {
  testGitHubIntegration,
  testReadSpecificFile
};
