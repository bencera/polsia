const express = require('express');
const router = express.Router();
const syncService = require('../services/sync-service');
const postingService = require('../services/posting-service');
const { handleMediaUpload } = require('../middleware/upload-middleware');
const { uploadMediaToR2 } = require('../services/r2-media-service');
const {
  getProfilesByUserId,
  getSocialAccountsByUserId,
  getSocialAccountsByProfileId,
  getContentByUserId,
  getContentByAccountId,
  getContentById,
  getSocialAccountById,
  createContent,
  updateContent,
  createMediaWithR2Data,
  getMediaByContentId
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
      message: 'Failed to sync with Late.dev'
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
      message: 'Failed to get sync status'
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
      message: 'Failed to get profiles'
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
      const parsedProfileId = parseInt(profileId);
      if (isNaN(parsedProfileId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid profile ID'
        });
      }
      accounts = await getSocialAccountsByProfileId(parsedProfileId, userId);
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
      message: 'Failed to get social accounts'
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
      const parsedAccountId = parseInt(accountId);
      if (isNaN(parsedAccountId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid account ID'
        });
      }
      const parsedLimit = limit ? parseInt(limit) : 50;
      if (limit && isNaN(parsedLimit)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid limit'
        });
      }
      content = await getContentByAccountId(parsedAccountId, userId, parsedLimit);
    } else {
      const parsedLimit = limit ? parseInt(limit) : 50;
      if (limit && isNaN(parsedLimit)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid limit'
        });
      }
      content = await getContentByUserId(userId, parsedLimit);
    }

    res.json({
      success: true,
      content
    });
  } catch (error) {
    console.error('Error getting content:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get content'
    });
  }
});

// Get specific content by ID
router.get('/content/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const contentId = parseInt(req.params.id);

    if (isNaN(contentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid content ID'
      });
    }

    const content = await getContentById(contentId, userId);

    if (!content) {
      return res.status(404).json({
        success: false,
        message: 'Content not found'
      });
    }

    // Also fetch associated media
    const media = await getMediaByContentId(contentId);

    res.json({
      success: true,
      content,
      media
    });
  } catch (error) {
    console.error('Error getting content:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get content'
    });
  }
});

// Get media for specific content
router.get('/content/:id/media', async (req, res) => {
  try {
    const userId = req.user.id;
    const contentId = parseInt(req.params.id);

    if (isNaN(contentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid content ID'
      });
    }

    // Verify content exists and belongs to user
    const content = await getContentById(contentId, userId);
    if (!content) {
      return res.status(404).json({
        success: false,
        message: 'Content not found'
      });
    }

    const media = await getMediaByContentId(contentId);

    res.json({
      success: true,
      media
    });
  } catch (error) {
    console.error('Error getting media:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get media'
    });
  }
});

// Create content (and optionally post immediately) with media upload support
router.post('/content', handleMediaUpload, async (req, res) => {
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

    // Parse content_data if it's a string (from multipart/form-data)
    let parsedContentData;
    try {
      parsedContentData = typeof content_data === 'string' ? JSON.parse(content_data) : content_data;
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        message: 'Invalid content_data format. Must be valid JSON.'
      });
    }

    // Create content first (without media URLs yet)
    const newContent = await createContent(accountId, {
      content_data: parsedContentData,
      status: post_now ? 'QUEUED' : (status || 'DRAFT'),
      scheduled_for: scheduled_for || null
    });

    // Upload files to R2 if any were provided
    const uploadedMedia = [];
    if (req.files && req.files.length > 0) {
      console.log(`Uploading ${req.files.length} file(s) to R2...`);

      for (const file of req.files) {
        try {
          // Upload to R2
          const r2Result = await uploadMediaToR2(
            file.buffer,
            file.originalname,
            file.mimetype,
            {
              userId: userId,
              accountId: accountId,
              contentId: newContent.id
            }
          );

          // Save media record to database
          const mediaRecord = await createMediaWithR2Data(newContent.id, r2Result);
          uploadedMedia.push(mediaRecord);

          console.log(`Successfully uploaded ${file.originalname} to R2: ${r2Result.url}`);
        } catch (uploadError) {
          console.error(`Failed to upload ${file.originalname}:`, uploadError);
          // Continue with other files, but log the error
        }
      }
    }

    // Post immediately if requested
    if (post_now) {
      try {
        const postResult = await postingService.postContent(newContent.id, userId);
        return res.json({
          success: true,
          content: newContent,
          media: uploadedMedia,
          posted: true,
          postResult
        });
      } catch (postError) {
        return res.json({
          success: true,
          content: newContent,
          media: uploadedMedia,
          posted: false,
          postError: postError.message
        });
      }
    }

    res.json({
      success: true,
      content: newContent,
      media: uploadedMedia
    });
  } catch (error) {
    console.error('Error creating content:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create content'
    });
  }
});

// Update content
router.put('/content/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const contentId = parseInt(req.params.id);
    const { content_data, status, scheduled_for } = req.body;

    if (isNaN(contentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid content ID'
      });
    }

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
      message: 'Failed to update content'
    });
  }
});

// Post content to social media
router.post('/content/:id/post', async (req, res) => {
  try {
    const userId = req.user.id;
    const contentId = parseInt(req.params.id);

    if (isNaN(contentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid content ID'
      });
    }

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
        message: 'Failed to post content'
      });
    }
  } catch (error) {
    console.error('Error posting content:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to post content'
    });
  }
});

module.exports = router;
