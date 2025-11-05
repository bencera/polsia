#!/usr/bin/env node

/**
 * Test Slack API with decrypted production token
 */

require('dotenv').config();
const { decryptToken } = require('./utils/encryption');
const { testSlackAPI } = require('./test-slack-api-remote');

// Encrypted token data from production database
const encryptedData = {
    encrypted: '8b65605cc985cd1cfde5334a1088b9c3a1d51a7c46feb430f1b57a0c4a735bf444eaef3514bd944270b9a7fc3c72ef9fef93401babeceed2f8',
    iv: '16c2a8808344806bae21436b44119f1a',
    authTag: 'a4b6d402a857455c922a930e0674aa60'
};

console.log('🔓 Decrypting Slack bot token from production database...\n');

try {
    // Decrypt the token
    const botToken = decryptToken(encryptedData);
    console.log(`✅ Token decrypted successfully!`);
    console.log(`   Token preview: ${botToken.substring(0, 20)}...\n`);

    // Test the Slack API with the decrypted token
    testSlackAPI(botToken)
        .then(() => {
            console.log('\n✅ All Slack API tests passed!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Slack API tests failed:', error.message);
            process.exit(1);
        });

} catch (error) {
    console.error('❌ Failed to decrypt token:', error.message);
    process.exit(1);
}
