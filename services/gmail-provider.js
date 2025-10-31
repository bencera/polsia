/**
 * Gmail Service Provider
 * Comprehensive Gmail API integration for reading, sending, searching emails and managing labels
 */

const { google } = require('googleapis');
const { decryptToken, encryptToken } = require('../utils/encryption');
const { getGmailToken, updateGmailTokens } = require('../db');

class GmailProvider {
    constructor(userId) {
        this.userId = userId;
        this.oauth2Client = null;
    }

    /**
     * Initialize OAuth2 client with user's tokens
     */
    async initialize() {
        const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
        const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

        if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
            throw new Error('Gmail OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET');
        }

        // Get encrypted tokens from database
        const encryptedTokens = await getGmailToken(this.userId);

        if (!encryptedTokens) {
            throw new Error('Gmail connection not found for user');
        }

        // Decrypt tokens
        const accessToken = decryptToken(encryptedTokens.accessToken);
        const refreshToken = encryptedTokens.refreshToken
            ? decryptToken(encryptedTokens.refreshToken)
            : null;

        // Create OAuth2 client
        this.oauth2Client = new google.auth.OAuth2(
            GOOGLE_CLIENT_ID,
            GOOGLE_CLIENT_SECRET
        );

        // Set credentials
        this.oauth2Client.setCredentials({
            access_token: accessToken,
            refresh_token: refreshToken
        });

        // Handle token refresh
        this.oauth2Client.on('tokens', async (tokens) => {
            console.log('[Gmail Provider] Tokens refreshed automatically');

            // Encrypt and store new tokens
            const encryptedAccessToken = encryptToken(tokens.access_token);
            const encryptedRefreshToken = tokens.refresh_token
                ? encryptToken(tokens.refresh_token)
                : null;

            await updateGmailTokens(this.userId, {
                accessToken: encryptedAccessToken,
                refreshToken: encryptedRefreshToken,
                expiry: tokens.expiry_date
            });
        });

