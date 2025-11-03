/**
 * Slack Web API Service
 * Simple wrapper around Slack Web API endpoints
 */

const axios = require('axios');

class SlackAPIClient {
    constructor(botToken) {
        this.botToken = botToken;
        this.baseURL = 'https://slack.com/api';
    }

    /**
     * Make a request to Slack API
     */
    async request(endpoint, params = {}) {
        try {
            const response = await axios.get(`${this.baseURL}/${endpoint}`, {
                headers: {
                    'Authorization': `Bearer ${this.botToken}`,
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
     * Make a POST request to Slack API
     */
    async postRequest(endpoint, data = {}) {
        try {
            const response = await axios.post(`${this.baseURL}/${endpoint}`, data, {
                headers: {
                    'Authorization': `Bearer ${this.botToken}`,
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
     */
    async getConversationHistory(channelId, options = {}) {
        const params = {
            channel: channelId,
            limit: options.limit || 100,
            ...options
        };

        return await this.request('conversations.history', params);
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
     */
    async searchMessages(query, options = {}) {
        const params = {
            query,
            count: options.limit || 20,
            sort: options.sort || 'timestamp',
            sort_dir: options.sort_dir || 'desc',
            ...options
        };

        return await this.request('search.messages', params);
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
