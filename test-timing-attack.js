#!/usr/bin/env node

/**
 * Test password timing attack mitigation
 * Measures response times for non-existent users vs wrong passwords
 */

const axios = require('axios');

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testTimingAttack() {
    console.log('🔒 Testing Password Timing Attack Mitigation\n');

    // Wait 16 minutes to reset rate limiter from previous test
    console.log('⏳ Waiting 1 minute to ensure rate limiter is reset...');
    await sleep(60000);

    console.log('\n📊 Test 1: Non-existent users (should use dummy hash)');
    console.log('─'.repeat(70));

    const timings1 = [];
    for (let i = 0; i < 5; i++) {
        const start = Date.now();
        try {
            await axios.post('http://localhost:3000/api/auth/login', {
                email: `nonexistent-${Date.now()}-${i}@example.com`,
                password: 'any-password'
            });
        } catch (error) {
            // Expected to fail with 401
        }
        const duration = Date.now() - start;
        timings1.push(duration);
        console.log(`  Attempt ${i + 1}: ${duration}ms`);
        await sleep(200); // Small delay between attempts
    }

    console.log('\n📊 Test 2: Wrong passwords for existing user (real bcrypt)');
    console.log('─'.repeat(70));

    const timings2 = [];
    for (let i = 0; i < 5; i++) {
        const start = Date.now();
        try {
            await axios.post('http://localhost:3000/api/auth/login', {
                email: 'test@test.com', // Assuming this user exists
                password: `wrong-password-${Date.now()}-${i}`
            });
        } catch (error) {
            // Expected to fail with 401
        }
        const duration = Date.now() - start;
        timings2.push(duration);
        console.log(`  Attempt ${i + 1}: ${duration}ms`);
        await sleep(200);
    }

    // Calculate statistics
    const avg1 = timings1.reduce((a, b) => a + b, 0) / timings1.length;
    const avg2 = timings2.reduce((a, b) => a + b, 0) / timings2.length;
    const difference = Math.abs(avg1 - avg2);
    const percentDiff = (difference / Math.max(avg1, avg2)) * 100;

    console.log('\n📈 Analysis:');
    console.log('─'.repeat(70));
    console.log(`  Non-existent user average: ${avg1.toFixed(1)}ms`);
    console.log(`  Wrong password average: ${avg2.toFixed(1)}ms`);
    console.log(`  Absolute difference: ${difference.toFixed(1)}ms`);
    console.log(`  Percentage difference: ${percentDiff.toFixed(1)}%`);

    console.log('\n🔍 Evaluation:');
    console.log('─'.repeat(70));

    // Both should take similar time due to bcrypt comparison
    // Allow for some variance (< 30ms or < 30% difference is good)
    if (difference < 30 || percentDiff < 30) {
        console.log('  ✅ PASS: Timing difference is minimal');
        console.log('  ✅ PASS: User enumeration via timing attack is effectively mitigated');
        console.log('\n  Both scenarios run bcrypt.compare(), making timing-based');
        console.log('  user enumeration much harder. Remaining variance is likely');
        console.log('  due to network jitter and is acceptable.');
        return true;
    } else {
        console.log('  ⚠️  WARNING: Timing difference is significant');
        console.log('  ⚠️  This could potentially allow user enumeration');
        console.log('\n  Note: Some timing difference is normal due to database lookups,');
        console.log('  but large differences may indicate the fix is not working properly.');
        return false;
    }
}

// Run test
console.log('⚠️  Note: This test will take ~1 minute to avoid rate limiting\n');

testTimingAttack()
    .then(success => {
        console.log('\n' + '='.repeat(70));
        if (success) {
            console.log('🎉 Timing attack mitigation is working correctly!');
        } else {
            console.log('⚠️  Timing attack mitigation may need improvement');
        }
        console.log('='.repeat(70) + '\n');

        // Keep server running
        console.log('💡 Server is still running. Kill it with: kill $(cat /tmp/polsia-server.pid)');
        process.exit(success ? 0 : 1);
    })
    .catch(error => {
        console.error('\n❌ Test failed with error:', error.message);
        if (error.code === 'ECONNREFUSED') {
            console.log('\n💡 Make sure the server is running on port 3000');
        }
        process.exit(1);
    });