        return this.oauth2Client;
    }

    /**
     * Get Gmail API client
     */
    async getGmailClient() {
        if (!this.oauth2Client) {
            await this.initialize();
        }

        return google.gmail({ version: 'v1', auth: this.oauth2Client });
    }

    /**
     * Read emails from inbox
     * @param {Object} options - Query options
     * @param {string} options.query - Gmail search query (e.g., "is:unread", "from:example@gmail.com")
     * @param {number} options.maxResults - Maximum number of emails to return (default: 10)
     * @param {string} options.labelIds - Label IDs to filter by (e.g., "INBOX", "UNREAD")
     * @returns {Promise<Array>} Array of email objects
     */
    async readEmails({ query = '', maxResults = 10, labelIds = ['INBOX'] } = {}) {
        try {
            const gmail = await this.getGmailClient();

            // List messages
            const response = await gmail.users.messages.list({
                userId: 'me',
                q: query,
                maxResults: maxResults,
                labelIds: labelIds
            });

            const messages = response.data.messages || [];

            // Fetch full message details
            const emails = await Promise.all(
                messages.map(async (message) => {
                    const msg = await gmail.users.messages.get({
                        userId: 'me',
                        id: message.id,
                        format: 'full'
                    });

                    return this._parseEmail(msg.data);
                })
            );

            return emails;
        } catch (error) {
            console.error('[Gmail Provider] Error reading emails:', error);
            throw new Error(`Failed to read emails: ${error.message}`);
        }
    }

    /**
     * Send an email through Gmail
     * @param {Object} options - Email options
     * @param {string} options.to - Recipient email address
     * @param {string} options.subject - Email subject
     * @param {string} options.body - Email body (plain text or HTML)
     * @param {string} [options.cc] - CC recipients
     * @param {string} [options.bcc] - BCC recipients
     * @returns {Promise<Object>} Send result with messageId
     */
    async sendEmail({ to, subject, body, cc, bcc } = {}) {
        try {
            if (!to || !subject || !body) {
                throw new Error('To, subject, and body are required');
            }

            const gmail = await this.getGmailClient();

            // Create email message
            const email = [
                `To: ${to}`,
                cc ? `Cc: ${cc}` : '',
                bcc ? `Bcc: ${bcc}` : '',
                `Subject: ${subject}`,
                '',
                body
            ].filter(line => line).join('\n');

            // Encode email in base64url format
            const encodedEmail = Buffer.from(email)
                .toString('base64')
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');

            // Send email
            const response = await gmail.users.messages.send({
                userId: 'me',
                requestBody: {
                    raw: encodedEmail
                }
            });

            return {
                success: true,
                messageId: response.data.id,
                threadId: response.data.threadId
            };
        } catch (error) {
            console.error('[Gmail Provider] Error sending email:', error);
            throw new Error(`Failed to send email: ${error.message}`);
        }
    }

    /**
     * Search emails with Gmail query syntax
     * @param {string} query - Gmail search query
     * @param {number} maxResults - Maximum results to return
     * @returns {Promise<Array>} Array of matching emails
     */
    async searchEmails(query, maxResults = 20) {
        try {
            return await this.readEmails({ query, maxResults, labelIds: [] });
        } catch (error) {
            console.error('[Gmail Provider] Error searching emails:', error);
            throw new Error(`Failed to search emails: ${error.message}`);
        }
    }

    /**
     * List all Gmail labels
     * @returns {Promise<Array>} Array of label objects
     */
    async listLabels() {
        try {
            const gmail = await this.getGmailClient();

            const response = await gmail.users.labels.list({
                userId: 'me'
            });

            return response.data.labels || [];
        } catch (error) {
            console.error('[Gmail Provider] Error listing labels:', error);
            throw new Error(`Failed to list labels: ${error.message}`);
        }
    }

    /**
     * Create a new Gmail label
     * @param {string} name - Label name
     * @param {Object} options - Label options
     * @returns {Promise<Object>} Created label
     */
    async createLabel(name, options = {}) {
        try {
            const gmail = await this.getGmailClient();

            const response = await gmail.users.labels.create({
                userId: 'me',
                requestBody: {
                    name: name,
                    labelListVisibility: options.labelListVisibility || 'labelShow',
                    messageListVisibility: options.messageListVisibility || 'show'
                }
            });

            return response.data;
        } catch (error) {
            console.error('[Gmail Provider] Error creating label:', error);
            throw new Error(`Failed to create label: ${error.message}`);
        }
    }

    /**
     * Add label to a message
     * @param {string} messageId - Message ID
     * @param {string} labelId - Label ID to add
     * @returns {Promise<Object>} Updated message
     */
    async addLabelToMessage(messageId, labelId) {
        try {
            const gmail = await this.getGmailClient();

            const response = await gmail.users.messages.modify({
                userId: 'me',
                id: messageId,
                requestBody: {
                    addLabelIds: [labelId]
                }
            });

            return response.data;
        } catch (error) {
            console.error('[Gmail Provider] Error adding label:', error);
            throw new Error(`Failed to add label: ${error.message}`);
        }
    }

    /**
     * Remove label from a message
     * @param {string} messageId - Message ID
     * @param {string} labelId - Label ID to remove
     * @returns {Promise<Object>} Updated message
     */
    async removeLabelFromMessage(messageId, labelId) {
        try {
            const gmail = await this.getGmailClient();

            const response = await gmail.users.messages.modify({
                userId: 'me',
                id: messageId,
                requestBody: {
                    removeLabelIds: [labelId]
                }
            });

            return response.data;
        } catch (error) {
            console.error('[Gmail Provider] Error removing label:', error);
            throw new Error(`Failed to remove label: ${error.message}`);
        }
    }

    /**
     * Parse email data from Gmail API response
     * @private
     */
    _parseEmail(messageData) {
        const headers = messageData.payload.headers;
        const getHeader = (name) => {
            const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
            return header ? header.value : '';
        };

        // Extract body
        let body = '';
        if (messageData.payload.body.data) {
            body = Buffer.from(messageData.payload.body.data, 'base64').toString('utf-8');
        } else if (messageData.payload.parts) {
            const textPart = messageData.payload.parts.find(part => part.mimeType === 'text/plain');
            const htmlPart = messageData.payload.parts.find(part => part.mimeType === 'text/html');

            if (textPart && textPart.body.data) {
                body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
            } else if (htmlPart && htmlPart.body.data) {
                body = Buffer.from(htmlPart.body.data, 'base64').toString('utf-8');
            }
        }

        return {
            id: messageData.id,
            threadId: messageData.threadId,
            labelIds: messageData.labelIds,
            snippet: messageData.snippet,
            from: getHeader('From'),
            to: getHeader('To'),
            subject: getHeader('Subject'),
            date: getHeader('Date'),
            body: body,
            internalDate: messageData.internalDate
        };
    }

    /**
     * Test the provider connection
     * @returns {Promise<boolean>} True if connection is valid
     */
    async testConnection() {
        try {
            const gmail = await this.getGmailClient();

            // Try to get user profile
            await gmail.users.getProfile({ userId: 'me' });

            return true;
        } catch (error) {
            console.error('[Gmail Provider] Connection test failed:', error);
            return false;
        }
    }
}

module.exports = GmailProvider;
