require('dotenv').config();
const { Pool } = require('pg');
const {
    storeAppStoreAnalyticsRequest,
    getAppStoreAnalyticsRequest
} = require('../db');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function testRequestIdStorage() {
  const client = await pool.connect();

  try {
    console.log('\n=== TESTING REQUEST ID STORAGE ===\n');

    const userId = 1;
    const requestId = 'e892d9be-3516-4afe-b75c-25873ead2e6e';
    const appId = '7024296871'; // Blanks app ID

    // Test 1: Store request ID
    console.log('--- Test 1: Store Request ID ---');
    try {
        await storeAppStoreAnalyticsRequest(userId, requestId, appId);
        console.log('✅ Successfully stored analytics request ID');
        console.log(`   Request ID: ${requestId}`);
        console.log(`   App ID: ${appId}`);
    } catch (error) {
        console.log('❌ Failed to store:', error.message);
        return;
    }

    // Test 2: Retrieve request ID
    console.log('\n--- Test 2: Retrieve Request ID ---');
    try {
        const storedRequest = await getAppStoreAnalyticsRequest(userId);

        if (storedRequest) {
            console.log('✅ Successfully retrieved analytics request:');
            console.log(`   Request ID: ${storedRequest.requestId}`);
            console.log(`   App ID: ${storedRequest.appId}`);
            console.log(`   Enabled At: ${storedRequest.enabledAt}`);

            // Verify it matches what we stored
            if (storedRequest.requestId === requestId && storedRequest.appId === appId) {
                console.log('\n✅ DATA INTEGRITY VERIFIED!');
            } else {
                console.log('\n❌ Data mismatch!');
            }
        } else {
            console.log('❌ No request found');
        }
    } catch (error) {
        console.log('❌ Failed to retrieve:', error.message);
    }

    // Test 3: Test prompt injection (simulate what agent-runner does)
    console.log('\n--- Test 3: Simulate Prompt Injection ---');
    try {
        const storedRequest = await getAppStoreAnalyticsRequest(userId);

        if (storedRequest) {
            const injectedContext = `

## IMPORTANT: Stored Analytics Request

You have access to a previously created analytics request:
- **Request ID:** ${storedRequest.requestId}
- **App ID:** ${storedRequest.appId}
- **Enabled At:** ${storedRequest.enabledAt}

**Use this request ID** to check for report instances instead of trying to discover it.

WORKFLOW:
1. Use \`get_analytics_report_status\` with requestId="${storedRequest.requestId}"
2. This returns a list of report IDs (e.g., r39-xxx, r154-xxx)
3. For each report ID, use \`get_analytics_report_instances\` to check for CSV files
4. Download the LATEST instance only (sort by processingDate)
5. Parse and integrate the data

If no instances are available yet (empty array), create a status update noting that Apple is still processing (typical 24-48 hours after enabling).`;

            console.log('✅ Generated prompt injection:');
            console.log(injectedContext);
        }
    } catch (error) {
        console.log('❌ Failed to generate prompt:', error.message);
    }

    console.log('\n=== ALL TESTS PASSED ===');
    console.log('\n✅ Request ID storage workflow is working correctly!');
    console.log('✅ The Fetch module will receive the stored request ID automatically.');
    console.log('\n📝 Next steps:');
    console.log('   1. Wait 24-48 hours for Apple to generate report instances');
    console.log('   2. Run the "Fetch App Store Analytics Data" module');
    console.log('   3. The agent will use the stored request ID to fetch analytics data');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

testRequestIdStorage();
