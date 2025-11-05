#!/usr/bin/env node

const { runModule } = require('./services/agent-runner.js');
const { getModuleById } = require('./db.js');

async function testSessionTwice() {
    try {
        const moduleId = 8; // Render Analytics module
        const userId = 1;

        console.log('\n🧪 TEST 1: First run (should create new session)\n');
        console.log('='.repeat(60));

        const module1 = await getModuleById(moduleId, userId);
        console.log(`Session ID before run 1: ${module1.session_id || '(none)'}\n`);

        const result1 = await runModule(moduleId, userId);

        const module2 = await getModuleById(moduleId, userId);
        console.log(`\n✅ Run 1 completed: ${result1.success ? 'SUCCESS' : 'FAILED'}`);
        console.log(`Session ID after run 1: ${module2.session_id || '(none)'}\n`);

        if (!module2.session_id) {
            console.error('❌ FAIL: Session ID was not saved after first run');
            process.exit(1);
        }

        const firstSessionId = module2.session_id;

        console.log('\n🧪 TEST 2: Second run (should resume from session)\n');
        console.log('='.repeat(60));
        console.log(`Expected to resume from: ${firstSessionId}\n`);

        const result2 = await runModule(moduleId, userId);

        const module3 = await getModuleById(moduleId, userId);
        console.log(`\n✅ Run 2 completed: ${result2.success ? 'SUCCESS' : 'FAILED'}`);
        console.log(`Session ID after run 2: ${module3.session_id || '(none)'}\n`);

        if (module3.session_id !== firstSessionId) {
            console.error(`❌ FAIL: Session ID changed! Expected ${firstSessionId}, got ${module3.session_id}`);
            process.exit(1);
        }

        console.log('\n' + '='.repeat(60));
        console.log('✅ SUCCESS! Session resumption is working correctly!');
        console.log('   - First run created new session');
        console.log('   - Second run resumed from same session');
        console.log('   - Session ID remained consistent');
        console.log('='.repeat(60) + '\n');

        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
}

testSessionTwice();
