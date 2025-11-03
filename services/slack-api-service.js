/**
 * Slack Web API Service
 * Simple wrapper around Slack Web API endpoints
 */

const axios = require('axios');

class SlackAPIClient {
    constructor(botToken, userToken = null) {
        this.botToken = botToken;
        this.userToken = userToken;  // Optional user token for broader access
        this.baseURL = 'https://slack.com/api';
    }

    /**
     * Make a request to Slack API with a specific token
     */
    async requestWithToken(token, endpoint, params = {}) {
        try {
            const response = await axios.get(`${this.baseURL}/${endpoint}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                params
            });

            if (!response.data.ok) {
                throw new Error(`Slack API error: ${response.data.error}`);
            }

            return response.data;
        } catch (error) {
            console.error(`[Slack API] Error calling ${endpoint}:`, error.message);
            throw error;
        }
    }

    /**
     * Make a request to Slack API (uses bot token by default)
     */
    async request(endpoint, params = {}) {
        return this.requestWithToken(this.botToken, endpoint, params);
    }

    /**
     * Make a POST request to Slack API with a specific token
     */
    async postRequestWithToken(token, endpoint, data = {}) {
        try {
            const response = await axios.post(`${this.baseURL}/${endpoint}`, data, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.data.ok) {
                throw new Error(`Slack API error: ${response.data.error}`);
            }

            return response.data;
        } catch (error) {
            console.error(`[Slack API] Error calling ${endpoint}:`, error.message);
            throw error;
        }
    }

    /**
     * Make a POST request to Slack API (uses bot token by default)
     */
    async postRequest(endpoint, data = {}) {
        return this.postRequestWithToken(this.botToken, endpoint, data);
    }

    /**
     * Test authentication
     */
    async authTest() {
        return await this.request('auth.test');
    }

    /**
     * List conversations (channels, DMs, groups)
     */
    async listConversations(types = 'public_channel,private_channel', limit = 100, cursor = null) {
        const params = {
            types,
            limit,
            exclude_archived: true
        };

        if (cursor) {
            params.cursor = cursor;
        }

        return await this.request('conversations.list', params);
    }

    /**
     * Get conversation history
     * Prefers user token if available (can access channels without bot membership)
     * Falls back to bot token if user token not available
     */
    async getConversationHistory(channelId, options = {}) {
        const params = {
            channel: channelId,
            limit: options.limit || 100,
            ...options
        };

        // Use user token if available (can read channels without membership)
        // Otherwise fall back to bot token (requires channel membership)
        const token = this.userToken || this.botToken;
        return await this.requestWithToken(token, 'conversations.history', params);
    }

    /**
     * Get thread replies
     */
    async getThreadReplies(channelId, threadTs, limit = 100) {
        return await this.request('conversations.replies', {
            channel: channelId,
            ts: threadTs,
            limit
        });
    }

    /**
     * Post a message
     */
    async postMessage(channelId, text, options = {}) {
        const data = {
            channel: channelId,
            text,
            ...options
        };

        return await this.postRequest('chat.postMessage', data);
    }

    /**
     * Search messages
     * Requires user token (search.messages API only works with user tokens)
     */
    async searchMessages(query, options = {}) {
        if (!this.userToken) {
            throw new Error('search.messages API requires user token. User must reconnect to grant user-level permissions.');
        }

        const params = {
            query,
            count: options.limit || 20,
            sort: options.sort || 'timestamp',
            sort_dir: options.sort_dir || 'desc',
            ...options
        };

        return await this.requestWithToken(this.userToken, 'search.messages', params);
    }

    /**
     * Get user info
     */
    async getUserInfo(userId) {
        return await this.request('users.info', { user: userId });
    }

    /**
     * List users
     */
    async listUsers(limit = 100, cursor = null) {
        const params = {
            limit
        };

        if (cursor) {
            params.cursor = cursor;
        }

        return await this.request('users.list', params);
    }

    /**
     * Get workspace info
     */
    async getTeamInfo() {
        return await this.request('team.info');
    }
}

module.exports = { SlackAPIClient };
