const { getContentById, updateContent, getSocialAccountById, getMediaByContentId } = require('../db');
const lateApiService = require('./late-api-service');

class PostingService {
  async postToLateApi(account, content) {
    try {
      if (!account.late_account_id) {
        throw new Error(`Account ${account.account_handle} is not configured with Late.dev`);
      }

      const formattedContent = lateApiService.formatContentForPlatform(content, account.platform);

      // Prepare media array for Late.dev API
      const mediaArray = [];
      if (content.content_data && content.content_data.media) {
        // Handle single media or array of media
        const mediaList = Array.isArray(content.content_data.media)
          ? content.content_data.media
          : [content.content_data.media];

        for (const media of mediaList) {
          if (media && media.url) {
            mediaArray.push({
              url: media.url,
              type: media.type ? media.type.toLowerCase() : 'image' // 'image' or 'video'
            });
          }
        }
      }

      // Validate Instagram requires media
      if (account.platform.toLowerCase() === 'instagram' && mediaArray.length === 0) {
        throw new Error('Instagram posts require media content (images or videos)');
      }

      const postData = {
        content: formattedContent.text || content.content_data.text || content.content_data.caption || '',
        platforms: [{
          platform: account.platform.toLowerCase(),
          accountId: account.late_account_id
        }]
      };

      // Only add mediaItems if there are actual media items
      if (mediaArray.length > 0) {
        postData.mediaItems = mediaArray;
      }

      // Only add scheduledFor if it exists and is in the future
      if (content.scheduled_for && new Date(content.scheduled_for) > new Date()) {
        postData.scheduledFor = content.scheduled_for;
      }

      console.log('Sending to Late.dev API:', JSON.stringify(postData, null, 2));

      const response = await lateApiService.createPost(postData);

      return {
        success: true,
        postId: response.id,
        latePostId: response.id,
        response,
      };
    } catch (error) {
      console.error(`Failed to post via Late.dev API:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async postContent(contentId, userId) {
    try {
      const content = await getContentById(contentId, userId);

      if (!content) {
        throw new Error('Content not found');
      }

      if (content.status === 'POSTED') {
        console.log('Content already posted');
        return { success: false, reason: 'Already posted' };
      }

      const account = await getSocialAccountById(content.account_id, userId);

      if (!account) {
        throw new Error('Account not found');
      }

      if (!account.is_active) {
        console.log('Account is not active');
        return { success: false, reason: 'Account inactive' };
      }

      const result = await this.postToLateApi(account, content);

      if (result.success) {
        const updateData = {
          status: 'POSTED',
          posted_at: new Date(),
        };

        if (result.latePostId) {
          updateData.late_post_id = result.latePostId;
        }

        await updateContent(contentId, updateData);

        console.log(`Content ${contentId} posted successfully`);
        return result;
      } else {
        // Update status to FAILED on error
        await updateContent(contentId, { status: 'FAILED' });
        throw new Error(result.error || 'Failed to post content');
      }
    } catch (error) {
      console.error('Error posting content:', error);

      // Update content status to FAILED
      try {
        await updateContent(contentId, { status: 'FAILED' });
      } catch (updateError) {
        console.error('Error updating content status to FAILED:', updateError);
      }

      throw error;
    }
  }

  // Format content for specific platform requirements
  formatContentForPost(contentData, platform) {
    const formatted = {
      text: contentData.text || contentData.caption || '',
    };

    // Add platform-specific formatting
    if (platform === 'TWITTER' && contentData.thread) {
      formatted.thread = contentData.thread;
    }

    if (platform === 'THREADS' && contentData.thread) {
      formatted.thread = contentData.thread;
    }

    return formatted;
  }
}

module.exports = new PostingService();
