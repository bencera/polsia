/**
 * Sentry REST API Service
 * Direct REST API wrapper for Sentry - no MCP bugs, no OpenAI required
 */

const axios = require('axios');

/**
 * Sentry API Client
 */
class SentryAPIClient {
    constructor(accessToken, baseUrl = 'https://sentry.io/api/0') {
        this.accessToken = accessToken;
        this.baseUrl = baseUrl;
        this.client = axios.create({
            baseURL: baseUrl,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });
    }

    /**
     * Get authenticated user info
     */
    async whoami() {
        const response = await this.client.get('/');
        return response.data.user;
    }

    /**
     * List all organizations
     */
    async listOrganizations() {
        const response = await this.client.get('/organizations/');
        return response.data;
    }

    /**
     * List projects for an organization
     */
    async listProjects(orgSlug) {
        const response = await this.client.get(`/organizations/${orgSlug}/projects/`);
        return response.data;
    }

    /**
     * List issues for a project
     * @param {string} orgSlug - Organization slug
     * @param {string} projectSlug - Project slug
     * @param {Object} options - Query options
     * @param {string} options.query - Sentry query string (e.g., 'is:unresolved')
     * @param {number} options.limit - Max results (default: 100)
     * @param {string} options.statsPeriod - Stats period (default: '24h')
     */
    async listIssues(orgSlug, projectSlug, options = {}) {
        const {
            query = 'is:unresolved',
            limit = 100,
            statsPeriod = '24h'
        } = options;

        const params = {
            query: `${query} project:${projectSlug}`,
            limit,
            statsPeriod
        };

        const response = await this.client.get(`/organizations/${orgSlug}/issues/`, { params });
        return response.data;
    }

    /**
     * Get detailed issue information
     * @param {string} issueId - Issue ID
     */
    async getIssue(issueId) {
        const response = await this.client.get(`/issues/${issueId}/`);
        return response.data;
    }

    /**
     * Get events for an issue (includes stacktraces)
     * @param {string} issueId - Issue ID
     * @param {number} limit - Max events to retrieve
     */
    async getIssueEvents(issueId, limit = 1) {
        const response = await this.client.get(`/issues/${issueId}/events/`, {
            params: { limit }
        });
        return response.data;
    }

    /**
     * Get the latest event for an issue (with full stacktrace)
     */
    async getLatestEvent(issueId) {
        const response = await this.client.get(`/issues/${issueId}/events/latest/`);
        return response.data;
    }
}

module.exports = { SentryAPIClient };
