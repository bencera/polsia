require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function fixProfileName() {
  const client = await pool.connect();
  try {
    console.log('Updating profile name to "Test User (Polsia #1)"...\n');

    const result = await client.query(
      `UPDATE profiles
       SET name = 'Test User (Polsia #1)'
       WHERE id = 7 AND late_profile_id = '69049b9128d7b9a6a7537347'
       RETURNING id, name, late_profile_id`
    );

    console.log('✅ Profile updated:');
    console.table(result.rows);

  } catch (error) {
    console.error('❌ Error updating profile:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

fixProfileName();
