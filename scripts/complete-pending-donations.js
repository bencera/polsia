require('dotenv').config();
const db = require('../db');
const Stripe = require('stripe');

// Select Stripe key based on environment
const isProduction = process.env.NODE_ENV === 'production';
const STRIPE_SECRET_KEY = isProduction
    ? process.env.STRIPE_SECRET_KEY_LIVE
    : (process.env.STRIPE_SECRET_KEY_TEST || process.env.STRIPE_SECRET_KEY_LIVE);

const stripe = Stripe(STRIPE_SECRET_KEY);

async function completePendingDonations() {
    try {
        console.log('🔍 Checking for pending donations...');

        // Get all pending donations
        const result = await db.pool.query(
            `SELECT id, user_id, amount_usd, stripe_payment_intent_id, metadata
             FROM donations
             WHERE status = 'pending'
             ORDER BY created_at DESC`
        );

        const pendingDonations = result.rows;
        console.log(`Found ${pendingDonations.length} pending donations`);

        for (const donation of pendingDonations) {
            const sessionId = donation.stripe_payment_intent_id;
            console.log(`\n📋 Checking donation ${donation.id} (Session: ${sessionId})`);

            try {
                // Check the session status in Stripe
                const session = await stripe.checkout.sessions.retrieve(sessionId);

                console.log(`   Status: ${session.payment_status}`);

                if (session.payment_status === 'paid') {
                    console.log(`   ✅ Payment completed! Updating database...`);

                    // Complete the donation
                    await db.completeDonation(sessionId);

                    console.log(`   ✅ Donation ${donation.id} completed successfully`);
                    console.log(`   💰 Added $${donation.amount_usd} to user ${donation.user_id}'s balance`);
                } else {
                    console.log(`   ⏳ Payment not completed yet`);
                }
            } catch (err) {
                console.error(`   ❌ Error checking donation ${donation.id}:`, err.message);
            }
        }

        console.log('\n✅ Done checking pending donations');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

completePendingDonations();
