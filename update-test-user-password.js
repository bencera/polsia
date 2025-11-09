/**
 * Update Test User Password Script
 *
 * This script generates a strong random password and updates the test@polsia.ai user
 *
 * Usage:
 *   node update-test-user-password.js
 *
 * Or with custom password:
 *   node update-test-user-password.js "YourCustomPassword123!"
 */

require('dotenv').config();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { Pool } = require('pg');

async function updatePassword() {
  // Generate a strong random password or use provided one
  const password = process.argv[2] || crypto.randomBytes(15).toString('base64').slice(0, 20);

  console.log('Generating bcrypt hash...');
  const hash = await bcrypt.hash(password, 10);

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    const result = await pool.query(
      'UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id, email, name',
      [hash, 'test@polsia.ai']
    );

    if (result.rows.length === 0) {
      console.error('❌ User test@polsia.ai not found!');
      process.exit(1);
    }

    console.log('\n✅ Password updated successfully!');
    console.log('User:', result.rows[0]);
    console.log('\n📝 New credentials:');
    console.log('Email:', 'test@polsia.ai');
    console.log('Password:', password);
    console.log('\n⚠️  Save this password somewhere safe!');

  } catch (error) {
    console.error('❌ Error updating password:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

updatePassword();
