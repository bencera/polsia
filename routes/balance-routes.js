const express = require('express');
const db = require('../db');

module.exports = (authenticateToken) => {
  const router = express.Router();

/**
 * GET /api/balance
 * Get current user's balance (authenticated)
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        // Ensure user has a balance record
        await db.ensureUserBalance(req.user.id);

        const balance = await db.getUserBalance(req.user.id);
        res.json({ balance });
    } catch (error) {
        console.error('[Balance Routes] Error fetching balance:', error);
        res.status(500).json({ error: 'Failed to fetch balance' });
    }
});

/**
 * GET /api/balance/user/:userId
 * Get balance for a specific user (public endpoint for dashboards)
 */
router.get('/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        // Ensure user has a balance record
        await db.ensureUserBalance(userId);

        const balance = await db.getUserBalance(userId);
        res.json({ balance });
    } catch (error) {
        console.error('[Balance Routes] Error fetching balance:', error);
        res.status(500).json({ error: 'Failed to fetch balance' });
    }
});

/**
 * GET /api/balance/stats
 * Get balance statistics for the authenticated user
 */
router.get('/stats', authenticateToken, async (req, res) => {
    try {
        await db.ensureUserBalance(req.user.id);

        const balance = await db.getUserBalance(req.user.id);
        const topDonors = await db.getTopDonorsByUser(req.user.id, 5);

        res.json({
            balance,
            topDonors,
            donorCount: topDonors.length
        });
    } catch (error) {
        console.error('[Balance Routes] Error fetching balance stats:', error);
        res.status(500).json({ error: 'Failed to fetch balance stats' });
    }
});

  return router;
};
