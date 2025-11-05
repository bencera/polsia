/**
 * Redirect URL Validation Utility
 * Prevents open redirect vulnerabilities in OAuth flows
 */

/**
 * Whitelist of allowed redirect origins
 * Add your production domain here
 */
const ALLOWED_ORIGINS = [
    'http://localhost:5173',    // Local development
    'http://localhost:3000',    // Local production build
    'https://polsia.com',       // Production (example - update with actual domain)
    'https://www.polsia.com',   // Production with www
    'https://app.polsia.com',   // Production app subdomain
];

/**
 * Validates that a frontend URL is in the allowed list
 * @param {string} url - The URL to validate
 * @returns {boolean} - True if URL is allowed
 */
function isAllowedRedirectOrigin(url) {
    if (!url) return false;

    try {
        const urlObj = new URL(url);
        const origin = urlObj.origin;

        // Check if origin is in whitelist
        return ALLOWED_ORIGINS.includes(origin);
    } catch (error) {
        console.error('[Redirect Validator] Invalid URL:', url);
        return false;
    }
}

/**
 * Gets a validated frontend URL from environment or falls back to default
 * Exits the process if the configured URL is not in the whitelist
 * @returns {string} - Validated frontend URL
 */
function getValidatedFrontendURL() {
    const configuredURL = process.env.FRONTEND_URL || 'http://localhost:5173';

    if (!isAllowedRedirectOrigin(configuredURL)) {
        console.error('FATAL SECURITY ERROR: FRONTEND_URL is not in the allowed origins list');
        console.error(`Configured URL: ${configuredURL}`);
        console.error(`Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
        console.error('');
        console.error('To fix this:');
        console.error('1. Add your domain to ALLOWED_ORIGINS in utils/redirect-validator.js');
        console.error('2. OR update FRONTEND_URL environment variable to match an allowed origin');
        process.exit(1);
    }

    return configuredURL;
}

/**
 * Constructs a safe redirect URL with query parameters
 * @param {string} baseURL - Base URL (must be validated first)
 * @param {string} path - Path to append
 * @param {Object} params - Query parameters to add
 * @returns {string} - Complete redirect URL
 */
function buildRedirectURL(baseURL, path, params = {}) {
    const url = new URL(path, baseURL);

    // Add query parameters
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
            url.searchParams.set(key, value);
        }
    });

    return url.toString();
}

module.exports = {
    ALLOWED_ORIGINS,
    isAllowedRedirectOrigin,
    getValidatedFrontendURL,
    buildRedirectURL
};
