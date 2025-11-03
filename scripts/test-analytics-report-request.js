require('dotenv').config();
const { Pool } = require('pg');
const { AppStoreConnectClient } = require('../services/appstore-connect-service');
const { decryptToken } = require('../utils/encryption');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function testAnalyticsReportRequest() {
  const client = await pool.connect();

  try {
    console.log('\n=== TESTING ANALYTICS REPORT REQUEST ===\n');

    // Get connection
    const result = await client.query(
      "SELECT * FROM service_connections WHERE user_id = 1 AND service_name = 'appstore_connect' AND status = 'connected'"
    );

    if (result.rows.length === 0) {
      console.log('❌ No App Store Connect connection found');
      return;
    }

    const connection = result.rows[0];
    const metadata = connection.metadata;

    // Decrypt private key
    const privateKey = decryptToken({
      encrypted: metadata.encrypted_private_key,
      iv: metadata.private_key_iv,
      authTag: metadata.private_key_auth_tag
    });

    // Create client
    const appStoreClient = new AppStoreConnectClient(
      metadata.key_id,
      metadata.issuer_id,
      privateKey
    );

    console.log('✅ Client created\n');

    // Get primary app
    const primaryApp = metadata.primary_app;
    if (!primaryApp) {
      console.log('❌ No primary app configured');
      return;
    }

    console.log(`Primary App: ${primaryApp.name}`);
    console.log(`App ID: ${primaryApp.id}\n`);

    // Test: Enable ongoing analytics
    console.log('--- Test: Enable Ongoing Analytics Reports ---');
    try {
      const request = await appStoreClient.createAnalyticsReportRequest(primaryApp.id);

      console.log('✅ Analytics report delivery enabled!');
      console.log('Request ID:', request.id);
      console.log('Access Type:', request.attributes?.accessType);
      console.log('\n📊 What this means:');
      console.log('- Apple will now continuously generate analytics reports for this app');
      console.log('- Reports available at: App Store Connect > Analytics');
      console.log('- Includes: downloads, revenue, engagement, retention');
      console.log('- This is a ONE-TIME setup');
      console.log('\n💡 Reports may take 24-48 hours to start appearing');

      // Check status
      console.log('\n--- Checking Status ---');
      const status = await appStoreClient.getAnalyticsReportRequest(request.id);
      console.log('Status:', JSON.stringify(status, null, 2));

    } catch (error) {
      console.log('❌ Failed:', error.message);
      if (error.response?.data) {
        console.log('API Error:', JSON.stringify(error.response.data, null, 2));
      }
      console.log('\n💡 Note: If already enabled, you\'ll see an error. That\'s expected!');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

testAnalyticsReportRequest();
