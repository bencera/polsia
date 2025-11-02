require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function checkDatabaseState() {
  const client = await pool.connect();
  try {
    console.log('\n=== PROFILES ===');
    const profilesResult = await client.query(
      'SELECT id, user_id, name, late_profile_id FROM profiles ORDER BY id'
    );
    console.table(profilesResult.rows);

    console.log('\n=== SOCIAL ACCOUNTS ===');
    const accountsResult = await client.query(
      'SELECT id, profile_id, platform, account_handle, late_account_id FROM social_accounts ORDER BY id'
    );
    console.table(accountsResult.rows);

    console.log('\n=== SERVICE CONNECTIONS (Instagram) ===');
    const connectionsResult = await client.query(
      "SELECT id, user_id, service_name, status, metadata FROM service_connections WHERE service_name = 'instagram' ORDER BY id"
    );
    console.table(connectionsResult.rows);

  } catch (error) {
    console.error('Error checking database:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

checkDatabaseState();
