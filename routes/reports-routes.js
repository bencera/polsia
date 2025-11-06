/**
 * Reports Routes
 * API endpoints for accessing and managing reports
 */

const express = require('express');
const router = express.Router();
const {
    getReportsByUserId,
    getReportById,
} = require('../db');

// Note: All routes require authenticateToken middleware (applied in server.js)
// req.user is available in all routes

/**
 * GET /api/reports
 * List all reports for the authenticated user with optional filters
 * Query params:
 *   - report_type: Filter by specific type
 *   - start_date: Filter reports from this date onwards
 *   - end_date: Filter reports up to this date
 *   - limit: Number of reports to return (default: 50)
 *   - offset: Number of reports to skip for pagination
 */
router.get('/', async (req, res) => {
    try {
        const { report_type, start_date, end_date, limit = 50, offset = 0 } = req.query;

        const filters = {};
        if (report_type) filters.report_type = report_type;
        if (start_date) filters.start_date = start_date;
        if (end_date) filters.end_date = end_date;

        const reports = await getReportsByUserId(
            req.user.id,
            filters,
            parseInt(limit),
            parseInt(offset)
        );

        res.json({
            success: true,
            reports,
            count: reports.length,
            offset: parseInt(offset),
            limit: parseInt(limit)
        });
    } catch (error) {
        console.error('Error getting reports:', error);
        res.status(500).json({ success: false, message: 'Failed to get reports' });
    }
});

/**
 * GET /api/reports/types
 * Get unique report types for the authenticated user with counts
 */
router.get('/types', async (req, res) => {
    try {
        const { pool } = require('../db');
        const client = await pool.connect();

        try {
            const result = await client.query(
                `SELECT report_type, COUNT(*) as count
                 FROM reports
                 WHERE user_id = $1
                 GROUP BY report_type
                 ORDER BY count DESC, report_type ASC`,
                [req.user.id]
            );

            res.json({
                success: true,
                types: result.rows
            });
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error getting report types:', error);
        res.status(500).json({ success: false, message: 'Failed to get report types' });
    }
});

/**
 * GET /api/reports/type/:type
 * Get reports by specific type with pagination
 * Query params:
 *   - limit: Number of reports to return (default: 5)
 *   - offset: Number of reports to skip for pagination
 */
router.get('/type/:type', async (req, res) => {
    try {
        const { type } = req.params;
        const { limit = 5, offset = 0 } = req.query;

        const reports = await getReportsByUserId(
            req.user.id,
            { report_type: type },
            parseInt(limit),
            parseInt(offset)
        );

        res.json({
            success: true,
            reports,
            report_type: type,
            count: reports.length,
            offset: parseInt(offset),
            limit: parseInt(limit)
        });
    } catch (error) {
        console.error('Error getting reports by type:', error);
        res.status(500).json({ success: false, message: 'Failed to get reports by type' });
    }
});

/**
 * GET /api/reports/:id
 * Get a specific report by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const report = await getReportById(parseInt(req.params.id), req.user.id);

        if (!report) {
            return res.status(404).json({
                success: false,
                message: 'Report not found',
            });
        }

        res.json({ success: true, report });
    } catch (error) {
        console.error('Error getting report:', error);
        res.status(500).json({ success: false, message: 'Failed to get report' });
    }
});

module.exports = router;
