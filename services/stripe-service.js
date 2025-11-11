require('dotenv').config();
const Stripe = require('stripe');

// Select Stripe key based on environment
const isProduction = process.env.NODE_ENV === 'production';
const STRIPE_SECRET_KEY = isProduction
    ? process.env.STRIPE_SECRET_KEY_LIVE
    : (process.env.STRIPE_SECRET_KEY_TEST || process.env.STRIPE_SECRET_KEY_LIVE);

let stripe = null;

if (STRIPE_SECRET_KEY) {
    stripe = Stripe(STRIPE_SECRET_KEY);
    const mode = isProduction ? 'LIVE' : 'TEST';
    console.log(`[Stripe Service] ✓ Stripe initialized successfully in ${mode} mode`);
} else {
    console.warn('[Stripe Service] ⚠️  STRIPE_SECRET_KEY not configured - donation features will be disabled');
}

/**
 * Create a payment intent for a donation
 * @param {number} amount - Amount in USD
 * @param {number} userId - User ID receiving the donation
 * @param {number} projectId - Funding project ID (optional)
 * @param {string} donorEmail - Donor's email
 * @param {object} metadata - Additional metadata
 * @returns {Promise<object>} Payment intent object
 */
async function createPaymentIntent(amount, userId, projectId, donorEmail, metadata = {}) {
    if (!stripe) {
        throw new Error('Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.');
    }

    try {
        // Convert dollars to cents for Stripe
        const amountInCents = Math.round(amount * 100);

        const paymentIntent = await stripe.paymentIntents.create({
            amount: amountInCents,
            currency: 'usd',
            receipt_email: donorEmail,
            metadata: {
                user_id: userId.toString(),
                funding_project_id: projectId ? projectId.toString() : null,
                ...metadata
            },
            // Automatic payment methods - allows cards, wallets, etc.
            automatic_payment_methods: {
                enabled: true,
            },
        });

        return paymentIntent;
    } catch (error) {
        console.error('[Stripe Service] Error creating payment intent:', error);
        throw error;
    }
}

/**
 * Retrieve a payment intent by ID
 * @param {string} paymentIntentId - Payment intent ID
 * @returns {Promise<object>} Payment intent object
 */
async function retrievePaymentIntent(paymentIntentId) {
    if (!stripe) {
        throw new Error('Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.');
    }

    try {
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        return paymentIntent;
    } catch (error) {
        console.error('[Stripe Service] Error retrieving payment intent:', error);
        throw error;
    }
}

/**
 * Handle Stripe webhook events
 * @param {string} rawBody - Raw request body
 * @param {string} signature - Stripe signature header
 * @returns {Promise<object>} Stripe event object
 */
async function constructWebhookEvent(rawBody, signature) {
    try {
        const isProduction = process.env.NODE_ENV === 'production';
        const webhookSecret = isProduction
            ? process.env.STRIPE_WEBHOOK_SECRET_LIVE
            : (process.env.STRIPE_WEBHOOK_SECRET_TEST || process.env.STRIPE_WEBHOOK_SECRET_LIVE);

        console.log('[Stripe Service] Webhook verification:', {
            mode: isProduction ? 'PRODUCTION' : 'DEVELOPMENT',
            secretUsed: webhookSecret ? `${webhookSecret.substring(0, 15)}...` : 'NONE'
        });

        if (!webhookSecret) {
            console.warn('[Stripe Service] No webhook secret configured');
            // In development, you might want to skip signature verification
            if (process.env.NODE_ENV === 'development') {
                return JSON.parse(rawBody);
            }
            throw new Error('Webhook secret not configured');
        }

        const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
        return event;
    } catch (error) {
        console.error('[Stripe Service] Webhook signature verification failed:', error.message);
        throw error;
    }
}

/**
 * Refund a payment
 * @param {string} paymentIntentId - Payment intent ID to refund
 * @param {number} amount - Amount to refund in USD (optional, defaults to full refund)
 * @returns {Promise<object>} Refund object
 */
async function refundPayment(paymentIntentId, amount = null) {
    try {
        const refundData = {
            payment_intent: paymentIntentId,
        };

        if (amount) {
            refundData.amount = Math.round(amount * 100); // Convert to cents
        }

        const refund = await stripe.refunds.create(refundData);
        return refund;
    } catch (error) {
        console.error('[Stripe Service] Error creating refund:', error);
        throw error;
    }
}

/**
 * Get payment intent status
 * @param {string} paymentIntentId - Payment intent ID
 * @returns {Promise<string>} Status (succeeded, processing, requires_payment_method, etc.)
 */
async function getPaymentIntentStatus(paymentIntentId) {
    try {
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        return paymentIntent.status;
    } catch (error) {
        console.error('[Stripe Service] Error getting payment intent status:', error);
        throw error;
    }
}

/**
 * Create a Checkout Session for donation
 * @param {number} amount - Amount in USD
 * @param {number} userId - User ID receiving the donation
 * @param {number} projectId - Funding project ID (optional)
 * @param {string} donorEmail - Donor's email
 * @param {object} metadata - Additional metadata
 * @param {string} successUrl - URL to redirect to on success
 * @param {string} cancelUrl - URL to redirect to on cancel
 * @returns {Promise<object>} Checkout session object
 */
async function createCheckoutSession(amount, userId, projectId, donorEmail, metadata = {}, successUrl, cancelUrl) {
    if (!stripe) {
        throw new Error('Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable.');
    }

    try {
        // Convert dollars to cents for Stripe
        const amountInCents = Math.round(amount * 100);

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: metadata.company_name || 'Polsia',
                            description: 'Support AI autonomous operations',
                        },
                        unit_amount: amountInCents,
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: successUrl,
            cancel_url: cancelUrl,
            customer_email: donorEmail,
            metadata: {
                user_id: userId.toString(),
                funding_project_id: projectId ? projectId.toString() : null,
                ...metadata
            },
        });

        return session;
    } catch (error) {
        console.error('[Stripe Service] Error creating checkout session:', error);
        throw error;
    }
}

module.exports = {
    createPaymentIntent,
    retrievePaymentIntent,
    constructWebhookEvent,
    refundPayment,
    getPaymentIntentStatus,
    createCheckoutSession,
};
