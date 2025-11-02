require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function cleanupIncorrectData() {
  const client = await pool.connect();
  try {
    console.log('\n🧹 Starting database cleanup...\n');

    // 1. Delete incorrect profiles (CASCADE will delete their social_accounts)
    console.log('Deleting incorrect profiles (2, 3, 4, 5, 6)...');
    const deleteProfilesResult = await client.query(
      'DELETE FROM profiles WHERE id IN (2, 3, 4, 5, 6) RETURNING id, name'
    );
    console.log(`✅ Deleted ${deleteProfilesResult.rowCount} profiles:`);
    deleteProfilesResult.rows.forEach(p => console.log(`   - ID ${p.id}: ${p.name}`));

    // 2. Delete Instagram service connection (it references old profile)
    console.log('\nDeleting Instagram service connection with old profile reference...');
    const deleteConnectionResult = await client.query(
      "DELETE FROM service_connections WHERE service_name = 'instagram' AND user_id = 1 RETURNING id, metadata->>'username' as username"
    );
    console.log(`✅ Deleted ${deleteConnectionResult.rowCount} service connection(s):`);
    deleteConnectionResult.rows.forEach(c => console.log(`   - ID ${c.id}: @${c.username}`));

    console.log('\n✨ Cleanup complete!\n');
    console.log('Remaining data:');

    // Check what's left
    const remainingProfiles = await client.query(
      'SELECT id, user_id, name, late_profile_id FROM profiles WHERE user_id = 1 ORDER BY id'
    );
    console.log('\nProfiles:');
    console.table(remainingProfiles.rows);

    const remainingAccounts = await client.query(
      'SELECT id, profile_id, platform, account_handle FROM social_accounts ORDER BY id'
    );
    console.log('Social Accounts:');
    if (remainingAccounts.rows.length === 0) {
      console.log('  (none - will be created when Instagram is reconnected)\n');
    } else {
      console.table(remainingAccounts.rows);
    }

    const remainingConnections = await client.query(
      "SELECT id, user_id, service_name, status FROM service_connections WHERE service_name = 'instagram'"
    );
    console.log('Instagram Service Connections:');
    if (remainingConnections.rows.length === 0) {
      console.log('  (none - will be created when Instagram is reconnected)\n');
    } else {
      console.table(remainingConnections.rows);
    }

    console.log('\n📝 Next step: Reconnect Instagram to sync to the correct profile (ID 7)\n');

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

cleanupIncorrectData();
