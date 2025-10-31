#!/usr/bin/env node
const { pool } = require('../db');

async function checkGeneration() {
    try {
        const result = await pool.query(`
            SELECT
                id,
                status,
                prompt,
                model,
                output_url,
                r2_url,
                r2_key,
                cost_usd,
                duration_ms,
                error_message,
                created_at
            FROM ai_generations
            ORDER BY id DESC
            LIMIT 1
        `);

        if (result.rows.length === 0) {
            console.log('No generations found');
        } else {
            const gen = result.rows[0];
            console.log('\n🎨 Latest AI Generation:\n');
            console.log('ID:', gen.id);
            console.log('Status:', gen.status);
            console.log('Prompt:', gen.prompt);
            console.log('Model:', gen.model);
            console.log('\n📸 URLs:');
            console.log('Fal.ai URL:', gen.output_url);
            console.log('R2 URL:', gen.r2_url || 'Not backed up');
            if (gen.r2_key) {
                console.log('R2 Key:', gen.r2_key);
            }
            console.log('\n📊 Stats:');
            console.log('Cost:', `$${gen.cost_usd || 'N/A'}`);
            console.log('Duration:', `${gen.duration_ms}ms`);
            console.log('Created:', gen.created_at);

            if (gen.error_message) {
                console.log('\n❌ Error:', gen.error_message);
            }

            console.log('\n🎉 Your image is available at:');
            console.log(gen.r2_url || gen.output_url);
            console.log();
        }
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await pool.end();
    }
}

checkGeneration();
