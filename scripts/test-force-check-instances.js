require('dotenv').config();
const { Pool } = require('pg');
const { AppStoreConnectClient } = require('../services/appstore-connect-service');
const { decryptToken } = require('../utils/encryption');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function testForceCheckInstances() {
  const client = await pool.connect();

  try {
    console.log('\n=== FORCE CHECK INSTANCES (Ignore instanceCount) ===\n');

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

    // Try all the report IDs we got
    const reportIds = [
      'r39-e892d9be-3516-4afe-b75c-25873ead2e6e',
      'r154-e892d9be-3516-4afe-b75c-25873ead2e6e',
      'r41-e892d9be-3516-4afe-b75c-25873ead2e6e',
      'r162-e892d9be-3516-4afe-b75c-25873ead2e6e',
      'r43-e892d9be-3516-4afe-b75c-25873ead2e6e',
      'r44-e892d9be-3516-4afe-b75c-25873ead2e6e',
      'r163-e892d9be-3516-4afe-b75c-25873ead2e6e',
      'r46-e892d9be-3516-4afe-b75c-25873ead2e6e',
      'r47-e892d9be-3516-4afe-b75c-25873ead2e6e',
      'r48-e892d9be-3516-4afe-b75c-25873ead2e6e'
    ];

    console.log(`Testing ${reportIds.length} report IDs...\n`);

    for (const reportId of reportIds) {
      console.log(`\n--- ${reportId} ---`);
      try {
        const instances = await appStoreClient.getAnalyticsReportInstances(reportId);

        if (instances.length > 0) {
          console.log(`✅ FOUND ${instances.length} instance(s)!`);
          console.log(JSON.stringify(instances, null, 2));

          // Try to download first segment if available
          if (instances[0].segments && instances[0].segments.length > 0) {
            const segment = instances[0].segments[0];
            console.log('\n🔽 Attempting download...');
            try {
              const parsed = await appStoreClient.downloadAndParseAnalyticsReport(segment.url);
              console.log('✅ DOWNLOAD SUCCESS!');
              console.log('Summary:', JSON.stringify(parsed.summary, null, 2));
            } catch (dlErr) {
              console.log('❌ Download failed:', dlErr.message);
            }
          }

        } else {
          console.log('⏳ No instances yet');
        }

      } catch (error) {
        console.log('❌ Error:', error.message);
        if (error.response?.status === 404) {
          console.log('   (Report not found - likely still processing)');
        }
      }
    }

    console.log('\n\n=== SUMMARY ===');
    console.log('All reports are still processing. Apple typically takes 24-48 hours');
    console.log('to generate initial analytics data after enabling reports.');
    console.log('\nCheck again tomorrow!');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

testForceCheckInstances();
