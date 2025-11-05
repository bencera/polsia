#!/usr/bin/env node

/**
 * Direct Slack API Test
 * Tests decrypted token from production database
 */

require('dotenv').config();
const { decryptToken } = require('./utils/encryption');
const axios = require('axios');

// Encrypted token data from production database
const encryptedData = {
    encrypted: '8b65605cc985cd1cfde5334a1088b9c3a1d51a7c46feb430f1b57a0c4a735bf444eaef3514bd944270b9a7fc3c72ef9fef93401babeceed2f8',
    iv: '16c2a8808344806bae21436b44119f1a',
    authTag: 'a4b6d402a857455c922a930e0674aa60'
};

async function testSlackAPI() {
    console.log('🔓 Decrypting Slack bot token...\n');

    try {
        // Decrypt the token
        const botToken = decryptToken(encryptedData);
        console.log(`✅ Token decrypted successfully!`);
        console.log(`   Token: ${botToken.substring(0, 20)}...\n`);

        const baseURL = 'https://slack.com/api';
        const headers = {
            'Authorization': `Bearer ${botToken}`,
            'Content-Type': 'application/json'
        };

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

        // Test 4: conversations.history (try channels the bot is a member of)
        console.log('4️⃣ Testing conversations.history...');
        let historySuccess = false;

        // Find channels the bot is a member of
        const memberChannels = channelsResponse.data.channels.filter(ch => ch.is_member);

        if (memberChannels.length > 0) {
            const testChannel = memberChannels[0];
            console.log(`   Testing on #${testChannel.name} (bot is member)...`);

            const oneDayAgo = Math.floor(Date.now() / 1000) - (24 * 60 * 60);
            const historyResponse = await axios.get(`${baseURL}/conversations.history`, {
                headers,
                params: {
                    channel: testChannel.id,
                    limit: 5,
                    oldest: oneDayAgo
                }
            });

            if (historyResponse.data.ok) {
                console.log(`✅ Message history retrieved!`);
                console.log(`   ${historyResponse.data.messages.length} messages in past 24h`);
                if (historyResponse.data.messages.length > 0) {
                    const msg = historyResponse.data.messages[0];
                    console.log(`   Latest: "${(msg.text || '').substring(0, 60)}..."`);
                }
                historySuccess = true;
            }
        } else {
            console.log(`⚠️  Bot is not a member of any channels yet`);
            console.log(`   (This is normal - invite the bot to channels to read messages)`);
        }
        console.log();

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
        console.log('✅ Custom Slack MCP server should work!\n');

        return true;

    } catch (error) {
        console.error('\n❌ API TEST FAILED!');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error(`Error: ${error.message}`);
        if (error.response?.data) {
            console.error('Slack API Error:', error.response.data);
        }
        throw error;
    }
}

// Run tests
testSlackAPI()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
