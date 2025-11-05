#!/usr/bin/env node

/**
 * Remote Slack API Test
 * Tests Slack API endpoints with actual bot token from production
 * Can be run on Render via SSH
 */

const axios = require('axios');

// Slack API test function
async function testSlackAPI(botToken) {
    console.log('🧪 Testing Slack Web API\n');

    const baseURL = 'https://slack.com/api';
    const headers = {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json'
    };

    try {
        // Test 1: auth.test
        console.log('1️⃣ Testing auth.test...');
        const authResponse = await axios.get(`${baseURL}/auth.test`, { headers });
        if (!authResponse.data.ok) {
            throw new Error(`Auth failed: ${authResponse.data.error}`);
        }
        console.log(`✅ Auth successful!`);
        console.log(`   Team: ${authResponse.data.team}`);
        console.log(`   User: ${authResponse.data.user}`);
        console.log(`   Bot ID: ${authResponse.data.bot_id}\n`);

        // Test 2: team.info
        console.log('2️⃣ Testing team.info...');
        const teamResponse = await axios.get(`${baseURL}/team.info`, { headers });
        if (!teamResponse.data.ok) {
            throw new Error(`Team info failed: ${teamResponse.data.error}`);
        }
        console.log(`✅ Team info retrieved!`);
        console.log(`   Name: ${teamResponse.data.team.name}`);
        console.log(`   Domain: ${teamResponse.data.team.domain}\n`);

        // Test 3: conversations.list
        console.log('3️⃣ Testing conversations.list...');
        const channelsResponse = await axios.get(`${baseURL}/conversations.list`, {
            headers,
            params: {
                types: 'public_channel,private_channel',
                limit: 10,
                exclude_archived: true
            }
        });
        if (!channelsResponse.data.ok) {
            throw new Error(`List channels failed: ${channelsResponse.data.error}`);
        }
        console.log(`✅ Channels retrieved!`);
        console.log(`   Found ${channelsResponse.data.channels.length} channels:`);
        channelsResponse.data.channels.slice(0, 5).forEach(ch => {
            console.log(`   - #${ch.name} (${ch.id})`);
        });
        console.log();

        // Test 4: conversations.history (if we have channels)
        if (channelsResponse.data.channels.length > 0) {
            const testChannel = channelsResponse.data.channels[0];
            console.log(`4️⃣ Testing conversations.history on #${testChannel.name}...`);

            const oneDayAgo = Math.floor(Date.now() / 1000) - (24 * 60 * 60);
            const historyResponse = await axios.get(`${baseURL}/conversations.history`, {
                headers,
                params: {
                    channel: testChannel.id,
                    limit: 5,
                    oldest: oneDayAgo
                }
            });

            if (!historyResponse.data.ok) {
                throw new Error(`History failed: ${historyResponse.data.error}`);
            }
            console.log(`✅ Message history retrieved!`);
            console.log(`   ${historyResponse.data.messages.length} messages in past 24h`);
            if (historyResponse.data.messages.length > 0) {
                const msg = historyResponse.data.messages[0];
                console.log(`   Latest: "${(msg.text || '').substring(0, 60)}..."`);
            }
            console.log();
        }

        // Test 5: users.list
        console.log('5️⃣ Testing users.list...');
        const usersResponse = await axios.get(`${baseURL}/users.list`, {
            headers,
            params: { limit: 5 }
        });
        if (!usersResponse.data.ok) {
            throw new Error(`List users failed: ${usersResponse.data.error}`);
        }
        console.log(`✅ Users retrieved!`);
        console.log(`   Found ${usersResponse.data.members.length} users (showing 3):`);
        usersResponse.data.members.slice(0, 3).forEach(user => {
            if (!user.is_bot && !user.deleted) {
                console.log(`   - @${user.name || user.real_name}`);
            }
        });
        console.log();

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🎉 ALL API TESTS PASSED!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('✅ Bot token is valid and working');
        console.log('✅ Can list channels and read messages');
        console.log('✅ Has proper scopes for workspace access');
        console.log('✅ Ready for MCP server integration!\n');

        return true;

    } catch (error) {
        console.error('\n❌ API TEST FAILED!');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error(`Error: ${error.message}`);
        if (error.response?.data) {
            console.error('Slack API Error:', error.response.data.error);
        }
        throw error;
    }
}

// If bot token provided as argument, test it directly
const botToken = process.argv[2];

if (botToken) {
    testSlackAPI(botToken)
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
} else {
    // Otherwise, try to get it from database (for production use)
    console.log('Usage: node test-slack-api-remote.js <bot-token>');
    console.log('Or run on Render server where DATABASE_URL is available\n');

    // Try database method
    const { getSlackToken } = require('./db');
    const { decryptToken } = require('./utils/encryption');

    (async () => {
        try {
            const encryptedToken = await getSlackToken(1);
            if (!encryptedToken) {
                console.error('❌ No Slack token found');
                process.exit(1);
            }
            const token = decryptToken(encryptedToken);
            await testSlackAPI(token);
            process.exit(0);
        } catch (error) {
            console.error('Failed:', error.message);
            process.exit(1);
        }
    })();
}

module.exports = { testSlackAPI };
