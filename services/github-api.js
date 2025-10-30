/**
 * GitHub API Service
 * Wrapper for GitHub REST API interactions
 */

const axios = require('axios');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const GITHUB_API_BASE = 'https://api.github.com';

/**
 * Get authenticated user's GitHub profile
 * @param {string} token - GitHub access token
 * @returns {Promise<Object>} GitHub user object
 */
async function getUserInfo(token) {
  try {
    const response = await axios.get(`${GITHUB_API_BASE}/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json'
      }
    });

    return response.data;
  } catch (error) {
    console.error('[GitHub API] Error fetching user info:', error.message);
    throw new Error('Failed to fetch GitHub user information');
  }
}

/**
 * List repositories for the authenticated user
 * @param {string} token - GitHub access token
 * @param {Object} options - Query options
 * @param {string} options.visibility - 'all', 'public', or 'private'
 * @param {string} options.sort - 'created', 'updated', 'pushed', 'full_name'
 * @param {number} options.per_page - Results per page (max 100)
 * @param {number} options.page - Page number
 * @returns {Promise<Array>} Array of repository objects
 */
async function listRepositories(token, options = {}) {
  try {
    const params = {
      visibility: options.visibility || 'all',
      sort: options.sort || 'updated',
      per_page: options.per_page || 30,
      page: options.page || 1
    };

    const response = await axios.get(`${GITHUB_API_BASE}/user/repos`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json'
      },
      params
    });

    return response.data;
  } catch (error) {
    console.error('[GitHub API] Error listing repositories:', error.message);
    throw new Error('Failed to list GitHub repositories');
  }
}

/**
 * Get a specific repository
 * @param {string} token - GitHub access token
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @returns {Promise<Object>} Repository object
 */
async function getRepository(token, owner, repo) {
  try {
    const response = await axios.get(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json'
      }
    });

    return response.data;
  } catch (error) {
    console.error('[GitHub API] Error fetching repository:', error.message);
    throw new Error('Failed to fetch GitHub repository');
  }
}

/**
 * Get contents of a file or directory in a repository
 * @param {string} token - GitHub access token
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} path - Path to file or directory
 * @param {string} ref - Branch, tag, or commit (optional)
 * @returns {Promise<Object>} File/directory contents
 */
async function getContents(token, owner, repo, filePath, ref = null) {
  try {
    const params = ref ? { ref } : {};

    const response = await axios.get(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${filePath}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json'
        },
        params
      }
    );

    return response.data;
  } catch (error) {
    console.error('[GitHub API] Error fetching contents:', error.message);
    throw new Error('Failed to fetch repository contents');
  }
}

/**
 * Clone a repository to a local directory
 * @param {string} token - GitHub access token
 * @param {string} repoUrl - GitHub repository URL (https://github.com/owner/repo)
 * @param {string} targetDir - Local directory to clone into
 * @param {string} branch - Branch to clone (optional, defaults to default branch)
 * @returns {Promise<string>} Path to cloned repository
 */
async function cloneRepository(token, repoUrl, targetDir, branch = null) {
  try {
    console.log(`[GitHub API] Cloning repository: ${repoUrl}`);

    // Ensure target directory exists
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Convert HTTPS URL to include token for authentication
    // Example: https://x-access-token:TOKEN@github.com/owner/repo.git
    const urlParts = repoUrl.replace('https://github.com/', '').replace('.git', '');
    const authenticatedUrl = `https://x-access-token:${token}@github.com/${urlParts}.git`;

    // Build git clone command
    let cloneCmd = `git clone ${authenticatedUrl} "${targetDir}"`;
    if (branch) {
      cloneCmd += ` --branch ${branch}`;
    }

    // Execute git clone
    execSync(cloneCmd, {
      stdio: 'pipe',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
    });

    console.log(`[GitHub API] Repository cloned to: ${targetDir}`);

    return targetDir;
  } catch (error) {
    console.error('[GitHub API] Error cloning repository:', error.message);
    throw new Error('Failed to clone GitHub repository');
  }
}

/**
 * Create or update a file in a repository
 * @param {string} token - GitHub access token
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} path - File path in repository
 * @param {string} content - File content (will be base64 encoded)
 * @param {string} message - Commit message
 * @param {string} sha - File SHA (required for updates)
 * @param {string} branch - Branch name (optional, defaults to default branch)
 * @returns {Promise<Object>} Commit response
 */
async function createOrUpdateFile(token, owner, repo, filePath, content, message, sha = null, branch = null) {
  try {
    const data = {
      message,
      content: Buffer.from(content).toString('base64'),
      ...(sha && { sha }),
      ...(branch && { branch })
    };

    const response = await axios.put(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${filePath}`,
      data,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json'
        }
      }
    );

    return response.data;
  } catch (error) {
    console.error('[GitHub API] Error creating/updating file:', error.message);
    throw new Error('Failed to create or update file in GitHub repository');
  }
}

/**
 * Push changes from a local repository
 * @param {string} token - GitHub access token
 * @param {string} repoDir - Local repository directory
 * @param {string} commitMessage - Commit message
 * @param {string} branch - Branch to push to (optional, defaults to current branch)
 * @returns {Promise<void>}
 */
async function pushChanges(token, repoDir, commitMessage, branch = null) {
  try {
    console.log(`[GitHub API] Pushing changes from: ${repoDir}`);

    const gitOptions = { cwd: repoDir, stdio: 'pipe' };

    // Stage all changes
    execSync('git add .', gitOptions);

    // Commit changes
    execSync(`git commit -m "${commitMessage}"`, gitOptions);

    // Push to remote (using token for authentication)
    const pushCmd = branch ? `git push origin ${branch}` : 'git push';

    // Configure git to use the token
    execSync(`git config credential.helper store`, gitOptions);

    execSync(pushCmd, {
      ...gitOptions,
      env: {
        ...process.env,
        GIT_ASKPASS: 'echo',
        GIT_USERNAME: 'x-access-token',
        GIT_PASSWORD: token
      }
    });

    console.log(`[GitHub API] Changes pushed successfully`);
  } catch (error) {
    console.error('[GitHub API] Error pushing changes:', error.message);
    throw new Error('Failed to push changes to GitHub repository');
  }
}

/**
 * Create a new branch
 * @param {string} token - GitHub access token
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} branchName - Name of the new branch
 * @param {string} fromBranch - Source branch (defaults to default branch)
 * @returns {Promise<Object>} Branch reference
 */
async function createBranch(token, owner, repo, branchName, fromBranch = 'main') {
  try {
    // Get the SHA of the source branch
    const refResponse = await axios.get(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/refs/heads/${fromBranch}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json'
        }
      }
    );

    const sha = refResponse.data.object.sha;

    // Create new branch
    const response = await axios.post(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/refs`,
      {
        ref: `refs/heads/${branchName}`,
        sha
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json'
        }
      }
    );

    return response.data;
  } catch (error) {
    console.error('[GitHub API] Error creating branch:', error.message);
    throw new Error('Failed to create branch in GitHub repository');
  }
}

module.exports = {
  getUserInfo,
  listRepositories,
  getRepository,
  getContents,
  cloneRepository,
  createOrUpdateFile,
  pushChanges,
  createBranch
};
