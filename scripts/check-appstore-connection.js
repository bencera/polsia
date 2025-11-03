require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function checkAppStoreConnection() {
  const client = await pool.connect();
  try {
    console.log('\n=== APP STORE CONNECT CONNECTIONS ===');
    const result = await client.query(
      "SELECT id, user_id, service_name, status, created_at, metadata FROM service_connections WHERE service_name = 'appstore_connect' ORDER BY id"
    );

    if (result.rows.length === 0) {
      console.log('❌ No App Store Connect connections found');
    } else {
      result.rows.forEach(row => {
        console.log('\nConnection ID:', row.id);
        console.log('User ID:', row.user_id);
        console.log('Status:', row.status);
        console.log('Created:', row.created_at);
        console.log('Metadata:', JSON.stringify(row.metadata, null, 2));

        if (row.metadata?.primary_app) {
          console.log('✅ Primary App:', row.metadata.primary_app.name);
        } else {
          console.log('❌ No primary app configured');
        }
      });
    }

  } catch (error) {
    console.error('Error checking database:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

checkAppStoreConnection();
