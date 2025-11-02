/**
 * Script to create a test user
 * Usage: node create-test-user.js
 */

require('dotenv').config();
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const { initializeDocumentStore } = require('./services/document-store');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function createTestUser() {
  const email = 'test@polsia.ai';
  const password = 'test123';
  const name = 'Test User';

  try {
    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      console.log('❌ Test user already exists!');
      console.log('\nCredentials:');
      console.log('Email:', email);
      console.log('Password:', password);
      process.exit(0);
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Insert user
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id',
      [email, passwordHash, name]
    );

    const userId = result.rows[0].id;

    // Initialize document store for the new user
    await initializeDocumentStore(userId);

    console.log('✅ Test user created successfully!');
    console.log('✅ Document store initialized!');
    console.log('\nCredentials:');
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('\nUser ID:', userId);
    console.log('\n🔗 Login at: http://localhost:5173/login');
    console.log('🔗 Production: https://polsia.ai/login');

  } catch (error) {
    console.error('❌ Error creating test user:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

createTestUser();
