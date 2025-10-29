/**
 * Quick script to list GitHub repositories for a user
 */

require('dotenv').config();
const { getGitHubToken } = require('./db');
const { decryptToken } = require('./utils/encryption');
const githubApi = require('./services/github-api');

async function listRepos(userId = 1) {
  try {
    console.log('\n🔍 Fetching your GitHub repositories...\n');

    // Get GitHub token
    const encryptedToken = await getGitHubToken(userId);
    if (!encryptedToken) {
      console.error('❌ No GitHub account connected');
      process.exit(1);
    }

    const token = decryptToken(encryptedToken);

    // Fetch repositories
    const repos = await githubApi.listRepositories(token, {
      sort: 'updated',
      per_page: 50
    });

    console.log(`📦 Found ${repos.length} repositories:\n`);

    repos.forEach((repo, index) => {
      console.log(`${index + 1}. ${repo.full_name}`);
      console.log(`   ${repo.description || 'No description'}`);
      console.log(`   🔗 ${repo.html_url}`);
      console.log(`   ⭐ ${repo.stargazers_count} stars | 🍴 ${repo.forks_count} forks | Updated: ${new Date(repo.updated_at).toLocaleDateString()}`);
      console.log(`   Language: ${repo.language || 'Unknown'} | ${repo.private ? '🔒 Private' : '🌍 Public'}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

const userId = process.argv[2] ? parseInt(process.argv[2]) : 1;
listRepos(userId);
