#!/usr/bin/env node

const { runModule } = require('./services/agent-runner.js');
const { getModuleById } = require('./db.js');

async function testRunModule() {
    try {
        const moduleId = 8; // Render Analytics module
        const userId = 1;

        console.log('🚀 Running Render Analytics module...\n');

        // Get module details
        const module = await getModuleById(moduleId, userId);
        if (!module) {
            console.error('❌ Module not found');
            process.exit(1);
        }

        console.log(`📋 Module: ${module.name}`);
        console.log(`   Type: ${module.type}`);
        console.log(`   Session ID before: ${module.session_id || '(none)'}\n`);

        // Run the module
        const result = await runModule(moduleId, userId);

        console.log('\n✅ Module execution completed!');
        console.log(`   Status: ${result.status}`);
        console.log(`   Execution ID: ${result.executionId}`);
        console.log(`   Session ID: ${result.sessionId || '(not captured)'}`);

        // Check if session was saved
        const updatedModule = await getModuleById(moduleId, userId);
        console.log(`\n📊 Module session_id after execution: ${updatedModule.session_id || '(none)'}`);

        if (updatedModule.session_id) {
            console.log('\n✅ SUCCESS! Session ID was saved to the module.');
            console.log('🔄 Next run will resume from this session for continuous learning.');
        } else {
            console.log('\n⚠️  Session ID was not saved. Check logs for issues.');
        }

        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
}

testRunModule();
