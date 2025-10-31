/**
 * Gmail MCP Setup
 * Seeds credentials for Gmail MCP server to use existing OAuth tokens
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { getGmailToken } = require('../db');
const { decryptToken } = require('../utils/encryption');

/**
 * Prepare Gmail MCP credentials for a user
 * Creates ~/.gmail-mcp/credentials.json with user's tokens
 *
 * @param {number} userId - User ID
 * @returns {Promise<boolean>} True if credentials were set up successfully
 */
async function setupGmailMCPCredentials(userId) {
    try {
        console.log('[Gmail MCP Setup] Setting up credentials for user', userId);

        // 1. Get user's encrypted Gmail tokens from database
        const encryptedTokens = await getGmailToken(userId);
        if (!encryptedTokens) {
            console.warn('[Gmail MCP Setup] No Gmail tokens found for user', userId);
            return false;
        }

        // 2. Decrypt tokens
        const accessToken = decryptToken(encryptedTokens.accessToken);
        const refreshToken = encryptedTokens.refreshToken
            ? decryptToken(encryptedTokens.refreshToken)
            : null;

        console.log('[Gmail MCP Setup] Tokens decrypted successfully');

        // 3. Create ~/.gmail-mcp directory if it doesn't exist
        const gmailMcpDir = path.join(os.homedir(), '.gmail-mcp');
        await fs.mkdir(gmailMcpDir, { recursive: true });

        // 4. Prepare credentials in the format Gmail MCP expects
        const credentials = {
            type: 'authorized_user',
            client_id: process.env.GOOGLE_CLIENT_ID,
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            refresh_token: refreshToken,
            access_token: accessToken,
        };

        // 5. Write credentials to ~/.gmail-mcp/credentials.json
        const credentialsPath = path.join(gmailMcpDir, 'credentials.json');
        await fs.writeFile(credentialsPath, JSON.stringify(credentials, null, 2));

        console.log('[Gmail MCP Setup] ✓ Credentials written to', credentialsPath);

        // 6. Also need to create gcp-oauth.keys.json with OAuth client config
        const oauthKeys = {
            installed: {
                client_id: process.env.GOOGLE_CLIENT_ID,
                client_secret: process.env.GOOGLE_CLIENT_SECRET,
                redirect_uris: ['http://localhost'],
                auth_uri: 'https://accounts.google.com/o/oauth2/auth',
                token_uri: 'https://oauth2.googleapis.com/token'
            }
        };

        const oauthKeysPath = path.join(gmailMcpDir, 'gcp-oauth.keys.json');
        await fs.writeFile(oauthKeysPath, JSON.stringify(oauthKeys, null, 2));

        console.log('[Gmail MCP Setup] ✓ OAuth keys written to', oauthKeysPath);

        return true;

    } catch (error) {
        console.error('[Gmail MCP Setup] Error setting up credentials:', error.message);
        return false;
    }
}

/**
 * Cleanup Gmail MCP credentials after use
 * Removes credentials file to avoid conflicts with other users
 */
async function cleanupGmailMCPCredentials() {
    try {
        const gmailMcpDir = path.join(os.homedir(), '.gmail-mcp');
        const credentialsPath = path.join(gmailMcpDir, 'credentials.json');

        // Check if file exists
        try {
            await fs.access(credentialsPath);
            await fs.unlink(credentialsPath);
            console.log('[Gmail MCP Setup] ✓ Credentials cleaned up');
        } catch (err) {
            // File doesn't exist, that's fine
        }
    } catch (error) {
        console.error('[Gmail MCP Setup] Error cleaning up credentials:', error.message);
    }
}

module.exports = {
    setupGmailMCPCredentials,
    cleanupGmailMCPCredentials
};
