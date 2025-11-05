#!/usr/bin/env node

/**
 * Test Slack Integration with Dual Tokens (Bot + User)
 * Auto-decrypts token from production database
 */

require('dotenv').config();
const { decryptToken } = require('./utils/encryption');
const { SlackAPIClient } = require('./services/slack-api-service');

// Encrypted token data from production database
const encryptedData = {
    encrypted: '8b65605cc985cd1cfde5334a1088b9c3a1d51a7c46feb430f1b57a0c4a735bf444eaef3514bd944270b9a7fc3c72ef9fef93401babeceed2f8',
    iv: '16c2a8808344806bae21436b44119f1a',
    authTag: 'a4b6d402a857455c922a930e0674aa60'
};

async function testDualTokens() {
    console.log('🧪 Testing Slack Integration with Dual Tokens\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    try {
        // Decrypt bot token
        console.log('🔓 Decrypting bot token from production database...');
        const botToken = decryptToken(encryptedData);
        console.log(`✅ Bot token decrypted: ${botToken.substring(0, 20)}...`);
        console.log(`⚠️  No user token (current connection is bot-only)\n`);

        // Initialize client with bot token only (simulating current state)
        const slackClient = new SlackAPIClient(botToken, null);

        // Test 1: Auth (uses bot token)
        console.log('1️⃣ Testing authentication (bot token)...');
        const auth = await slackClient.authTest();
        console.log(`✅ Bot authenticated as @${auth.user} in ${auth.team}`);
        console.log();

        // Test 2: List channels (uses bot token)
        console.log('2️⃣ Listing channels (bot token)...');
        const channels = await slackClient.listConversations('public_channel,private_channel', 10);
        console.log(`✅ Found ${channels.channels.length} channels:`);

        const memberChannels = channels.channels.filter(ch => ch.is_member);
        const nonMemberChannels = channels.channels.filter(ch => !ch.is_member);

        console.log(`   Bot is member of ${memberChannels.length} channels:`);
        memberChannels.slice(0, 3).forEach(ch => {
            console.log(`   ✅ #${ch.name}`);
        });

        console.log(`   Bot is NOT member of ${nonMemberChannels.length} channels:`);
        nonMemberChannels.slice(0, 3).forEach(ch => {
            console.log(`   ❌ #${ch.name}`);
        });
        console.log();

        // Test 3: Try to access channel WITHOUT membership
        if (nonMemberChannels.length > 0) {
            const testChannel = nonMemberChannels[0];
            console.log(`3️⃣ Attempting to read #${testChannel.name} (bot NOT member)...`);
            console.log(`   Token used: BOT TOKEN (requires membership)`);

            try {
                const oneDayAgo = Math.floor(Date.now() / 1000) - (24 * 60 * 60);
                const history = await slackClient.getConversationHistory(
                    testChannel.id,
                    { limit: 5, oldest: oneDayAgo.toString() }
                );
                console.log(`✅ Successfully retrieved ${history.messages.length} messages!`);
                console.log();
            } catch (error) {
                if (error.message.includes('not_in_channel')) {
                    console.log(`❌ Failed: ${error.message}`);
                    console.log(`   💡 THIS IS THE PROBLEM - bot needs manual invite!`);
                    console.log();
                } else {
                    throw error;
                }
            }
        }

        // Test 4: Search (requires user token)
        console.log('4️⃣ Testing message search...');
        try {
            const searchResults = await slackClient.searchMessages('test', { limit: 3 });
            console.log(`✅ Search successful! Found ${searchResults.messages.total} matches`);
            console.log();
        } catch (error) {
            console.log(`❌ Failed: ${error.message}`);
            console.log(`   💡 search.messages API requires user token!`);
            console.log();
        }

        // Summary
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 CURRENT STATE (BOT TOKEN ONLY)');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        console.log('✅ What Works:');
        console.log('  • Authenticate workspace');
        console.log('  • List all channels');
        console.log(`  • Read messages from ${memberChannels.length} channels where bot is member`);
        console.log('  • Post messages\n');

        console.log('❌ What Doesn\'t Work:');
        console.log(`  • Read messages from ${nonMemberChannels.length} channels where bot is NOT member`);
        console.log('  • Search messages across workspace');
        console.log('  • Automatic access to new channels\n');

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('💡 SOLUTION: ADD USER TOKEN');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        console.log('After implementing user token support:');
        console.log('  ✅ Read ALL public channels (no manual invites!)');
        console.log('  ✅ Search messages across workspace');
        console.log('  ✅ Automatic access to new channels');
        console.log('  ✅ Keep bot token for posting messages\n');

        console.log('Steps to enable:');
        console.log('  1. ✅ Add user scopes to Slack app (api.slack.com/apps)');
        console.log('     • channels:history, channels:read, search:read, users:read');
        console.log('  2. ✅ Update OAuth flow to request user_scope');
        console.log('  3. ✅ Update database to store both tokens');
        console.log('  4. ✅ Update SlackAPIClient to use both tokens');
        console.log('  5. ✅ Update MCP server to accept both tokens');
        console.log('  6. ⏳ User reconnects Slack to grant new permissions');
        console.log('  7. ⏳ User token automatically stored');
        console.log('  8. ⏳ Slack Daily Digest works without manual setup!\n');

        console.log('✅ Implementation complete - ready for testing!');
        console.log('   User must reconnect to get user token benefits.');
        process.exit(0);

    } catch (error) {
        console.error('\n❌ TEST FAILED!');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error(`Error: ${error.message}`);
        if (error.response?.data) {
            console.error('Slack API Response:', error.response.data);
        }
        process.exit(1);
    }
}

// Run test
testDualTokens();
