/**
 * Test Script: Analyze GitHub Repository with Claude Code SDK
 *
 * This script:
 * 1. Fetches a GitHub repository
 * 2. Uses Claude Code SDK to analyze the project
 * 3. Generates a comprehensive PROJECT_OVERVIEW.md file
 *
 * Usage:
 *   node test-repo-analyzer.js <github-repo-url> [user-id]
 *
 * Example:
 *   node test-repo-analyzer.js https://github.com/octocat/Hello-World 1
 */

require('dotenv').config();
const claudeAgent = require('./services/claude-agent');
const { getGitHubToken } = require('./db');
const { decryptToken } = require('./utils/encryption');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function analyzeRepository(repoUrl, userId = 1) {
  const startTime = Date.now();

  log('\n┌─────────────────────────────────────────────────────────┐', 'cyan');
  log('│   GitHub Repository Analyzer with Claude Code SDK      │', 'cyan');
  log('└─────────────────────────────────────────────────────────┘', 'cyan');

  log(`\n📦 Repository: ${repoUrl}`, 'blue');
  log(`👤 User ID: ${userId}`, 'blue');

  try {
    // Step 1: Verify GitHub connection
    log('\n[1/3] Checking GitHub authentication...', 'yellow');
    const encryptedToken = await getGitHubToken(userId);

    if (!encryptedToken) {
      log('❌ Error: No GitHub account connected for this user', 'red');
      log('   Please connect your GitHub account first at: http://localhost:5173/connections', 'yellow');
      process.exit(1);
    }

    const token = decryptToken(encryptedToken);
    log('✅ GitHub token retrieved successfully', 'green');

    // Step 2: Execute Claude Agent task on the repository
    log('\n[2/3] Analyzing repository with Claude Code SDK...', 'yellow');
    log('   This may take a minute or two...', 'cyan');

    const prompt = `
Please analyze this GitHub repository and create a comprehensive PROJECT_OVERVIEW.md file.

IMPORTANT: You MUST create a file named "PROJECT_OVERVIEW.md" in the repository root directory. Use the Write tool to create this file.

The PROJECT_OVERVIEW.md should include:

1. **Project Title and Description**
   - What is this project?
   - What problem does it solve?

2. **Key Features**
   - List the main features and capabilities

3. **Technology Stack**
   - Languages used
   - Frameworks and libraries
   - Tools and dependencies

4. **Project Structure**
   - Overview of the directory structure
   - Key files and their purposes

5. **Getting Started**
   - Installation instructions
   - How to run the project
   - Environment variables or configuration needed

6. **Architecture Overview**
   - High-level architecture diagram (if applicable)
   - How the components work together

7. **Code Quality & Practices**
   - Coding standards observed
   - Testing approach
   - Notable patterns or practices

8. **Potential Improvements**
   - Areas that could be enhanced
   - Technical debt
   - Suggestions for future development

Please make the documentation clear, professional, and helpful for developers who want to understand or contribute to this project.
`;

    let lastProgress = '';
    const result = await claudeAgent.executeTaskWithGitHub(
      userId,
      repoUrl,
      prompt,
      {
        maxTurns: 30, // Increased from 15 to handle complex repos
        skipCleanup: true, // Don't cleanup so we can inspect the files
        onProgress: (progress) => {
          const progressMsg = `   ${progress.stage}: ${progress.message || ''}`;
          if (progressMsg !== lastProgress) {
            log(progressMsg, 'cyan');
            lastProgress = progressMsg;
          }
        }
      }
    );

    // Step 3: Report results
    log('\n[3/3] Processing results...', 'yellow');

    if (!result.success) {
      log(`❌ Error: ${result.error}`, 'red');
      process.exit(1);
    }

    log('✅ Analysis completed successfully!', 'green');

    // Display results
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    log('\n┌─────────────────────────────────────────────────────────┐', 'green');
    log('│                     RESULTS                             │', 'green');
    log('└─────────────────────────────────────────────────────────┘', 'green');

    log(`\n📊 Metadata:`, 'blue');
    log(`   Duration: ${duration}s`, 'cyan');
    log(`   Claude turns: ${result.metadata.num_turns}`, 'cyan');
    log(`   Cost: $${result.metadata.cost_usd?.toFixed(6) || '0.000000'}`, 'cyan');
    log(`   Model: ${result.metadata.model || 'Unknown'}`, 'cyan');

    log(`\n📁 Generated Files:`, 'blue');
    const fileCount = Object.keys(result.files).length;
    log(`   Total files: ${fileCount}`, 'cyan');

    let overviewSaved = false;
    let overviewContent = null;

    if (fileCount > 0) {
      log('\n   Files collected from repo:', 'yellow');
      for (const [filePath, content] of Object.entries(result.files)) {
        const fileSize = (content.length / 1024).toFixed(2);

        // Save PROJECT_OVERVIEW.md to current directory
        if (filePath.includes('PROJECT_OVERVIEW.md') || filePath.includes('project-overview.md')) {
          const fs = require('fs');
          const outputPath = './PROJECT_OVERVIEW.md';
          fs.writeFileSync(outputPath, content);
          log(`   ✓ ${filePath} (${fileSize} KB) - SAVED to ${outputPath}`, 'green');
          overviewSaved = true;
          overviewContent = content;
        } else {
          log(`   ✓ ${filePath} (${fileSize} KB)`, 'cyan');
        }
      }
    }

    // If not found in collected files, check the repo directory
    if (!overviewSaved && result.metadata.repoDir) {
      const fs = require('fs');
      const path = require('path');
      const overviewPath = path.join(result.metadata.repoDir, 'PROJECT_OVERVIEW.md');

      try {
        if (fs.existsSync(overviewPath)) {
          overviewContent = fs.readFileSync(overviewPath, 'utf8');
          const outputPath = './PROJECT_OVERVIEW.md';
          fs.writeFileSync(outputPath, overviewContent);
          const fileSize = (overviewContent.length / 1024).toFixed(2);
          log(`\n   ✓ Found PROJECT_OVERVIEW.md in repo directory (${fileSize} KB)`, 'green');
          log(`   ✓ Saved to ${outputPath}`, 'green');
          overviewSaved = true;
        }
      } catch (err) {
        // File doesn't exist, that's okay
      }
    }

    log('\n✨ Repository analysis complete!', 'green');

    // Show repo directory location if preserved
    if (result.metadata.repoDir) {
      log(`\n📂 Repository preserved at: ${result.metadata.repoDir}`, 'blue');
      log(`   Run: ls -la "${result.metadata.repoDir}"  to inspect files\n`, 'cyan');
    }

    // Print the full PROJECT_OVERVIEW.md content at the end
    if (overviewSaved && overviewContent) {
      log('\n' + '═'.repeat(60), 'green');
      log('  📄 PROJECT_OVERVIEW.md - FULL CONTENT', 'bright');
      log('═'.repeat(60) + '\n', 'green');
      console.log(overviewContent);
      log('\n' + '═'.repeat(60), 'green');
      log('  ✅ PROJECT_OVERVIEW.md printed above', 'bright');
      log('═'.repeat(60) + '\n', 'green');
    } else {
      log(`\n⚠️  Note: PROJECT_OVERVIEW.md was not created by Claude.`, 'yellow');
      log(`   Claude may have analyzed the repo but chose not to create the file.`, 'yellow');
      log(`   This can happen with very large or complex repositories.\n`, 'yellow');
    }

  } catch (error) {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  log('\n❌ Error: Missing repository URL', 'red');
  log('\nUsage:', 'yellow');
  log('  node test-repo-analyzer.js <github-repo-url> [user-id]', 'cyan');
  log('\nExample:', 'yellow');
  log('  node test-repo-analyzer.js https://github.com/octocat/Hello-World 1', 'cyan');
  log('  node test-repo-analyzer.js https://github.com/microsoft/vscode-extension-samples\n', 'cyan');
  process.exit(1);
}

const repoUrl = args[0];
const userId = args[1] ? parseInt(args[1]) : 1;

// Validate repository URL
if (!repoUrl.includes('github.com')) {
  log('\n❌ Error: Invalid GitHub repository URL', 'red');
  log('   URL must be a GitHub repository (e.g., https://github.com/owner/repo)\n', 'yellow');
  process.exit(1);
}

// Run the analyzer
analyzeRepository(repoUrl, userId).catch(error => {
  log(`\n❌ Unhandled error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
