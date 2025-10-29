/**
 * Script to reset test user password
 * Usage: node reset-test-password.js
 */

require('dotenv').config();
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function resetPassword() {
  const email = 'test@polsia.ai';
  const newPassword = 'test123';

  try {
    // Hash new password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    const result = await pool.query(
      'UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id',
      [passwordHash, email]
    );

    if (result.rows.length === 0) {
      console.log('❌ User not found!');
      process.exit(1);
    }

    console.log('✅ Password reset successfully!');
    console.log('\n📧 Email:', email);
    console.log('🔑 Password:', newPassword);
    console.log('\n🔗 Login at: http://localhost:5173/login');
    console.log('🔗 Production: https://polsia.ai/login');

  } catch (error) {
    console.error('❌ Error resetting password:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

resetPassword();
