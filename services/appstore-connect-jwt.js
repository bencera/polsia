/**
 * App Store Connect JWT Token Generator
 * Generates JWT tokens for authenticating with Apple's App Store Connect API
 * Uses ES256 algorithm (ECDSA with P-256 and SHA-256)
 */

const jwt = require('jsonwebtoken');

/**
 * App Store Connect JWT Generator
 * Handles token generation and caching with automatic refresh
 */
class AppStoreConnectJWT {
    /**
     * @param {string} keyId - Key ID from App Store Connect (10 characters)
     * @param {string} issuerId - Issuer ID from App Store Connect (UUID format)
     * @param {string} privateKey - Private key content from .p8 file
     */
    constructor(keyId, issuerId, privateKey) {
        if (!keyId || !issuerId || !privateKey) {
            throw new Error('Missing required parameters: keyId, issuerId, or privateKey');
        }

        this.keyId = keyId;
        this.issuerId = issuerId;
        this.privateKey = privateKey;
        this.token = null;
        this.tokenExpiration = null;
    }

    /**
     * Generate a new JWT token
     * Token is valid for 20 minutes (maximum allowed by Apple)
     * @returns {string} JWT token
     */
    generateToken() {
        const now = Math.round(Date.now() / 1000); // Current time in seconds
        const expirationTime = now + 1199; // 20 minutes - 1 second (max is 1200 seconds)

        // JWT payload as per Apple's requirements
        const payload = {
            iss: this.issuerId,       // Issuer ID
            exp: expirationTime,       // Expiration time
            aud: 'appstoreconnect-v1'  // Audience (required by Apple)
        };

        // JWT signing options with ES256 algorithm
        const signOptions = {
            algorithm: 'ES256',
            header: {
                alg: 'ES256',
                kid: this.keyId,    // Key ID in header
                typ: 'JWT'
            }
        };

        try {
            // Sign and generate token
            this.token = jwt.sign(payload, this.privateKey, signOptions);
            this.tokenExpiration = expirationTime;

            console.log('[App Store Connect JWT] Generated new token, expires at:', new Date(expirationTime * 1000).toISOString());

            return this.token;
        } catch (error) {
            console.error('[App Store Connect JWT] Error generating token:', error.message);
            throw new Error(`Failed to generate JWT token: ${error.message}`);
        }
    }

    /**
     * Get a valid JWT token
     * Returns cached token if still valid, generates new one if expired or about to expire
     * @returns {string} Valid JWT token
     */
    getToken() {
        const now = Math.round(Date.now() / 1000);

        // Generate new token if:
        // 1. No token exists yet
        // 2. Token has expired
        // 3. Token expires within 60 seconds (refresh proactively)
        if (!this.token || !this.tokenExpiration || now >= (this.tokenExpiration - 60)) {
            if (this.token) {
                console.log('[App Store Connect JWT] Token expired or expiring soon, regenerating...');
            }
            return this.generateToken();
        }

        // Return existing valid token
        return this.token;
    }

    /**
     * Force regenerate token (useful for testing or error recovery)
     * @returns {string} New JWT token
     */
    refreshToken() {
        console.log('[App Store Connect JWT] Forcing token refresh...');
        return this.generateToken();
    }

    /**
     * Check if current token is valid
     * @returns {boolean} True if token exists and hasn't expired
     */
    isTokenValid() {
        if (!this.token || !this.tokenExpiration) {
            return false;
        }

        const now = Math.round(Date.now() / 1000);
        return now < this.tokenExpiration;
    }

    /**
     * Get token expiration time
     * @returns {Date|null} Expiration date or null if no token
     */
    getTokenExpiration() {
        if (!this.tokenExpiration) {
            return null;
        }
        return new Date(this.tokenExpiration * 1000);
    }

    /**
     * Get time remaining until token expires (in seconds)
     * @returns {number} Seconds until expiration, or 0 if expired/no token
     */
    getTimeUntilExpiration() {
        if (!this.tokenExpiration) {
            return 0;
        }

        const now = Math.round(Date.now() / 1000);
        const remaining = this.tokenExpiration - now;
        return Math.max(0, remaining);
    }
}

module.exports = { AppStoreConnectJWT };
