#!/usr/bin/env node

/**
 * Get Authentication Token Helper Script
 *
 * This script helps you obtain a JWT token for authenticating with the Polsia API.
 * It can either register a new user or login with existing credentials.
 *
 * Usage:
 *   node scripts/get-auth-token.js [email] [password]
 *
 * Environment Variables:
 *   POLSIA_API_URL - Polsia backend URL (default: http://localhost:3001)
 */

const http = require('http');
const https = require('https');
const readline = require('readline');

const API_URL = process.env.POLSIA_API_URL || 'http://localhost:3000';

/**
 * Make HTTP request
 */
function makeRequest(url, options, postData = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;

    const reqOptions = {
      ...options,
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
    };

    const req = client.request(reqOptions, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });

    req.on('error', reject);

    if (postData) {
      req.write(JSON.stringify(postData));
    }

    req.end();
  });
}

/**
 * Prompt for user input
 */
function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Login to get JWT token
 */
async function login(email, password) {
  console.log('\n🔐 Logging in to Polsia...');

  const response = await makeRequest(
    `${API_URL}/api/auth/login`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    },
    { email, password }
  );

  return response.token;
}

/**
 * Register new user and get JWT token
 */
async function register(email, password, name) {
  console.log('\n📝 Registering new user...');

  const response = await makeRequest(
    `${API_URL}/api/register`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    },
    { email, password, name }
  );

  return response.token;
}

/**
 * Main function
 */
async function main() {
  console.log('🔑 Polsia Authentication Token Helper\n');
  console.log('=' .repeat(60));
  console.log(`API URL: ${API_URL}`);
  console.log('=' .repeat(60));
  console.log('');

  try {
    let email, password;

    // Get credentials from command line args or prompt
    if (process.argv.length >= 4) {
      email = process.argv[2];
      password = process.argv[3];
      console.log(`Using credentials from command line for: ${email}`);
    } else {
      console.log('Please enter your credentials:\n');
      email = await prompt('Email: ');
      password = await prompt('Password: ');
    }

    if (!email || !password) {
      console.error('❌ Email and password are required');
      process.exit(1);
    }

    // Try to login first
    let token;
    try {
      token = await login(email, password);
      console.log('\n✅ Login successful!');
    } catch (loginError) {
      // If login fails, ask if they want to register
      console.log(`\n⚠️  Login failed: ${loginError.message}`);

      const shouldRegister = await prompt('\nWould you like to register a new account? (y/n): ');

      if (shouldRegister.toLowerCase() === 'y' || shouldRegister.toLowerCase() === 'yes') {
        const name = await prompt('Full name: ');
        token = await register(email, password, name);
        console.log('\n✅ Registration successful!');
      } else {
        console.log('\n❌ Authentication failed');
        process.exit(1);
      }
    }

    // Display token
    console.log('\n' + '=' .repeat(60));
    console.log('JWT TOKEN');
    console.log('=' .repeat(60));
    console.log(token);
    console.log('=' .repeat(60));
    console.log('\n💡 To use this token with the autonomous script:');
    console.log(`\n   export POLSIA_JWT_TOKEN="${token}"`);
    console.log('\n   node scripts/autonomous-repo-update.js');
    console.log('\n📋 Or save it to a .env file:');
    console.log(`\n   echo 'POLSIA_JWT_TOKEN="${token}"' >> .env`);
    console.log('');

  } catch (error) {
    console.error('\n❌ Error:', error.message);

    if (error.message.includes('ECONNREFUSED')) {
      console.error('\n💡 Cannot connect to Polsia API. Please check:');
      console.error('   1. The Polsia backend server is running');
      console.error(`   2. API URL is correct: ${API_URL}`);
      console.error('\nStart the server with: npm start');
    }

    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { login, register };
