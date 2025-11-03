require('dotenv').config();
const { Pool } = require('pg');
const { AppStoreConnectClient } = require('../services/appstore-connect-service');
const { decryptToken } = require('../utils/encryption');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function testDownloadReport() {
  const client = await pool.connect();

  try {
    console.log('\n=== TESTING REPORT DATA ACCESS ===\n');

    // Get connection
    const result = await client.query(
      "SELECT * FROM service_connections WHERE user_id = 1 AND service_name = 'appstore_connect' AND status = 'connected'"
    );

    const connection = result.rows[0];
    const metadata = connection.metadata;

    const privateKey = decryptToken({
      encrypted: metadata.encrypted_private_key,
      iv: metadata.private_key_iv,
      authTag: metadata.private_key_auth_tag
    });

    const appStoreClient = new AppStoreConnectClient(
      metadata.key_id,
      metadata.issuer_id,
      privateKey
    );

    // The request ID we created earlier
    const requestId = 'e892d9be-3516-4afe-b75c-25873ead2e6e';

    console.log('Testing various endpoints to access report data...\n');

    // Test 1: Try to list analytics report instances
    console.log('--- Test 1: List Analytics Report Instances ---');
    try {
      const response = await appStoreClient.client.get('/analyticsReportInstances', {
        params: {
          'filter[report]': 'r39-e892d9be-3516-4afe-b75c-25873ead2e6e' // One of the report IDs we got
        }
      });
      console.log('✅ Success! Report instances found:');
      console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.log('❌ Failed:', error.message);
    }

    // Test 2: Try to get a specific report
    console.log('\n--- Test 2: Get Specific Report ---');
    try {
      const response = await appStoreClient.client.get('/analyticsReports/r39-e892d9be-3516-4afe-b75c-25873ead2e6e');
      console.log('✅ Success! Report data:');
      console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.log('❌ Failed:', error.message);
    }

    // Test 3: Try to list all analytics report segments
    console.log('\n--- Test 3: List Report Segments ---');
    try {
      const response = await appStoreClient.client.get('/analyticsReportSegments', {
        params: {
          limit: 10
        }
      });
      console.log('✅ Success! Report segments:');
      console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.log('❌ Failed:', error.message);
    }

    // Test 4: Check if we can access sales reports endpoint
    console.log('\n--- Test 4: Sales Reports Endpoint ---');
    try {
      const response = await appStoreClient.client.get('/salesReports', {
        params: {
          'filter[frequency]': 'DAILY',
          'filter[reportType]': 'SALES',
          'filter[vendorNumber]': '123456' // Placeholder
        }
      });
      console.log('✅ Success! Sales reports:');
      console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.log('❌ Failed:', error.message);
      if (error.response?.data) {
        console.log('Details:', JSON.stringify(error.response.data, null, 2));
      }
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

testDownloadReport();
