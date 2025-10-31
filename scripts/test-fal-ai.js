#!/usr/bin/env node
/**
 * Test script for fal.ai integration
 * Generates a random image using Nano Banana model and uploads to R2
 */

const { pool } = require('../db');
const aiGenerationService = require('../services/ai-generation-service');

async function testImageGeneration() {
    console.log('\n🎨 Testing fal.ai Image Generation + R2 Upload\n');
    console.log('='.repeat(60));

    try {
        // Check if fal.ai is configured
        if (!aiGenerationService.isFalConfigured()) {
            console.error('❌ FAL_API_KEY is not configured!');
            console.log('Please set FAL_API_KEY in your .env file');
            process.exit(1);
        }
        console.log('✅ Fal.ai is configured');

        // Get the first user from the database (or create a test user)
        const userResult = await pool.query('SELECT id, email FROM users LIMIT 1');

        let userId;
        if (userResult.rows.length === 0) {
            console.log('⚠️  No users found in database. Creating test user...');
            const createUserResult = await pool.query(
                'INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email',
                ['test@fal.ai', 'test123']
            );
            userId = createUserResult.rows[0].id;
            console.log(`✅ Created test user: ${createUserResult.rows[0].email} (ID: ${userId})`);
        } else {
            userId = userResult.rows[0].id;
            console.log(`✅ Using existing user: ${userResult.rows[0].email} (ID: ${userId})`);
        }

        // Generate random prompts
        const prompts = [
            'A futuristic cityscape at night with neon lights',
            'A serene mountain landscape with a crystal clear lake',
            'An abstract painting of swirling galaxies',
            'A cute robot chef cooking in a modern kitchen',
            'A magical forest with glowing mushrooms and fireflies'
        ];
        const randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];

        console.log('\n📝 Generation Details:');
        console.log(`   Prompt: "${randomPrompt}"`);
        console.log(`   Model: nano-banana (Google)`);
        console.log(`   User ID: ${userId}`);

        console.log('\n⏳ Starting image generation...');
        console.log('   (This may take 10-30 seconds)\n');

        const startTime = Date.now();

        // Generate image using nano-banana model (faster and cheaper)
        const result = await aiGenerationService.createImageGeneration(
            userId,
            randomPrompt,
            {
                model: 'nano-banana',
                num_images: 1
            }
        );

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log('\n' + '='.repeat(60));

        if (result.success) {
            console.log('✅ IMAGE GENERATION SUCCESSFUL!\n');
            console.log('📊 Results:');
            console.log(`   Generation ID: ${result.generation.id}`);
            console.log(`   Status: ${result.generation.status}`);
            console.log(`   Duration: ${duration}s`);
            console.log(`   Cost: $${result.generation.cost_usd ? parseFloat(result.generation.cost_usd).toFixed(4) : 'N/A'}`);

            console.log('\n🔗 URLs:');
            console.log(`   Fal.ai URL: ${result.fal_url}`);

            if (result.generation.r2_url) {
                console.log(`   R2 URL: ${result.generation.r2_url} ⭐`);
                console.log(`   R2 Key: ${result.generation.r2_key}`);
                console.log(`   R2 Bucket: ${result.generation.r2_bucket}`);
            } else {
                console.log('   R2 URL: Not backed up (R2 might be disabled)');
            }

            console.log('\n📦 Metadata:');
            if (result.generation.metadata) {
                console.log(`   Seed: ${result.generation.metadata.seed || 'N/A'}`);
                console.log(`   Dimensions: ${result.generation.metadata.width}x${result.generation.metadata.height}`);
            }

            console.log('\n🎉 Your image is ready!');
            if (result.generation.r2_url) {
                console.log(`\n📸 View your image at: ${result.generation.r2_url}`);
            } else {
                console.log(`\n📸 View your image at: ${result.fal_url}`);
            }

        } else {
            console.log('❌ IMAGE GENERATION FAILED!\n');
            console.log(`Error: ${result.error}`);
            if (result.generation_id) {
                console.log(`Generation ID: ${result.generation_id}`);
            }
        }

        console.log('\n' + '='.repeat(60) + '\n');

    } catch (error) {
        console.error('\n❌ Test failed with error:');
        console.error(error.message);
        console.error('\nStack trace:');
        console.error(error.stack);
        process.exit(1);
    } finally {
        // Close database connection
        await pool.end();
    }
}

// Run the test
testImageGeneration();
