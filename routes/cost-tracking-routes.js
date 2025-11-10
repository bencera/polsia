/**
 * Cost Tracking Routes
 * API endpoints for viewing execution cost analytics
 */

const express = require('express');
const router = express.Router();
const {
    getExecutionCostsSummary,
    getCostsByModule,
    getDetailedExecutionHistory,
} = require('../db');

// Note: All routes require authenticateToken middleware (applied in server.js)
// req.user is available in all routes

/**
 * GET /api/cost-tracking/summary
 * Get cost summary with time period breakdowns
 */
router.get('/summary', async (req, res) => {
    try {
        const summary = await getExecutionCostsSummary(req.user.id);
        res.json({ success: true, data: summary });
    } catch (error) {
        console.error('Error getting cost summary:', error);
        res.status(500).json({ success: false, message: 'Failed to get cost summary' });
    }
});

/**
 * GET /api/cost-tracking/by-module
 * Get costs grouped by module
 * Query params:
 *   - limit: number of modules to return (default: 10)
 */
router.get('/by-module', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const modulesCosts = await getCostsByModule(req.user.id, limit);
        res.json({ success: true, data: modulesCosts });
    } catch (error) {
        console.error('Error getting costs by module:', error);
        res.status(500).json({ success: false, message: 'Failed to get costs by module' });
    }
});

/**
 * GET /api/cost-tracking/history
 * Get detailed execution history with all metrics
 * Query params:
 *   - limit: number of executions to return (default: 100)
 */
router.get('/history', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const history = await getDetailedExecutionHistory(req.user.id, limit);
        res.json({ success: true, data: history });
    } catch (error) {
        console.error('Error getting execution history:', error);
        res.status(500).json({ success: false, message: 'Failed to get execution history' });
    }
});

module.exports = router;
