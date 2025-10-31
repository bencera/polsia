require('dotenv').config();
const axios = require('axios');

class LateApiService {
  constructor() {
    this.apiKey = process.env.LATE_API_KEY;
    this.apiUrl = process.env.LATE_API_URL || 'https://getlate.dev/api';

    if (!this.apiKey) {
      console.warn('LATE_API_KEY not configured. Late.dev API calls will fail.');
    }
  }

  async makeRequest(endpoint, method = 'GET', body = null) {
    const url = `${this.apiUrl}${endpoint}`;
    const options = {
      method,
      url,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    };

    if (body && method !== 'GET') {
      options.data = body;
    }

    try {
      const response = await axios(options);
      return response.data;
    } catch (error) {
      const errorData = error.response?.data || {};
      console.error('Late.dev API request failed:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        error: errorData,
        endpoint: endpoint,
        method: method,
        body: body
      });
      throw new Error(
        errorData.message || errorData.error ||
        `Late.dev API error: ${error.response?.status} ${error.response?.statusText || error.message}`
      );
    }
  }

  async createPost(postData) {
    const { content, platforms, scheduledFor, mediaItems } = postData;

    const payload = {
      content: content || '',
      platforms: platforms // Array of {platform, accountId} objects
    };

    if (scheduledFor) {
      payload.scheduledFor = scheduledFor;
    }

    if (mediaItems && mediaItems.length > 0) {
      payload.mediaItems = mediaItems;
    }

    return this.makeRequest('/v1/posts', 'POST', payload);
  }

  async uploadMedia(file, fileSize) {
    // Note: This is a placeholder for future media upload implementation
    // Direct upload for files < 5MB, multipart for larger files
    const uploadMethod = fileSize > 5 * 1024 * 1024 ? 'multipart' : 'direct';

    if (uploadMethod === 'direct') {
      // For direct upload, would need FormData implementation
      throw new Error('Direct media upload not yet implemented - use media URLs instead');
    } else {
      const initResponse = await this.makeRequest('/v1/media/multipart', 'POST', {
        filename: file.name,
        size: fileSize,
      });

      console.log('Multipart upload initiated:', initResponse);
      throw new Error('Multipart upload not fully implemented yet');
    }
  }

  async getAccounts(profileId = null) {
    try {
      // Get all accounts
      const response = await this.makeRequest('/v1/accounts');
      const allAccounts = response.accounts || [];

      // Filter by profileId if provided
      if (profileId) {
        const filteredAccounts = allAccounts.filter(account => {
          // Check if the account's profileId matches (handle both nested and direct structures)
          const accountProfileId = account.profileId?._id || account.profileId || account.profile_id;
          return accountProfileId === profileId;
        });
        console.log(`Filtered ${filteredAccounts.length} accounts for profile ${profileId} from ${allAccounts.length} total`);
        return filteredAccounts;
      }

      return allAccounts;
    } catch (error) {
      console.error('Error fetching accounts:', error);
      return [];
    }
  }

  async getAccount(accountId) {
    return this.makeRequest(`/v1/accounts/${accountId}`);
  }

  async getProfiles() {
    try {
      const response = await this.makeRequest('/v1/profiles');
      // Late.dev API returns { profiles: [...] }
      return response.profiles || [];
    } catch (error) {
      console.error('Error fetching profiles:', error);
      return [];
    }
  }

  async getProfile(profileId) {
    try {
      const response = await this.makeRequest(`/v1/profiles/${profileId}`);
      // Late.dev API returns { profile: {...} }
      return response.profile || response;
    } catch (error) {
      console.error('Error fetching profile:', error);
      throw error;
    }
  }

  async createProfile(profileData) {
    const { name, description, color } = profileData;
    const payload = {
      name: name || 'New Profile',
      description: description || '',
      color: color || '#4ade80'
    };

    return this.makeRequest('/v1/profiles', 'POST', payload);
  }

  async getPost(postId) {
    return this.makeRequest(`/v1/posts/${postId}`);
  }

  async deletePost(postId) {
    return this.makeRequest(`/v1/posts/${postId}`, 'DELETE');
  }

  translatePlatform(platform) {
    const platformMap = {
      'TWITTER': 'twitter',
      'INSTAGRAM': 'instagram',
      'TIKTOK': 'tiktok',
      'LINKEDIN': 'linkedin',
      'FACEBOOK': 'facebook',
      'YOUTUBE': 'youtube',
      'THREADS': 'threads',
      'REDDIT': 'reddit',
    };

    return platformMap[platform] || platform.toLowerCase();
  }

  formatContentForPlatform(content, platform) {
    const platformContent = {};

    if (content.contentData) {
      if (typeof content.contentData === 'string') {
        platformContent.text = content.contentData;
      } else if (content.contentData.text) {
        platformContent.text = content.contentData.text;
      }

      if (content.contentData.media) {
        platformContent.media = content.contentData.media;
      }
    }

    if (platform === 'TWITTER' || platform === 'THREADS') {
      if (content.contentData && content.contentData.thread) {
        platformContent.thread = content.contentData.thread;
      }
    }

    return platformContent;
  }
}

module.exports = new LateApiService();
