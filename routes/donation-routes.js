const express = require('express');
const router = express.Router();
const db = require('../db');
const stripeService = require('../services/stripe-service');
const { triggerDonationThanker } = require('../services/agent-runner');

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
 * POST /api/donations/create-checkout-session
 * Create a Stripe Checkout Session for donation
 * Body: { userId, projectId, amount, donorName, donorEmail, message, isAnonymous, projectName }
 */
router.post('/create-checkout-session', async (req, res) => {
    try {
        const { userId, projectId, amount, donorName, donorEmail, message, isAnonymous, projectName, isOwnAccount } = req.body;

        console.log('[Donation Routes] Checkout session request:', { userId, projectId, amount, donorEmail, donorName, isOwnAccount });

        // Validate inputs
        if (!userId || !amount || amount <= 0 || !donorEmail) {
            console.log('[Donation Routes] Validation failed:', { userId: !!userId, amount, hasEmail: !!donorEmail });
            return res.status(400).json({ error: 'Invalid donation parameters' });
        }

        // Get user's company name and slug
        const user = await db.getUserById(userId);
        const companyName = user?.company_name || 'Polsia';
        const companySlug = user?.company_slug;

        // Determine success and cancel URLs based on whether it's their own account
        const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const successUrl = isOwnAccount
            ? `${baseUrl}/dashboard?donation=success`
            : `${baseUrl}/${companySlug}?donation=success`;
        const cancelUrl = isOwnAccount
            ? `${baseUrl}/dashboard?donation=cancelled`
            : `${baseUrl}/${companySlug}?donation=cancelled`;

        // Create Stripe Checkout Session
        const session = await stripeService.createCheckoutSession(
            amount,
            userId,
            projectId,
            donorEmail,
            {
                donor_name: donorName || 'Anonymous',
                message: message || '',
                is_anonymous: isAnonymous || false,
                project_name: projectName || 'General Fund',
                company_name: companyName
            },
            successUrl,
            cancelUrl
        );

        // Create pending donation record with session ID
        const donation = await db.createDonation(
            userId,
            projectId,
            donorName || (isAnonymous ? 'Anonymous' : null),
            donorEmail,
            amount,
            session.id, // Store session ID as payment intent ID temporarily
            {
                message,
                is_anonymous: isAnonymous,
                checkout_session_id: session.id
            }
        );

        console.log('[Donation Routes] Created checkout session:', {
            sessionId: session.id,
            amount,
            donorEmail,
            checkoutUrl: session.url
        });

        res.json({
            sessionId: session.id,
            checkoutUrl: session.url,
            donationId: donation.id
        });
    } catch (error) {
        console.error('[Donation Routes] Error creating checkout session:', error);
        res.status(500).json({ error: 'Failed to create checkout session' });
    }
});

// Test endpoint to verify webhook route is accessible
router.get('/webhook', (req, res) => {
    res.json({ message: 'Webhook endpoint is accessible', method: 'GET' });
});

/**
 * POST /api/donations/webhook
 * Stripe webhook handler (no authentication required)
 * Handles payment_intent.succeeded events
 * Note: express.raw() middleware is applied in server.js before this route
 */
router.post('/webhook', async (req, res) => {
    console.log('[Donation Routes] 🔔 Webhook POST received!');
    try {
        const signature = req.headers['stripe-signature'];
        const event = await stripeService.constructWebhookEvent(req.body, signature);

        console.log(`[Donation Routes] Webhook received: ${event.type}`);

        // Handle different event types
        switch (event.type) {
            case 'payment_intent.succeeded':
                const paymentIntent = event.data.object;
                console.log(`[Donation Routes] Payment succeeded: ${paymentIntent.id}`);

                // Try to complete the donation - may already be completed by checkout.session.completed
                try {
                    const completedPayment = await db.completeDonation(paymentIntent.id);

                    // Trigger thank-you automation asynchronously (don't block webhook response)
                    if (completedPayment?.id) {
                        console.log(`[Donation Routes] 🎁 Triggering thank-you automation for donation ${completedPayment.id}`);
                        triggerDonationThanker(completedPayment.id).catch(err => {
                            console.error(`[Donation Routes] Failed to trigger donation thanker:`, err);
                        });
                    }
                } catch (err) {
                    console.log(`[Donation Routes] Payment intent ${paymentIntent.id} not found or already completed`);
                }
                break;

            case 'checkout.session.completed':
                const session = event.data.object;
                console.log(`[Donation Routes] Checkout session completed: ${session.id}`);

                // Complete the donation using session ID
                const completedDonation = await db.completeDonation(session.id);

                // Trigger thank-you automation asynchronously (don't block webhook response)
                if (completedDonation?.id) {
                    console.log(`[Donation Routes] 🎁 Triggering thank-you automation for donation ${completedDonation.id}`);
                    triggerDonationThanker(completedDonation.id).catch(err => {
                        console.error(`[Donation Routes] Failed to trigger donation thanker:`, err);
                    });
                }
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
