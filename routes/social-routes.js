const express = require('express');
const router = express.Router();
const syncService = require('../services/sync-service');
const postingService = require('../services/posting-service');
const {
  getProfilesByUserId,
  getSocialAccountsByUserId,
  getSocialAccountsByProfileId,
  getContentByUserId,
  getContentByAccountId,
  getContentById,
  getSocialAccountById,
  createContent,
  updateContent
} = require('../db');

// Sync with Late.dev - Manual trigger
router.post('/sync', async (req, res) => {
  try {
    const userId = req.user.id;
    const syncResults = await syncService.syncWithLate(userId);

    res.json({
      success: true,
      message: 'Sync completed',
      results: syncResults
    });
  } catch (error) {
    console.error('Error syncing with Late.dev:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync with Late.dev',
      error: error.message
    });
  }
});

// Get sync status
router.get('/sync-status', async (req, res) => {
  try {
    const userId = req.user.id;
    const status = await syncService.getSyncStatus(userId);

    res.json({
      success: true,
      status
    });
  } catch (error) {
    console.error('Error getting sync status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get sync status',
      error: error.message
    });
  }
});

// Get all profiles for the user
router.get('/profiles', async (req, res) => {
  try {
    const userId = req.user.id;
    const profiles = await getProfilesByUserId(userId);

    res.json({
      success: true,
      profiles
    });
  } catch (error) {
    console.error('Error getting profiles:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get profiles',
      error: error.message
    });
  }
});

// Get all social accounts for the user
router.get('/accounts', async (req, res) => {
  try {
    const userId = req.user.id;
    const { profileId } = req.query;

    let accounts;
    if (profileId) {
      accounts = await getSocialAccountsByProfileId(parseInt(profileId), userId);
    } else {
      accounts = await getSocialAccountsByUserId(userId);
    }

    res.json({
      success: true,
      accounts
    });
  } catch (error) {
    console.error('Error getting social accounts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get social accounts',
      error: error.message
    });
  }
});

// Get content history
router.get('/content', async (req, res) => {
  try {
    const userId = req.user.id;
    const { accountId, limit } = req.query;

    let content;
    if (accountId) {
      content = await getContentByAccountId(parseInt(accountId), userId, limit ? parseInt(limit) : 50);
    } else {
      content = await getContentByUserId(userId, limit ? parseInt(limit) : 50);
    }

    res.json({
      success: true,
      content
    });
  } catch (error) {
    console.error('Error getting content:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get content',
      error: error.message
    });
  }
});

// Get specific content by ID
router.get('/content/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const contentId = parseInt(req.params.id);

    const content = await getContentById(contentId, userId);

    if (!content) {
      return res.status(404).json({
        success: false,
        message: 'Content not found'
      });
    }

    res.json({
      success: true,
      content
    });
  } catch (error) {
    console.error('Error getting content:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get content',
      error: error.message
    });
  }
});

// Create content (and optionally post immediately)
router.post('/content', async (req, res) => {
  try {
    const userId = req.user.id;
    const { accountId, content_data, status, scheduled_for, post_now } = req.body;

    if (!accountId || !content_data) {
      return res.status(400).json({
        success: false,
        message: 'accountId and content_data are required'
      });
    }

    // Verify account belongs to user
    const account = await getSocialAccountById(accountId, userId);
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      });
    }

    // Create content
    const newContent = await createContent(accountId, {
      content_data,
      status: post_now ? 'QUEUED' : (status || 'DRAFT'),
      scheduled_for: scheduled_for || null
    });

    // Post immediately if requested
    if (post_now) {
      try {
        const postResult = await postingService.postContent(newContent.id, userId);
        return res.json({
          success: true,
          content: newContent,
          posted: true,
          postResult
        });
      } catch (postError) {
        return res.json({
          success: true,
          content: newContent,
          posted: false,
          postError: postError.message
        });
      }
    }

    res.json({
      success: true,
      content: newContent
    });
  } catch (error) {
    console.error('Error creating content:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create content',
      error: error.message
    });
  }
});

// Update content
router.put('/content/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const contentId = parseInt(req.params.id);
    const { content_data, status, scheduled_for } = req.body;

    // Verify content exists and belongs to user
    const existingContent = await getContentById(contentId, userId);
    if (!existingContent) {
      return res.status(404).json({
        success: false,
        message: 'Content not found'
      });
    }

    const updates = {};
    if (content_data !== undefined) updates.content_data = content_data;
    if (status !== undefined) updates.status = status;
    if (scheduled_for !== undefined) updates.scheduled_for = scheduled_for;

    const updatedContent = await updateContent(contentId, updates);

    res.json({
      success: true,
      content: updatedContent
    });
  } catch (error) {
    console.error('Error updating content:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update content',
      error: error.message
    });
  }
});

// Post content to social media
router.post('/content/:id/post', async (req, res) => {
  try {
    const userId = req.user.id;
    const contentId = parseInt(req.params.id);

    // Verify content exists and belongs to user
    const content = await getContentById(contentId, userId);
    if (!content) {
      return res.status(404).json({
        success: false,
        message: 'Content not found'
      });
    }

    // Post the content
    const result = await postingService.postContent(contentId, userId);

    if (result.success) {
      res.json({
        success: true,
        message: 'Content posted successfully',
        result
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to post content',
        reason: result.reason || result.error
      });
    }
  } catch (error) {
    console.error('Error posting content:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to post content',
      error: error.message
    });
  }
});

module.exports = router;
