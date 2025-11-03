require('dotenv').config();
const { Pool } = require('pg');
const { AppStoreConnectClient } = require('../services/appstore-connect-service');
const { decryptToken } = require('../utils/encryption');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function testFetchReportInstances() {
  const client = await pool.connect();

  try {
    console.log('\n=== TESTING REPORT INSTANCES (ACTUAL DATA) ===\n');

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

    const reportId = 'r39-e892d9be-3516-4afe-b75c-25873ead2e6e';

    // Fetch report instances (the actual generated data)
    console.log('--- Fetching Report Instances (Generated Data) ---');
    try {
      const response = await appStoreClient.client.get(`/analyticsReports/${reportId}/instances`);

      console.log('✅ Success! Report instances:');
      console.log('Total instances:', response.data.data?.length || 0);

      if (response.data.data && response.data.data.length > 0) {
        console.log('\nFirst instance details:');
        const instance = response.data.data[0];
        console.log('  ID:', instance.id);
        console.log('  Granularity:', instance.attributes?.granularity);
        console.log('  Processing Date:', instance.attributes?.processingDate);

        // Check if there are segments (the actual data)
        if (instance.relationships?.segments?.links?.related) {
          console.log('\n  Segments URL:', instance.relationships.segments.links.related);

          // Try to fetch the segments (actual data)
          console.log('\n--- Fetching Segment Data ---');
          try {
            const segmentResponse = await appStoreClient.client.get(instance.relationships.segments.links.related);
            console.log('✅ Segment data retrieved!');
            console.log(JSON.stringify(segmentResponse.data, null, 2));
          } catch (segError) {
            console.log('❌ Failed to fetch segment:', segError.message);
          }
        }
      } else {
        console.log('\n⏳ No instances available yet. Reports may still be processing.');
        console.log('   Try again in 24-48 hours after enabling analytics.');
      }

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

testFetchReportInstances();
