require('dotenv').config();
const { Pool } = require('pg');
const { AppStoreConnectClient } = require('../services/appstore-connect-service');
const { decryptToken } = require('../utils/encryption');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function testAppStoreAPI() {
  const client = await pool.connect();

  try {
    console.log('\n=== TESTING APP STORE CONNECT API ===\n');

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
    const primaryApp = metadata.primary_app;

    console.log(`App: ${primaryApp.name}`);
    console.log(`App ID: ${primaryApp.id}`);
    console.log(`Bundle ID: ${primaryApp.bundle_id}\n`);

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

    // Test 1: Get app info
    console.log('--- Test 1: Get App Info ---');
    try {
      const appInfo = await appStoreClient.getAppInfo(primaryApp.id);
      console.log('✅ App info retrieved:');
      console.log('  Name:', appInfo.attributes?.name);
      console.log('  Bundle ID:', appInfo.attributes?.bundleId);
      console.log('  SKU:', appInfo.attributes?.sku);
      console.log('  Primary Locale:', appInfo.attributes?.primaryLocale);
      console.log('  Content Rights:', appInfo.attributes?.contentRightsDeclaration);
    } catch (error) {
      console.log('❌ Failed:', error.message);
    }

    // Test 2: Try perfPowerMetrics (current implementation)
    console.log('\n--- Test 2: Get Performance Metrics (current) ---');
    try {
      const metrics = await appStoreClient.getAppMetrics(primaryApp.id);
      console.log('✅ Performance metrics:', JSON.stringify(metrics, null, 2));
    } catch (error) {
      console.log('❌ Failed:', error.message);
      console.log('   This is expected - perfPowerMetrics is not for analytics');
    }

    // Test 3: Try to list available analytics report types
    console.log('\n--- Test 3: List Analytics Report Requests ---');
    try {
      const response = await appStoreClient.client.get('/analyticsReportRequests');
      console.log('✅ Analytics requests:', JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.log('❌ Failed:', error.message);
    }

    // Test 4: Check what endpoints are available for the app
    console.log('\n--- Test 4: Get App with Includes ---');
    try {
      const response = await appStoreClient.client.get(`/apps/${primaryApp.id}`, {
        params: {
          include: 'appStoreVersions,builds,betaGroups'
        }
      });
      console.log('✅ App data with relationships available');
      console.log('Included types:', response.data.included?.map(i => i.type).join(', '));
    } catch (error) {
      console.log('❌ Failed:', error.message);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

testAppStoreAPI();
