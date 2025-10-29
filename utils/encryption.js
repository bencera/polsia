/**
 * Token Encryption Utilities
 * Secure encryption/decryption for OAuth tokens using AES-256-GCM
 */

const crypto = require('crypto');

// Encryption algorithm
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 16 bytes for AES
const AUTH_TAG_LENGTH = 16; // GCM auth tag length

/**
 * Encrypt a token using AES-256-GCM
 * @param {string} token - The plaintext token to encrypt
 * @returns {Object} Object containing encrypted data, IV, and auth tag
 */
function encryptToken(token) {
  if (!process.env.ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }

  if (!token) {
    throw new Error('Token is required for encryption');
  }

  try {
    // Get encryption key from environment (should be 64 hex characters = 32 bytes)
    const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');

    if (key.length !== 32) {
      throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex characters)');
    }

    // Generate random initialization vector
    const iv = crypto.randomBytes(IV_LENGTH);

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    // Encrypt the token
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Get the authentication tag
    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  } catch (error) {
    console.error('[Encryption] Error encrypting token:', error.message);
    throw new Error('Failed to encrypt token');
  }
}

/**
 * Decrypt a token using AES-256-GCM
 * @param {Object} encryptedData - Object containing encrypted token, IV, and auth tag
 * @param {string} encryptedData.encrypted - The encrypted token (hex string)
 * @param {string} encryptedData.iv - The initialization vector (hex string)
 * @param {string} encryptedData.authTag - The authentication tag (hex string)
 * @returns {string} The decrypted plaintext token
 */
function decryptToken(encryptedData) {
  if (!process.env.ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }

  if (!encryptedData || !encryptedData.encrypted || !encryptedData.iv || !encryptedData.authTag) {
    throw new Error('Invalid encrypted data structure');
  }

  try {
    // Get encryption key from environment
    const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');

    if (key.length !== 32) {
      throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex characters)');
    }

    // Convert hex strings back to buffers
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const authTag = Buffer.from(encryptedData.authTag, 'hex');

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

    // Set the authentication tag
    decipher.setAuthTag(authTag);

    // Decrypt the token
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('[Encryption] Error decrypting token:', error.message);
    throw new Error('Failed to decrypt token - token may be corrupted or tampered with');
  }
}

/**
 * Generate a random encryption key (64 hex characters = 32 bytes)
 * Use this to generate ENCRYPTION_KEY for .env file
 * @returns {string} 64-character hex string
 */
function generateEncryptionKey() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  encryptToken,
  decryptToken,
  generateEncryptionKey
};
