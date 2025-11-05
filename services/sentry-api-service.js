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
     * List issues for an organization (filtered by project in results)
     * @param {string} orgSlug - Organization slug
     * @param {string} projectSlug - Project slug (used to filter results after retrieval)
     * @param {Object} options - Query options
     * @param {string} options.query - Sentry query string (e.g., 'is:unresolved')
     * @param {number} options.limit - Max results (default: 100)
     * @param {string} options.statsPeriod - Stats period (optional, filters by event activity)
     */
    async listIssues(orgSlug, projectSlug, options = {}) {
        const {
            query = '',
            limit = 100,
            statsPeriod
        } = options;

        const params = {
            query: query || '',
            limit
        };

        // Only include statsPeriod if explicitly provided
        // Note: statsPeriod filters by when issues had events, not by creation/resolved status
        if (statsPeriod) {
            params.statsPeriod = statsPeriod;
        }

        const response = await this.client.get(`/organizations/${orgSlug}/issues/`, { params });

        // Filter by project slug since API doesn't accept slug parameter
        if (projectSlug) {
            return response.data.filter(issue => issue.project.slug === projectSlug);
        }

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

    /**
     * Update a single issue (status, assignment, etc.)
     * @param {string} orgSlug - Organization slug
     * @param {string} issueId - Issue ID
     * @param {Object} updates - Update parameters
     * @param {string} updates.status - Status: 'resolved', 'unresolved', 'ignored', 'resolvedInNextRelease'
     * @param {Object} updates.statusDetails - Additional status context (inRelease, ignoreDuration, etc.)
     * @param {string} updates.assignedTo - Assign to user (email or actor ID)
     * @param {boolean} updates.isPublic - Set public/private visibility
     * @param {boolean} updates.hasSeen - Mark as seen
     * @param {boolean} updates.isBookmarked - Toggle bookmark
     * @param {boolean} updates.isSubscribed - Enable/disable notifications
     */
    async updateIssue(orgSlug, issueId, updates) {
        const response = await this.client.put(
            `/organizations/${orgSlug}/issues/${issueId}/`,
            updates
        );
        return response.data;
    }

    /**
     * Bulk update issues in a project
     * @param {string} orgSlug - Organization slug
     * @param {string} projectSlug - Project slug
     * @param {Array<string>} issueIds - Array of issue IDs to update (optional - omit to update all matching)
     * @param {Object} updates - Update parameters (same as updateIssue)
     * @param {string} statusFilter - Filter by current status before updating (optional)
     */
    async bulkUpdateIssues(orgSlug, projectSlug, issueIds, updates, statusFilter) {
        const params = {};

        // Add issue IDs to query params
        if (issueIds && issueIds.length > 0) {
            // Axios will serialize array as ?id=1&id=2&id=3
            params.id = issueIds;
        }

        // Add status filter if provided
        if (statusFilter) {
            params.status = statusFilter;
        }

        const response = await this.client.put(
            `/projects/${orgSlug}/${projectSlug}/issues/`,
            updates,
            { params }
        );
        return response.data;
    }

    /**
     * Add a note/comment to an issue
     * @param {string} issueId - Issue ID
     * @param {string} text - Comment text
     */
    async addIssueNote(issueId, text) {
        const response = await this.client.post(
            `/issues/${issueId}/notes/`,
            { text }
        );
        return response.data;
    }
}

module.exports = { SentryAPIClient };
