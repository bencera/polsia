/**
 * App Store Connect API Service
 * REST API wrapper for Apple's App Store Connect API
 * Handles TestFlight, app management, analytics, and releases
 */

const axios = require('axios');
const { AppStoreConnectJWT } = require('./appstore-connect-jwt');

/**
 * App Store Connect API Client
 */
class AppStoreConnectClient {
    /**
     * @param {string} keyId - App Store Connect API Key ID
     * @param {string} issuerId - App Store Connect Issuer ID
     * @param {string} privateKey - Private key from .p8 file
     * @param {string} baseUrl - API base URL (default: https://api.appstoreconnect.apple.com/v1)
     */
    constructor(keyId, issuerId, privateKey, baseUrl = 'https://api.appstoreconnect.apple.com/v1') {
        this.baseUrl = baseUrl;
        this.jwtGenerator = new AppStoreConnectJWT(keyId, issuerId, privateKey);
        this.client = axios.create({
            baseURL: baseUrl,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        // Add request interceptor to inject fresh JWT token
        this.client.interceptors.request.use(
            (config) => {
                const token = this.jwtGenerator.getToken();
                config.headers['Authorization'] = `Bearer ${token}`;
                return config;
            },
            (error) => {
                return Promise.reject(error);
            }
        );

        // Add response interceptor for error handling and rate limiting
        this.client.interceptors.response.use(
            (response) => response,
            async (error) => {
                if (error.response) {
                    const { status, data, headers } = error.response;

                    // Log rate limit info
                    if (headers['x-rate-limit']) {
                        console.log('[App Store Connect] Rate limit:', headers['x-rate-limit']);
                    }

                    // Handle rate limiting (429)
                    if (status === 429) {
                        const retryAfter = headers['retry-after'] || 60;
                        console.error(`[App Store Connect] Rate limited. Retry after ${retryAfter}s`);
                        throw new Error(`Rate limit exceeded. Retry after ${retryAfter} seconds.`);
                    }

                    // Handle authentication errors (401)
                    if (status === 401) {
                        console.error('[App Store Connect] Authentication failed. Token may be invalid.');
                        throw new Error('Authentication failed. Please check your App Store Connect credentials.');
                    }

                    // Log API errors
                    if (data && data.errors) {
                        const errorMessages = data.errors.map(e => `${e.code}: ${e.detail}`).join(', ');
                        console.error('[App Store Connect] API errors:', errorMessages);
                        throw new Error(errorMessages);
                    }
                }

                return Promise.reject(error);
            }
        );
    }

    // ========================================
    // APP MANAGEMENT
    // ========================================

    /**
     * List all apps
     * @param {Object} options - Query options
     * @param {number} options.limit - Max results (default: 20)
     * @param {string} options.fields - Comma-separated fields to include
     * @returns {Promise<Array>} Array of apps
     */
    async listApps(options = {}) {
        const { limit = 20, fields } = options;
        const params = { limit };
        if (fields) params['fields[apps]'] = fields;

        const response = await this.client.get('/apps', { params });
        return response.data.data;
    }

    /**
     * Get detailed app information
     * @param {string} appId - App ID
     * @param {string} fields - Comma-separated fields to include
     * @returns {Promise<Object>} App details
     */
    async getAppInfo(appId, fields = null) {
        const params = {};
        if (fields) params['fields[apps]'] = fields;

        const response = await this.client.get(`/apps/${appId}`, { params });
        return response.data.data;
    }

    /**
     * List app versions for an app
     * @param {string} appId - App ID
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Array of app versions
     */
    async listAppVersions(appId, options = {}) {
        const { limit = 20 } = options;
        const params = { limit };

        const response = await this.client.get(`/apps/${appId}/appStoreVersions`, { params });
        return response.data.data;
    }

    /**
     * Create a new app version
     * @param {Object} versionData - Version data (platform, versionString, appId)
     * @returns {Promise<Object>} Created version
     */
    async createAppVersion(versionData) {
        const response = await this.client.post('/appStoreVersions', {
            data: {
                type: 'appStoreVersions',
                attributes: versionData
            }
        });
        return response.data.data;
    }

    /**
     * Update app metadata
     * @param {string} versionId - App Store version ID
     * @param {Object} metadata - Metadata to update
     * @returns {Promise<Object>} Updated version
     */
    async updateAppMetadata(versionId, metadata) {
        const response = await this.client.patch(`/appStoreVersions/${versionId}`, {
            data: {
                type: 'appStoreVersions',
                id: versionId,
                attributes: metadata
            }
        });
        return response.data.data;
    }

    /**
     * Submit app version for review
     * @param {string} versionId - App Store version ID
     * @returns {Promise<Object>} Submission details
     */
    async submitForReview(versionId) {
        const response = await this.client.post('/appStoreVersionSubmissions', {
            data: {
                type: 'appStoreVersionSubmissions',
                relationships: {
                    appStoreVersion: {
                        data: {
                            type: 'appStoreVersions',
                            id: versionId
                        }
                    }
                }
            }
        });
        return response.data.data;
    }

    // ========================================
    // TESTFLIGHT
    // ========================================

    /**
     * List builds
     * @param {Object} options - Query options
     * @param {string} options.appId - Filter by app ID
     * @param {number} options.limit - Max results (default: 20)
     * @returns {Promise<Array>} Array of builds
     */
    async listBuilds(options = {}) {
        const { appId, limit = 20 } = options;
        const params = { limit };
        if (appId) params['filter[app]'] = appId;

        const response = await this.client.get('/builds', { params });
        return response.data.data;
    }

    /**
     * Get build details
     * @param {string} buildId - Build ID
     * @returns {Promise<Object>} Build details
     */
    async getBuildInfo(buildId) {
        const response = await this.client.get(`/builds/${buildId}`);
        return response.data.data;
    }

    /**
     * List beta testers
     * @param {Object} options - Query options
     * @param {string} options.appId - Filter by app ID
     * @param {number} options.limit - Max results (default: 20)
     * @returns {Promise<Array>} Array of beta testers
     */
    async listBetaTesters(options = {}) {
        const { appId, limit = 20 } = options;
        const params = { limit };
        if (appId) params['filter[apps]'] = appId;

        const response = await this.client.get('/betaTesters', { params });
        return response.data.data;
    }

    /**
     * Add a beta tester
     * @param {Object} testerData - Tester data (email, firstName, lastName)
     * @param {Array<string>} betaGroupIds - Beta group IDs to add tester to
     * @returns {Promise<Object>} Created tester
     */
    async addBetaTester(testerData, betaGroupIds = []) {
        const relationships = {};
        if (betaGroupIds.length > 0) {
            relationships.betaGroups = {
                data: betaGroupIds.map(id => ({ type: 'betaGroups', id }))
            };
        }

        const response = await this.client.post('/betaTesters', {
            data: {
                type: 'betaTesters',
                attributes: testerData,
                relationships
            }
        });
        return response.data.data;
    }

    /**
     * Remove a beta tester
     * @param {string} testerId - Beta tester ID
     * @returns {Promise<boolean>} Success status
     */
    async removeBetaTester(testerId) {
        await this.client.delete(`/betaTesters/${testerId}`);
        return true;
    }

    /**
     * List beta groups
     * @param {Object} options - Query options
     * @param {string} options.appId - Filter by app ID
     * @param {number} options.limit - Max results (default: 20)
     * @returns {Promise<Array>} Array of beta groups
     */
    async listBetaGroups(options = {}) {
        const { appId, limit = 20 } = options;
        const params = { limit };
        if (appId) params['filter[app]'] = appId;

        const response = await this.client.get('/betaGroups', { params });
        return response.data.data;
    }

    /**
     * Add build to beta group
     * @param {string} betaGroupId - Beta group ID
     * @param {string} buildId - Build ID
     * @returns {Promise<boolean>} Success status
     */
    async addBuildToBetaGroup(betaGroupId, buildId) {
        await this.client.post(`/betaGroups/${betaGroupId}/relationships/builds`, {
            data: [
                {
                    type: 'builds',
                    id: buildId
                }
            ]
        });
        return true;
    }

    // ========================================
    // ANALYTICS & REVIEWS
    // ========================================

    /**
     * Get app analytics/metrics
     * @param {string} appId - App ID
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Analytics data
     */
    async getAppMetrics(appId, options = {}) {
        const response = await this.client.get(`/apps/${appId}/perfPowerMetrics`, {
            params: options
        });
        return response.data.data;
    }

    /**
     * List customer reviews
     * @param {string} appId - App ID
     * @param {Object} options - Query options
     * @param {number} options.limit - Max results (default: 20)
     * @param {string} options.sort - Sort order (e.g., '-createdDate')
     * @returns {Promise<Array>} Array of reviews
     */
    async listCustomerReviews(appId, options = {}) {
        const { limit = 20, sort = '-createdDate' } = options;
        const params = { limit, sort };

        const response = await this.client.get(`/apps/${appId}/customerReviews`, { params });
        return response.data.data;
    }

    /**
     * Respond to a customer review
     * @param {string} reviewId - Review ID
     * @param {string} responseText - Response text
     * @returns {Promise<Object>} Created response
     */
    async respondToReview(reviewId, responseText) {
        const response = await this.client.post('/customerReviewResponses', {
            data: {
                type: 'customerReviewResponses',
                attributes: {
                    responseBody: responseText
                },
                relationships: {
                    review: {
                        data: {
                            type: 'customerReviews',
                            id: reviewId
                        }
                    }
                }
            }
        });
        return response.data.data;
    }

    // ========================================
    // PRICING & RELEASES
    // ========================================

    /**
     * Get app pricing
     * @param {string} appId - App ID
     * @returns {Promise<Array>} Array of app prices
     */
    async getAppPricing(appId) {
        const response = await this.client.get(`/apps/${appId}/prices`);
        return response.data.data;
    }

    /**
     * Update app pricing
     * @param {string} priceId - App price ID
     * @param {Object} pricingData - Pricing data
     * @returns {Promise<Object>} Updated price
     */
    async updatePricing(priceId, pricingData) {
        const response = await this.client.patch(`/appPrices/${priceId}`, {
            data: {
                type: 'appPrices',
                id: priceId,
                attributes: pricingData
            }
        });
        return response.data.data;
    }

    /**
     * Configure phased release
     * @param {string} versionId - App Store version ID
     * @param {number} phasedReleaseState - State (0=inactive, 1=active, 2=paused, 3=complete)
     * @returns {Promise<Object>} Phased release configuration
     */
    async configurePhasedRelease(versionId, phasedReleaseState) {
        const response = await this.client.post('/appStoreVersionPhasedReleases', {
            data: {
                type: 'appStoreVersionPhasedReleases',
                attributes: {
                    phasedReleaseState
                },
                relationships: {
                    appStoreVersion: {
                        data: {
                            type: 'appStoreVersions',
                            id: versionId
                        }
                    }
                }
            }
        });
        return response.data.data;
    }

    // ========================================
    // UTILITY METHODS
    // ========================================

    /**
     * Test API connection
     * @returns {Promise<boolean>} True if connection successful
     */
    async testConnection() {
        try {
            await this.listApps({ limit: 1 });
            return true;
        } catch (error) {
            console.error('[App Store Connect] Connection test failed:', error.message);
            return false;
        }
    }

    /**
     * Get rate limit information from last response
     * @returns {Object|null} Rate limit info or null
     */
    getRateLimitInfo() {
        // This would need to be stored from the last response
        // For now, returning null as placeholder
        return null;
    }
}

module.exports = { AppStoreConnectClient };
