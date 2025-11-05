#!/usr/bin/env node

/**
 * Test rate limiting on login endpoint
 */

const axios = require('axios');

async function testRateLimiting() {
    console.log('🔒 Testing Rate Limiting on /api/auth/login\n');
    console.log('Making 7 rapid login attempts...\n');

    const results = [];

    for (let i = 0; i < 7; i++) {
        const start = Date.now();
        try {
            const response = await axios.post('http://localhost:3000/api/auth/login', {
                email: 'ratelimit-test@example.com',
                password: 'test-password-' + i
            });

            results.push({
                attempt: i + 1,
                status: response.status,
                time: Date.now() - start,
                rateLimited: false,
                message: response.data?.message
            });
        } catch (error) {
            const status = error.response?.status;
            const message = error.response?.data?.message;
            const rateLimited = status === 429;

            results.push({
                attempt: i + 1,
                status,
                time: Date.now() - start,
                rateLimited,
                message
            });
        }

        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Display results
    console.log('Results:');
    console.log('─'.repeat(70));

    results.forEach(r => {
        const icon = r.rateLimited ? '🛑' : '✉️';
        const statusColor = r.rateLimited ? '429 (Rate Limited)' : r.status;
        console.log(`${icon} Attempt ${r.attempt}: HTTP ${statusColor} (${r.time}ms)`);
        if (r.message) {
            console.log(`   Message: "${r.message}"`);
        }
    });

    console.log('─'.repeat(70));

    // Analyze results
    const rateLimitedCount = results.filter(r => r.rateLimited).length;
    const firstRateLimited = results.findIndex(r => r.rateLimited) + 1;

    console.log('\nAnalysis:');
    console.log(`  Total requests: ${results.length}`);
    console.log(`  Rate limited: ${rateLimitedCount}`);
    console.log(`  First rate limited at attempt: ${firstRateLimited || 'N/A'}`);

    if (rateLimitedCount > 0) {
        console.log('\n✅ PASS: Rate limiting is working!');
        console.log(`✅ Expected: Limit after 5 attempts (within 15 min window)`);
        console.log(`✅ Actual: Rate limited starting at attempt ${firstRateLimited}`);

        if (firstRateLimited === 6) {
            console.log('✅ PERFECT: Rate limit triggered exactly after 5 attempts');
        }

        return true;
    } else {
        console.log('\n❌ FAIL: No requests were rate limited');
        console.log('Expected at least 1 request to be blocked after 5 attempts');
        console.log('\nPossible issues:');
        console.log('  - Rate limiter not configured correctly');
        console.log('  - Middleware not applied to login route');
        console.log('  - Server needs restart to load new configuration');
        return false;
    }
}

// Run test
testRateLimiting()
    .then(success => {
        process.exit(success ? 0 : 1);
    })
    .catch(error => {
        console.error('\n❌ Test failed with error:', error.message);
        if (error.code === 'ECONNREFUSED') {
            console.log('\n💡 Make sure the server is running on port 3000');
            console.log('   Start with: npm start');
        }
        process.exit(1);
    });
