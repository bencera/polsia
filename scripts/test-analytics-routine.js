#!/usr/bin/env node

/**
 * Test Analytics Routine
 *
 * Manually triggers the Render Analytics routine to test the updated workflow
 * that clones GitHub repo first before querying the production database.
 */

require('dotenv').config();
const { runRoutine } = require('../services/routine-executor');

async function testAnalyticsRoutine() {
    try {
        console.log('🧪 Testing Analytics Routine...\n');
        console.log('This will:');
        console.log('  1. Clone the GitHub repository (benbroca/blanks)');
        console.log('  2. Read database schema files');
        console.log('  3. Query production Render database');
        console.log('  4. Generate and save analytics report\n');

        const routineId = 4; // Render Analytics Summarizer
        const userId = 1;    // Your user ID

        console.log('🚀 Triggering routine execution...\n');
        console.log('⏳ Watch the server logs for real-time progress\n');

        const result = await runRoutine(routineId, userId, {
            trigger_type: 'manual'
        });

        console.log('\n✅ Routine execution completed!\n');
        console.log('📊 Results:');
        console.log(`   Success: ${result.success}`);
        console.log(`   Execution ID: ${result.execution_id}`);
        console.log(`   Duration: ${result.duration_ms}ms`);
        console.log(`   Cost: $${result.cost_usd || 0}`);

        if (result.output) {
            console.log('\n📝 Output:');
            console.log(result.output);
        }

        if (!result.success && result.error) {
            console.error('\n❌ Error:', result.error);
        }

        process.exit(result.success ? 0 : 1);

    } catch (error) {
        console.error('\n❌ Error testing routine:', error);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    testAnalyticsRoutine();
}

module.exports = { testAnalyticsRoutine };
