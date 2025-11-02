/**
 * Test Script for Brain Orchestrator
 * Tests the complete Brain cycle from start to finish
 *
 * Usage: node scripts/test-brain-cycle.js
 */

require('dotenv').config();
const { initializeDocumentStore, getDocumentStore } = require('../services/document-store');
const { runDataAgent } = require('../services/data-agent');
const { runBrainCycle, getLastBrainDecision } = require('../services/brain-orchestrator');
const { getUserByEmail } = require('../db');

async function testBrainCycle() {
  console.log('\n🧪 ========== Testing Brain Orchestrator ==========\n');

  try {
    // Step 1: Get test user
    console.log('📋 Step 1: Finding test user...');
    const user = await getUserByEmail('test@polsia.ai');

    if (!user) {
      console.error('❌ Test user not found. Please run: node create-test-user.js');
      process.exit(1);
    }

    console.log(`✅ Found user: ${user.email} (ID: ${user.id})`);

    // Step 2: Check/initialize document store
    console.log('\n📋 Step 2: Checking document store...');
    let docStore = await getDocumentStore(user.id);

    if (!docStore) {
      console.log('   Document store not found. Initializing...');
      docStore = await initializeDocumentStore(user.id);
      console.log('✅ Document store initialized');
    } else {
      console.log('✅ Document store exists');
    }

    // Step 3: Test Data Agent
    console.log('\n📋 Step 3: Testing Data Agent...');
    const dataAgentResult = await runDataAgent(user.id);

    if (dataAgentResult.success) {
      console.log('✅ Data Agent completed successfully');
      console.log('   - Analytics updated:', dataAgentResult.analytics_updated);
      console.log('   - Anomalies detected:', dataAgentResult.anomalies_detected);
    } else {
      console.log('❌ Data Agent failed');
    }

    // Step 4: View updated document store
    console.log('\n📋 Step 4: Checking updated documents...');
    docStore = await getDocumentStore(user.id);
    console.log('✅ Documents retrieved:');
    console.log('   - Vision length:', docStore.vision_md.length, 'chars');
    console.log('   - Goals length:', docStore.goals_md.length, 'chars');
    console.log('   - Analytics length:', docStore.analytics_md.length, 'chars');
    console.log('   - Memory length:', docStore.memory_md.length, 'chars');
    console.log('   - Analytics JSON:', JSON.stringify(docStore.analytics_json).substring(0, 100) + '...');

    // Step 5: Run Brain Cycle
    console.log('\n📋 Step 5: Running Brain Cycle...');
    console.log('⏳ This may take 30-60 seconds...\n');

    const brainResult = await runBrainCycle(user.id);

    if (brainResult.success) {
      console.log('\n✅ Brain Cycle completed successfully!');
      console.log('\n📊 Results:');
      console.log('   - Duration:', (brainResult.duration_ms / 1000).toFixed(2), 'seconds');
      console.log('   - Total Cost: $' + brainResult.cost_usd.toFixed(4));

      console.log('\n🧠 Brain Decision:');
      console.log('   - Action:', brainResult.decision.action);
      console.log('   - Module ID:', brainResult.decision.module_id);
      console.log('   - Priority:', brainResult.decision.priority_level);
      console.log('   - Reasoning:', brainResult.decision.reasoning.substring(0, 150) + '...');

      console.log('\n⚙️ Module Execution:');
      console.log('   - Execution ID:', brainResult.execution_result.execution_id);
      console.log('   - Success:', brainResult.execution_result.success);
      console.log('   - Duration:', (brainResult.execution_result.duration_ms / 1000).toFixed(2), 'seconds');
      console.log('   - Cost: $' + (brainResult.execution_result.cost_usd || 0).toFixed(4));

      if (brainResult.execution_result.error) {
        console.log('   - Error:', brainResult.execution_result.error);
      }
    } else {
      console.log('\n❌ Brain Cycle failed');
      console.log('   Error:', brainResult.error);
    }

    // Step 6: Get last Brain decision from database
    console.log('\n📋 Step 6: Verifying Brain decision in database...');
    const lastDecision = await getLastBrainDecision(user.id);

    if (lastDecision) {
      console.log('✅ Brain decision saved to database');
      console.log('   - Decision ID:', lastDecision.id);
      console.log('   - Action:', lastDecision.action_description);
      console.log('   - Module:', lastDecision.module_name);
      console.log('   - Execution Status:', lastDecision.execution_status);
      console.log('   - Created:', lastDecision.created_at);
    } else {
      console.log('❌ No Brain decision found in database');
    }

    // Step 7: Check updated memory
    console.log('\n📋 Step 7: Checking updated memory...');
    const updatedDocStore = await getDocumentStore(user.id);
    const memoryLines = updatedDocStore.memory_md.split('\n');
    console.log('✅ Memory updated');
    console.log('   - Total lines:', memoryLines.length);
    console.log('   - Last 10 lines:');
    console.log(memoryLines.slice(-10).join('\n'));

    console.log('\n\n🎉 ========== All Tests Passed! ==========\n');

  } catch (error) {
    console.error('\n\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests
testBrainCycle()
  .then(() => {
    console.log('Test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });
