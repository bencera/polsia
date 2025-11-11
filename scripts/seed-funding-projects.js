/**
 * Seed default funding projects for all existing users
 * Run with: node scripts/seed-funding-projects.js
 */

require('dotenv').config();
const db = require('../db');

const DEFAULT_PROJECTS = [
    {
        name: 'Social Media Posts',
        description: 'Create and schedule 10 promotional posts across Twitter, LinkedIn, and Reddit',
        goal_amount_usd: 50,
        display_order: 0
    },
    {
        name: 'Content Marketing Campaign',
        description: 'Produce blog articles and case studies showcasing Polsia success stories',
        goal_amount_usd: 200,
        display_order: 1
    },
    {
        name: 'Influencer Partnership',
        description: 'Sponsor tech YouTubers and podcasters to review and demo Polsia',
        goal_amount_usd: 500,
        display_order: 2
    },
    {
        name: 'Paid Ads Campaign',
        description: 'Launch targeted ads on Google, Twitter, and Reddit to reach 100K developers',
        goal_amount_usd: 2000,
        display_order: 3
    }
];

async function seedFundingProjects() {
    try {
        console.log('[Seed] Starting funding projects seed...');

        // Get all users
        const { pool } = require('../db');
        const usersResult = await pool.query('SELECT id, email FROM users');
        const users = usersResult.rows;

        console.log(`[Seed] Found ${users.length} users`);

        for (const user of users) {
            console.log(`[Seed] Seeding projects for user: ${user.email}`);

            // Check if user already has projects
            const existingProjects = await db.getFundingProjectsByUser(user.id);
            if (existingProjects.length > 0) {
                console.log(`[Seed]   ⏭️  User already has ${existingProjects.length} projects, skipping`);
                continue;
            }

            // Create default projects
            for (const project of DEFAULT_PROJECTS) {
                await db.createFundingProject(
                    user.id,
                    project.name,
                    project.description,
                    project.goal_amount_usd,
                    project.display_order
                );
                console.log(`[Seed]   ✓ Created project: ${project.name}`);
            }

            // Create user balance record
            await db.ensureUserBalance(user.id);
            console.log(`[Seed]   ✓ Initialized balance for user ${user.email}`);
        }

        console.log('[Seed] ✅ Funding projects seed completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('[Seed] ❌ Error seeding funding projects:', error);
        process.exit(1);
    }
}

// Run seed
seedFundingProjects();
