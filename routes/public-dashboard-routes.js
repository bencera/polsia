const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/public/dashboard/:slug - Get public dashboard data
router.get('/dashboard/:slug', async (req, res) => {
    try {
        const { slug } = req.params;

        // Get user by company slug
        const user = await db.getUserByCompanySlug(slug);

        if (!user) {
            return res.status(404).json({ error: 'Dashboard not found' });
        }

        if (!user.public_dashboard_enabled) {
            return res.status(404).json({ error: 'Dashboard not found' });
        }

        // Get public dashboard data
        const dashboardData = await db.getPublicDashboardData(user.id);

        if (!dashboardData) {
            return res.status(404).json({ error: 'Dashboard not found' });
        }

        res.json(dashboardData);
    } catch (err) {
        console.error('Error fetching public dashboard:', err);
        res.status(500).json({ error: 'Failed to fetch dashboard' });
    }
});

module.exports = router;
