require('dotenv').config();
const { Pool } = require('pg');
const { AppStoreConnectClient } = require('../services/appstore-connect-service');
const { decryptToken } = require('../utils/encryption');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function testManualFetchAnalytics() {
  const client = await pool.connect();

  try {
    console.log('\n=== MANUAL ANALYTICS DATA FETCH TEST ===\n');

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

    console.log('✅ Found App Store Connect connection');
    console.log('Primary App:', metadata.primary_app?.name || 'Not set');

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

    // The request ID we created earlier
    const requestId = 'e892d9be-3516-4afe-b75c-25873ead2e6e';
    console.log('\n📝 Using request ID:', requestId);

    // Step 1: Get request status and list of reports
    console.log('\n--- Step 1: Get Analytics Request Status ---');
    try {
      const requestStatus = await appStoreClient.getAnalyticsReportRequest(requestId);
      console.log('✅ Request Status:', JSON.stringify(requestStatus, null, 2));

      if (requestStatus.reports && requestStatus.reports.length > 0) {
        console.log(`\n✅ Found ${requestStatus.reports.length} report(s)!`);

        // Step 2: For each report, check for instances
        for (const report of requestStatus.reports) {
          console.log(`\n--- Checking Report: ${report.name} (${report.id}) ---`);
          console.log(`Category: ${report.category}`);
          console.log(`Instance Count: ${report.instanceCount}`);

          if (report.instanceCount && report.instanceCount > 0) {
            // Step 3: Get report instances
            console.log('\n--- Fetching Report Instances ---');
            try {
              const instances = await appStoreClient.getAnalyticsReportInstances(report.id);

              if (instances.length > 0) {
                console.log(`✅ Found ${instances.length} instance(s)!`);

                // Sort by processing date to get latest
                const sortedInstances = instances.sort((a, b) => {
                  return new Date(b.processingDate) - new Date(a.processingDate);
                });

                const latestInstance = sortedInstances[0];
                console.log('\nLatest Instance:');
                console.log('  ID:', latestInstance.id);
                console.log('  Processing Date:', latestInstance.processingDate);
                console.log('  Granularity:', latestInstance.granularity);
                console.log('  Segments:', latestInstance.segments.length);

                // Step 4: Try to download the first segment
                if (latestInstance.segments.length > 0) {
                  const segment = latestInstance.segments[0];
                  console.log('\n--- Downloading Segment ---');
                  console.log('Segment ID:', segment.id);
                  console.log('Size:', segment.sizeInBytes, 'bytes');
                  console.log('URL:', segment.url);

                  try {
                    const parsed = await appStoreClient.downloadAndParseAnalyticsReport(segment.url);

                    console.log('\n✅ SUCCESS! Report downloaded and parsed!');
                    console.log('\nSummary:');
                    console.log(JSON.stringify(parsed.summary, null, 2));

                    console.log('\nHeaders:', parsed.headers.join(', '));
                    console.log('\nSample Data (first 3 rows):');
                    console.log(JSON.stringify(parsed.data.slice(0, 3), null, 2));

                  } catch (downloadError) {
                    console.log('❌ Failed to download:', downloadError.message);
                    if (downloadError.response?.data) {
                      console.log('Details:', downloadError.response.data);
                    }
                  }
                } else {
                  console.log('⚠️  No segments available for this instance');
                }

              } else {
                console.log('⏳ No instances available yet for this report');
              }

            } catch (instanceError) {
              console.log('❌ Failed to fetch instances:', instanceError.message);
              if (instanceError.response?.data) {
                console.log('Details:', JSON.stringify(instanceError.response.data, null, 2));
              }
            }

          } else {
            console.log('⏳ No instances available yet for this report');
          }
        }

      } else {
        console.log('\n⏳ No reports available yet. Reports may still be processing.');
        console.log('   Apple typically takes 24-48 hours to generate initial reports.');
      }

    } catch (error) {
      console.log('❌ Failed to get request status:', error.message);
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

testManualFetchAnalytics();
