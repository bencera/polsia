const express = require('express');
const router = express.Router();
const db = require('../db');
const stripeService = require('../services/stripe-service');

/**
 * POST /api/donations/create-payment-intent
 * Create a Stripe payment intent for a donation
 * Body: { userId, projectId, amount, donorName, donorEmail, message, isAnonymous }
 */
router.post('/create-payment-intent', async (req, res) => {
    try {
        const { userId, projectId, amount, donorName, donorEmail, message, isAnonymous } = req.body;

        // Validate inputs
        if (!userId || !amount || amount <= 0) {
            return res.status(400).json({ error: 'Invalid donation parameters' });
        }

        // Create Stripe payment intent
        const paymentIntent = await stripeService.createPaymentIntent(
            amount,
            userId,
            projectId,
            donorEmail,
            {
                donor_name: donorName || 'Anonymous',
                message: message || '',
                is_anonymous: isAnonymous || false
            }
        );

        // Create pending donation record in database
        const donation = await db.createDonation(
            userId,
            projectId,
            donorName || (isAnonymous ? 'Anonymous' : null),
            donorEmail,
            amount,
            paymentIntent.id,
            {
                message,
                is_anonymous: isAnonymous
            }
        );

        res.json({
            clientSecret: paymentIntent.client_secret,
            donationId: donation.id
        });
    } catch (error) {
        console.error('[Donation Routes] Error creating payment intent:', error);
        res.status(500).json({ error: 'Failed to create payment intent' });
    }
});

/**
 * POST /api/donations/webhook
 * Stripe webhook handler (no authentication required)
 * Handles payment_intent.succeeded events
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        const signature = req.headers['stripe-signature'];
        const event = await stripeService.constructWebhookEvent(req.body, signature);

        console.log(`[Donation Routes] Webhook received: ${event.type}`);

        // Handle different event types
        switch (event.type) {
            case 'payment_intent.succeeded':
                const paymentIntent = event.data.object;
                console.log(`[Donation Routes] Payment succeeded: ${paymentIntent.id}`);

                // Complete the donation in database
                await db.completeDonation(paymentIntent.id);
                break;

            case 'payment_intent.payment_failed':
                const failedIntent = event.data.object;
                console.log(`[Donation Routes] Payment failed: ${failedIntent.id}`);
                // Optionally update donation status to 'failed'
                break;

            default:
                console.log(`[Donation Routes] Unhandled event type: ${event.type}`);
        }

        res.json({ received: true });
    } catch (error) {
        console.error('[Donation Routes] Webhook error:', error);
        res.status(400).json({ error: 'Webhook handler failed' });
    }
});

/**
 * GET /api/donations/user/:userId
 * Get donations for a user (public endpoint)
 */
router.get('/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const limit = parseInt(req.query.limit) || 50;

        const donations = await db.getDonationsByUser(userId, limit);
        res.json({ donations });
    } catch (error) {
        console.error('[Donation Routes] Error fetching donations:', error);
        res.status(500).json({ error: 'Failed to fetch donations' });
    }
});

/**
 * GET /api/donations/user/:userId/top-donors
 * Get top donors for a user (public endpoint)
 */
router.get('/user/:userId/top-donors', async (req, res) => {
    try {
        const { userId } = req.params;
        const limit = parseInt(req.query.limit) || 10;

        const topDonors = await db.getTopDonorsByUser(userId, limit);
        res.json({ topDonors });
    } catch (error) {
        console.error('[Donation Routes] Error fetching top donors:', error);
        res.status(500).json({ error: 'Failed to fetch top donors' });
    }
});

/**
 * GET /api/donations/payment-intent/:paymentIntentId/status
 * Check payment intent status
 */
router.get('/payment-intent/:paymentIntentId/status', async (req, res) => {
    try {
        const { paymentIntentId } = req.params;
        const status = await stripeService.getPaymentIntentStatus(paymentIntentId);
        res.json({ status });
    } catch (error) {
        console.error('[Donation Routes] Error fetching payment status:', error);
        res.status(500).json({ error: 'Failed to fetch payment status' });
    }
});

module.exports = router;
