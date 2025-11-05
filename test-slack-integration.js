#!/usr/bin/env node

/**
 * Test Slack Integration
 * Verifies that our custom Slack API service works with the bot token
 */

const { getSlackToken } = require('./db');
const { decryptToken } = require('./utils/encryption');
const { SlackAPIClient } = require('./services/slack-api-service');

async function testSlackIntegration() {
    console.log('🧪 Testing Slack Integration\n');

    try {
        // 1. Get encrypted token from database
        console.log('📥 Fetching Slack token from database...');
        const userId = 1; // Test user
        const encryptedToken = await getSlackToken(userId);

        if (!encryptedToken) {
            console.error('❌ No Slack token found for user. Please connect Slack first.');
            process.exit(1);
        }

        console.log('✅ Encrypted token retrieved\n');

        // 2. Decrypt token
        console.log('🔓 Decrypting bot token...');
        const botToken = decryptToken(encryptedToken);
        console.log(`✅ Bot token: ${botToken.substring(0, 15)}...\n`);

        // 3. Initialize Slack API client
        console.log('🔌 Initializing Slack API client...');
        const slackClient = new SlackAPIClient(botToken);
        console.log('✅ Client initialized\n');

        // 4. Test authentication
        console.log('🔐 Testing authentication (auth.test)...');
        const auth = await slackClient.authTest();
        console.log('✅ Authentication successful!');
        console.log(`   Workspace: ${auth.team}`);
        console.log(`   User: ${auth.user}`);
        console.log(`   Bot ID: ${auth.bot_id}`);
        console.log(`   Team ID: ${auth.team_id}\n`);

        // 5. Test get team info
        console.log('🏢 Getting workspace info (team.info)...');
        const teamInfo = await slackClient.getTeamInfo();
        console.log('✅ Team info retrieved:');
        console.log(`   Name: ${teamInfo.team.name}`);
        console.log(`   Domain: ${teamInfo.team.domain}`);
        console.log(`   Enterprise: ${teamInfo.team.enterprise_name || 'None'}\n`);

        // 6. Test list channels
        console.log('📋 Listing channels (conversations.list)...');
        const channels = await slackClient.listConversations('public_channel,private_channel', 10);
        console.log(`✅ Found ${channels.channels.length} channels:`);
        channels.channels.slice(0, 5).forEach(ch => {
            console.log(`   - #${ch.name} (${ch.id}) - ${ch.num_members || 0} members`);
        });
        if (channels.channels.length > 5) {
            console.log(`   ... and ${channels.channels.length - 5} more`);
        }
        console.log();

        // 7. Test get channel history (from first channel)
        if (channels.channels.length > 0) {
            const testChannel = channels.channels[0];
            console.log(`📜 Getting message history from #${testChannel.name}...`);

            // Get messages from past 24 hours
            const oneDayAgo = Math.floor(Date.now() / 1000) - (24 * 60 * 60);
            const history = await slackClient.getConversationHistory(
                testChannel.id,
                { limit: 5, oldest: oneDayAgo.toString() }
            );

            console.log(`✅ Retrieved ${history.messages.length} recent messages`);
            if (history.messages.length > 0) {
                console.log('   Latest message:');
                const latestMsg = history.messages[0];
                console.log(`   - User: ${latestMsg.user || 'Bot'}`);
                console.log(`   - Text: ${(latestMsg.text || '').substring(0, 100)}...`);
                console.log(`   - Timestamp: ${new Date(latestMsg.ts * 1000).toLocaleString()}`);
            } else {
                console.log('   (No messages in past 24 hours)');
            }
            console.log();
        }

        // 8. Test list users
        console.log('👥 Listing users (users.list)...');
        const users = await slackClient.listUsers(5);
        console.log(`✅ Found ${users.members.length} users (showing first 5):`);
        users.members.slice(0, 5).forEach(user => {
            if (!user.is_bot && !user.deleted) {
                console.log(`   - @${user.name || user.real_name} (${user.id})`);
            }
        });
        console.log();

        // 9. Test search (optional, may not work with all bot token scopes)
        console.log('🔍 Testing message search...');
        try {
            const searchResults = await slackClient.searchMessages('test', { limit: 3 });
            console.log(`✅ Search successful! Found ${searchResults.messages.total} matches`);
            if (searchResults.messages.matches && searchResults.messages.matches.length > 0) {
                console.log(`   Showing first match:`);
                const match = searchResults.messages.matches[0];
                console.log(`   - Channel: ${match.channel.name}`);
                console.log(`   - Text: ${match.text.substring(0, 100)}...`);
            }
        } catch (error) {
            console.log(`⚠️  Search failed (may need additional scopes): ${error.message}`);
        }
        console.log();

        // Summary
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🎉 ALL TESTS PASSED!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('\n✅ The Slack API integration is working correctly!');
        console.log('✅ Bot token has proper permissions');
        console.log('✅ Can list channels and read messages');
        console.log('✅ Ready for Slack Daily Digest module!\n');

        process.exit(0);

    } catch (error) {
        console.error('\n❌ TEST FAILED!');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error(`Error: ${error.message}`);
        if (error.response?.data) {
            console.error('Slack API Response:', JSON.stringify(error.response.data, null, 2));
        }
        console.error('\nStack trace:', error.stack);
        process.exit(1);
    }
}

// Run tests
testSlackIntegration();
