#!/usr/bin/env node

/**
 * Test High-Priority Security Fixes
 * Tests fixes for SQL injection, open redirect, Instagram OAuth, and CORS
 */

const fs = require('fs');
const path = require('path');

console.log('🔒 Testing High-Priority Security Fixes\n');
console.log('=' .repeat(70));

let allPassed = true;

// Test 1: SQL Injection Fix
console.log('\n1. Testing SQL Injection Fix (document-store.js)...');
console.log('─'.repeat(70));

try {
    const documentStoreContent = fs.readFileSync('services/document-store.js', 'utf8');

    // Check that it no longer uses string interpolation for column names
    const hasDirectInterpolation = documentStoreContent.includes(`SET \${docType}`);

    // Check that it uses CASE statement approach
    const usesCaseStatement = documentStoreContent.includes('CASE WHEN $3 =');

    if (hasDirectInterpolation) {
        console.log('   ❌ FAIL: Still uses direct string interpolation for column name');
        allPassed = false;
    } else {
        console.log('   ✅ PASS: No direct string interpolation found');
    }

    if (usesCaseStatement) {
        console.log('   ✅ PASS: Uses parameterized CASE statement');
    } else {
        console.log('   ⚠️  WARNING: CASE statement not found');
        allPassed = false;
    }

    // Check that validation is still present
    const hasValidation = documentStoreContent.includes('validDocTypes');
    if (hasValidation) {
        console.log('   ✅ PASS: Input validation still present');
    } else {
        console.log('   ⚠️  WARNING: Input validation may be missing');
    }

} catch (error) {
    console.log('   ❌ FAIL: Error reading document-store.js:', error.message);
    allPassed = false;
}

// Test 2: Open Redirect Fix
console.log('\n2. Testing Open Redirect Fix (OAuth routes)...');
console.log('─'.repeat(70));

try {
    // Check that redirect validator utility exists
    if (!fs.existsSync('utils/redirect-validator.js')) {
        console.log('   ❌ FAIL: utils/redirect-validator.js not found');
        allPassed = false;
    } else {
        console.log('   ✅ PASS: Redirect validator utility exists');

        const validatorContent = fs.readFileSync('utils/redirect-validator.js', 'utf8');

        // Check for whitelist
        if (validatorContent.includes('ALLOWED_ORIGINS')) {
            console.log('   ✅ PASS: Origin whitelist defined');
        } else {
            console.log('   ❌ FAIL: Origin whitelist not found');
            allPassed = false;
        }

        // Check for validation function
        if (validatorContent.includes('getValidatedFrontendURL')) {
            console.log('   ✅ PASS: Validation function defined');
        } else {
            console.log('   ❌ FAIL: Validation function not found');
            allPassed = false;
        }

        // Check for process.exit on invalid URL
        if (validatorContent.includes('process.exit(1)')) {
            console.log('   ✅ PASS: Server exits on invalid frontend URL');
        } else {
            console.log('   ⚠️  WARNING: Server may not exit on invalid URL');
        }
    }

    // Check that all OAuth files use the validator
    const oauthFiles = [
        'routes/github-oauth.js',
        'routes/gmail-oauth.js',
        'routes/slack-oauth.js',
        'routes/sentry-oauth.js',
        'routes/meta-ads-oauth.js',
        'routes/instagram-oauth.js'
    ];

    console.log('\n   Checking OAuth route files:');
    for (const file of oauthFiles) {
        const content = fs.readFileSync(file, 'utf8');
        const usesValidator = content.includes('getValidatedFrontendURL');
        const hasDirectFallback = content.includes("|| 'http://localhost:5173'");

        if (usesValidator && !hasDirectFallback) {
            console.log(`   ✅ ${path.basename(file)}: Uses validator`);
        } else if (usesValidator && hasDirectFallback) {
            console.log(`   ⚠️  ${path.basename(file)}: Uses validator but has fallback`);
            allPassed = false;
        } else {
            console.log(`   ❌ ${path.basename(file)}: Missing validator`);
            allPassed = false;
        }
    }

} catch (error) {
    console.log('   ❌ FAIL: Error testing open redirect fix:', error.message);
    allPassed = false;
}

// Test 3: Instagram OAuth Session Fix
console.log('\n3. Testing Instagram OAuth Session Fix...');
console.log('─'.repeat(70));

