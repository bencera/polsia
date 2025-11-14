const express = require('express');
const router = express.Router();
const db = require('../db');
const jwt = require('jsonwebtoken');

/**
 * GET /api/logs/recent
 * Get recent execution logs for authenticated user
 */
router.get('/recent', async (req, res) => {
    try {
        // Verify JWT token
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({ success: false, error: 'No token provided' });
        }

        let userId;
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            userId = decoded.userId;
        } catch (err) {
            return res.status(403).json({ success: false, error: 'Invalid token' });
        }

        const result = await db.pool.query(`
            SELECT el.id, el.timestamp, el.log_level, el.stage, el.message, el.metadata
            FROM execution_logs el
            INNER JOIN agent_executions ae ON el.execution_id = ae.id
            WHERE ae.user_id = $1
            ORDER BY el.timestamp DESC
            LIMIT 5
        `, [userId]);

        res.json({
            success: true,
            logs: result.rows.reverse() // Reverse to show oldest first
        });
    } catch (err) {
        console.error('Error fetching recent logs:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch recent logs'
        });
    }
});

/**
 * GET /api/logs/recent/:userId
 * Get recent execution logs for a specific user (public endpoint)
 */
router.get('/recent/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        // Check if user has public dashboard enabled
        const userResult = await db.pool.query(
            'SELECT public_dashboard_enabled FROM users WHERE id = $1',
            [userId]
        );

        if (!userResult.rows[0] || !userResult.rows[0].public_dashboard_enabled) {
            return res.status(404).json({
                success: false,
                error: 'Not found'
            });
        }

        const result = await db.pool.query(`
            SELECT el.id, el.timestamp, el.log_level, el.stage, el.message, el.metadata
            FROM execution_logs el
            INNER JOIN agent_executions ae ON el.execution_id = ae.id
            WHERE ae.user_id = $1
            ORDER BY el.timestamp DESC
            LIMIT 5
        `, [userId]);

        res.json({
            success: true,
            logs: result.rows.reverse() // Reverse to show oldest first
        });
    } catch (err) {
        console.error('Error fetching recent logs:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch recent logs'
        });
    }
});

module.exports = router;
