#!/usr/bin/env node

/**
 * Test Slack Integration with Dual Tokens (Bot + User)
 * Simulates the new OAuth flow where we get both tokens
 */

require('dotenv').config();
const { SlackAPIClient } = require('./services/slack-api-service');

// For testing, we'll use the bot token we already have
// In production, users will need to reconnect to get user tokens
const testBotToken = process.argv[2];

if (!testBotToken) {
    console.log('Usage: node test-slack-dual-tokens.js <bot-token> [user-token]');
    console.log('\nTo test with production tokens:');
    console.log('1. Get bot token from database (already decrypted in test-slack-direct.js)');
    console.log('2. After user reconnects, user token will also be available');
    process.exit(1);
}

const testUserToken = process.argv[3] || null;

async function testDualTokens() {
    console.log('🧪 Testing Slack Integration with Dual Tokens\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    try {
        // Initialize client with both tokens (user token optional)
        const slackClient = new SlackAPIClient(testBotToken, testUserToken);

        console.log('🔧 Configuration:');
        console.log(`   Bot Token: ${testBotToken.substring(0, 20)}...`);
        console.log(`   User Token: ${testUserToken ? testUserToken.substring(0, 20) + '...' : 'Not provided (limited mode)'}`);
        console.log();

        // Test 1: Auth (uses bot token)
        console.log('1️⃣ Testing authentication (bot token)...');
        const auth = await slackClient.authTest();
        console.log(`✅ Bot authenticated as @${auth.user} in ${auth.team}`);
        console.log();

        // Test 2: List channels (uses bot token)
        console.log('2️⃣ Listing channels (bot token)...');
        const channels = await slackClient.listConversations('public_channel,private_channel', 10);
        console.log(`✅ Found ${channels.channels.length} channels:`);
        channels.channels.slice(0, 5).forEach(ch => {
            const memberStatus = ch.is_member ? '(bot is member)' : '(bot NOT member)';
            console.log(`   - #${ch.name} ${memberStatus}`);
        });
        console.log();

        // Test 3: Get channel history with smart token selection
        if (channels.channels.length > 0) {
            const testChannel = channels.channels[0];
            console.log(`3️⃣ Getting channel history from #${testChannel.name}...`);
            console.log(`   Token used: ${testUserToken ? 'USER TOKEN (can access without membership)' : 'BOT TOKEN (needs membership)'}`);

            try {
                const oneDayAgo = Math.floor(Date.now() / 1000) - (24 * 60 * 60);
                const history = await slackClient.getConversationHistory(
                    testChannel.id,
                    { limit: 5, oldest: oneDayAgo.toString() }
                );

                console.log(`✅ Successfully retrieved ${history.messages.length} messages!`);
                if (history.messages.length > 0) {
                    console.log(`   Latest message: "${(history.messages[0].text || '').substring(0, 60)}..."`);
                }
                console.log();
            } catch (error) {
                if (error.message.includes('not_in_channel')) {
                    console.log(`❌ Failed: Bot not in channel`);
                    console.log(`   💡 This would work if user token was provided!`);
                    console.log();
                } else {
                    throw error;
                }
            }
        }

        // Test 4: Search (requires user token)
        console.log('4️⃣ Testing message search...');
        if (testUserToken) {
            try {
                const searchResults = await slackClient.searchMessages('test', { limit: 3 });
                console.log(`✅ Search successful! Found ${searchResults.messages.total} matches`);
                console.log();
            } catch (error) {
                console.log(`⚠️  Search failed: ${error.message}`);
                console.log();
            }
        } else {
            console.log(`⚠️  Search skipped - requires user token`);
            console.log(`   💡 Reconnect to enable search functionality!`);
            console.log();
        }

        // Summary
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 TOKEN CAPABILITIES SUMMARY');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        console.log('Bot Token (xoxb-):');
        console.log('  ✅ Authenticate workspace');
        console.log('  ✅ List channels');
        console.log('  ✅ Read messages (only in channels bot is member of)');
        console.log('  ✅ Post messages');
        console.log('  ❌ Search messages (API limitation)');
        console.log('  ❌ Read channels without membership\n');

        if (testUserToken) {
            console.log('User Token (xoxp-):');
            console.log('  ✅ Read ALL public channel messages (no membership needed!)');
            console.log('  ✅ Search messages across workspace');
            console.log('  ✅ View all public channels');
            console.log('  ⚠️  Cannot post as app (posts as user)\n');

            console.log('🎉 BEST OF BOTH WORLDS:');
            console.log('  • Bot token for posting messages as the app');
            console.log('  • User token for reading all channels automatically');
            console.log('  • No manual bot invites required!');
        } else {
            console.log('⚠️  No User Token:');
            console.log('  • Bot must be manually invited to each channel');
            console.log('  • Cannot search messages');
            console.log('  • Limited functionality for Slack Daily Digest\n');

            console.log('💡 TO ENABLE FULL ACCESS:');
            console.log('  1. Go to api.slack.com/apps → Your App → OAuth & Permissions');
            console.log('  2. Add User Token Scopes: channels:history, channels:read, search:read, users:read');
            console.log('  3. Users reconnect their Slack workspace');
            console.log('  4. User token will be automatically stored alongside bot token');
        }

        console.log('\n✅ Test completed successfully!');
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
