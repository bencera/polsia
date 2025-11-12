const { getAgentsByUserId } = require('./db');

async function testAPI() {
    try {
        console.log('Testing getAgentsByUserId(1)...');
        const agents = await getAgentsByUserId(1);

        console.log(`\nFound ${agents.length} agents for user 1:`);
        agents.forEach(agent => {
            console.log(`  - ${agent.name} (${agent.agent_type}) [ID: ${agent.id}, user_id: ${agent.user_id}]`);
        });

        const donationThanker = agents.find(a => a.agent_type === 'donation_thanker');
        if (donationThanker) {
            console.log('\n✅ Donation Thanker is in the results!');
        } else {
            console.log('\n❌ Donation Thanker NOT in the results!');
        }

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

testAPI();
