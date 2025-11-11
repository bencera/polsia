const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

/**
 * GET /api/funding-projects/user/:userId
 * Get all funding projects for a user (public endpoint)
 */
router.get('/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const projects = await db.getFundingProjectsByUser(userId);
        res.json({ projects });
    } catch (error) {
        console.error('[Funding Project Routes] Error fetching projects:', error);
        res.status(500).json({ error: 'Failed to fetch projects' });
    }
});

/**
 * GET /api/funding-projects
 * Get all funding projects for the authenticated user
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        const projects = await db.getFundingProjectsByUser(req.user.id);
        res.json({ projects });
    } catch (error) {
        console.error('[Funding Project Routes] Error fetching projects:', error);
        res.status(500).json({ error: 'Failed to fetch projects' });
    }
});

/**
 * POST /api/funding-projects
 * Create a new funding project
 * Body: { name, description, goal_amount_usd, display_order }
 */
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { name, description, goal_amount_usd, display_order } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Project name is required' });
        }

        const project = await db.createFundingProject(
            req.user.id,
            name,
            description,
            goal_amount_usd,
            display_order || 0
        );

        res.json({ project });
    } catch (error) {
        console.error('[Funding Project Routes] Error creating project:', error);
        res.status(500).json({ error: 'Failed to create project' });
    }
});

/**
 * PATCH /api/funding-projects/:id
 * Update a funding project
 * Body: { name, description, goal_amount_usd, status, display_order }
 */
router.patch('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const updates = {};

        // Only allow specific fields to be updated
        if (req.body.name !== undefined) updates.name = req.body.name;
        if (req.body.description !== undefined) updates.description = req.body.description;
        if (req.body.goal_amount_usd !== undefined) updates.goal_amount_usd = req.body.goal_amount_usd;
        if (req.body.status !== undefined) updates.status = req.body.status;
        if (req.body.display_order !== undefined) updates.display_order = req.body.display_order;

        const project = await db.updateFundingProject(id, updates);

        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        res.json({ project });
    } catch (error) {
        console.error('[Funding Project Routes] Error updating project:', error);
        res.status(500).json({ error: 'Failed to update project' });
    }
});

/**
 * DELETE /api/funding-projects/:id
 * Delete a funding project
 */
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        await db.deleteFundingProject(id);
        res.json({ success: true });
    } catch (error) {
        console.error('[Funding Project Routes] Error deleting project:', error);
        res.status(500).json({ error: 'Failed to delete project' });
    }
});

/**
 * GET /api/funding-projects/:id/modules
 * Get modules linked to a funding project
 */
router.get('/:id/modules', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const modules = await db.getModulesByFundingProject(id);
        res.json({ modules });
    } catch (error) {
        console.error('[Funding Project Routes] Error fetching modules:', error);
        res.status(500).json({ error: 'Failed to fetch modules' });
    }
});

module.exports = router;