try {
    const instagramContent = fs.readFileSync('routes/instagram-oauth.js', 'utf8');

    // Check for cryptographic state tokens
    const usesStateToken = instagramContent.includes('crypto.randomBytes(32)');
    if (usesStateToken) {
        console.log('   ✅ PASS: Uses cryptographic state tokens');
    } else {
        console.log('   ❌ FAIL: Not using cryptographic state tokens');
        allPassed = false;
    }

    // Check that stateStore is used instead of sessionStore
    const usesStateStore = instagramContent.includes('stateStore.set(state,');
    if (usesStateStore) {
        console.log('   ✅ PASS: Uses stateStore with state tokens');
    } else {
        console.log('   ❌ FAIL: Not using stateStore properly');
        allPassed = false;
    }

    // Check that state is validated in callback
    const validatesState = instagramContent.includes('!state || !stateStore.has(state)');
    if (validatesState) {
        console.log('   ✅ PASS: Validates state token in callback');
    } else {
        console.log('   ❌ FAIL: State validation missing');
        allPassed = false;
    }

    // Check that profileId is validated against session
    const validatesProfileId = instagramContent.includes('profileId !== session.lateProfileId');
    if (validatesProfileId) {
        console.log('   ✅ PASS: Validates profileId against session');
    } else {
        console.log('   ⚠️  WARNING: ProfileId validation may be weak');
    }

    // Check for state cleanup
    const cleansUpState = instagramContent.includes('stateStore.delete(state)');
    if (cleansUpState) {
        console.log('   ✅ PASS: Cleans up used state tokens');
    } else {
        console.log('   ⚠️  WARNING: State cleanup may be missing');
    }

} catch (error) {
    console.log('   ❌ FAIL: Error testing Instagram OAuth fix:', error.message);
    allPassed = false;
}

// Test 4: CORS Configuration
console.log('\n4. Testing CORS Configuration...');
console.log('─'.repeat(70));

try {
    const serverContent = fs.readFileSync('server.js', 'utf8');

    // Check that CORS is not using default (allow all origins)
    const hasDefaultCors = serverContent.match(/app\.use\(cors\(\)\)/);
    if (hasDefaultCors) {
        console.log('   ❌ FAIL: CORS still uses default (allow all origins)');
        allPassed = false;
    } else {
        console.log('   ✅ PASS: CORS no longer uses default configuration');
    }

    // Check that CORS uses validated frontend URL
    const usesCorsOrigin = serverContent.includes('cors({') &&
                           serverContent.includes('origin: FRONTEND_URL');
    if (usesCorsOrigin) {
        console.log('   ✅ PASS: CORS restricted to validated frontend URL');
    } else {
        console.log('   ❌ FAIL: CORS origin not properly configured');
        allPassed = false;
    }

    // Check for credentials support
    const supportsCredentials = serverContent.includes('credentials: true');
    if (supportsCredentials) {
        console.log('   ✅ PASS: CORS credentials enabled');
    } else {
        console.log('   ⚠️  WARNING: CORS credentials may not be enabled');
    }

    // Check that server imports redirect validator
    const importsValidator = serverContent.includes("require('./utils/redirect-validator')");
    if (importsValidator) {
        console.log('   ✅ PASS: Server imports redirect validator');
    } else {
        console.log('   ❌ FAIL: Server does not import redirect validator');
        allPassed = false;
    }

} catch (error) {
    console.log('   ❌ FAIL: Error testing CORS configuration:', error.message);
    allPassed = false;
}

// Summary
console.log('\n' + '='.repeat(70));
console.log('\n📊 Test Summary:\n');

if (allPassed) {
    console.log('   ✅ All high-priority security fixes are properly implemented!');
    console.log('\n   Fixed issues:');
    console.log('   1. SQL injection in document-store.js');
    console.log('   2. Open redirect vulnerabilities in OAuth callbacks');
    console.log('   3. Instagram OAuth session confusion');
    console.log('   4. CORS restricted to validated origins');
} else {
    console.log('   ⚠️  Some tests failed. Please review the output above.');
}

console.log('\n' + '='.repeat(70));
console.log('\n💡 Note: These are static code analysis tests.');
console.log('   For runtime testing, start the server and test OAuth flows.\n');

process.exit(allPassed ? 0 : 1);
