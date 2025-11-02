/**
 * Connection Management Routes
 * Handles service connection configuration (e.g., primary repo for GitHub)
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const githubApi = require('../services/github-api');
const { decryptToken } = require('../utils/encryption');

/**
 * GET /api/connections/github/repos
 * Fetch list of user's GitHub repositories
 */
router.get('/github/repos', async (req, res) => {
  try {
    console.log(`[Connections API] Fetching GitHub repos for user ${req.user.id}`);

    // Get GitHub token
    const encryptedToken = await db.getGitHubToken(req.user.id);
    if (!encryptedToken) {
      return res.status(404).json({
        success: false,
        message: 'GitHub not connected. Please connect your GitHub account first.'
      });
    }

    const token = decryptToken(encryptedToken);

    // Fetch repositories from GitHub API
    const response = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Polsia-App'
      }
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const repos = await response.json();

    // Map to simplified format
    const repoList = repos.map(repo => ({
      id: repo.id,
      full_name: repo.full_name,
      name: repo.name,
      owner: repo.owner.login,
      description: repo.description,
      private: repo.private,
      updated_at: repo.updated_at,
      language: repo.language,
      default_branch: repo.default_branch
    }));

    console.log(`[Connections API] Fetched ${repoList.length} repositories`);

    res.json({
      success: true,
      repos: repoList
    });

  } catch (error) {
    console.error('[Connections API] Error fetching GitHub repos:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch GitHub repositories',
      error: error.message
    });
  }
});

/**
 * PUT /api/connections/github/primary-repo
 * Update primary repository for GitHub connection
 * Body: { owner: 'username', repo: 'repo-name', branch: 'main' }
 */
router.put('/github/primary-repo', async (req, res) => {
  try {
    const { owner, repo, branch } = req.body;

    console.log(`[Connections API] Setting primary repo for user ${req.user.id}: ${owner}/${repo}`);

    if (!owner || !repo) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: owner and repo'
      });
    }

    // Get existing GitHub connection
    const connection = await db.getServiceConnectionByName(req.user.id, 'github');
    if (!connection) {
      return res.status(404).json({
        success: false,
        message: 'GitHub not connected'
      });
    }

    // Update metadata with primary repo info
    const updatedMetadata = {
      ...connection.metadata,
      primary_repo: {
        owner,
        repo,
        branch: branch || 'main',
        full_name: `${owner}/${repo}`,
        updated_at: new Date().toISOString()
      }
    };

    // Save to database
    await db.updateServiceConnectionMetadata(req.user.id, 'github', updatedMetadata);

    console.log(`[Connections API] ✓ Primary repo updated successfully`);

    res.json({
      success: true,
      message: 'Primary repository updated successfully',
      primary_repo: updatedMetadata.primary_repo
    });

  } catch (error) {
    console.error('[Connections API] Error updating primary repo:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update primary repository',
      error: error.message
    });
  }
});

/**
 * GET /api/connections/github/primary-repo
 * Get current primary repository
 */
router.get('/github/primary-repo', async (req, res) => {
  try {
    const connection = await db.getServiceConnectionByName(req.user.id, 'github');

    if (!connection) {
      return res.status(404).json({
        success: false,
        message: 'GitHub not connected'
      });
    }

    const primaryRepo = connection.metadata?.primary_repo || null;

    res.json({
      success: true,
      primary_repo: primaryRepo
    });

  } catch (error) {
    console.error('[Connections API] Error fetching primary repo:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch primary repository',
      error: error.message
    });
  }
});

module.exports = router;
