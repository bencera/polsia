require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function checkAnalyticsDoc() {
  const client = await pool.connect();
  try {
    console.log('\n=== CHECKING ANALYTICS DOCUMENT ===\n');

    const result = await client.query(
      "SELECT analytics_md FROM document_store WHERE user_id = 1"
    );

    if (result.rows.length === 0) {
      console.log('❌ No document store found for user 1');
    } else {
      const content = result.rows[0].analytics_md;
      console.log('✅ Analytics document found!');
      console.log('\nLength:', content.length, 'characters');
      console.log('\nFirst 500 characters:');
      console.log('---');
      console.log(content.substring(0, 500));
      console.log('---');

      // Check for App Store section
      if (content.includes('App Store Performance')) {
        console.log('\n✅ Contains "App Store Performance" section');
      } else {
        console.log('\n❌ Missing "App Store Performance" section');
      }

      if (content.includes('Blanks')) {
        console.log('✅ Contains "Blanks" app name');
      }
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

checkAnalyticsDoc();
