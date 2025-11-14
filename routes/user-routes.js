const express = require('express');
const router = express.Router();
const db = require('../db');

/**
 * GET /api/users/me
 * Get current user's profile
 */
router.get('/me', async (req, res) => {
    try {
        const user = await db.pool.query(
            'SELECT id, email, full_name, company_name, company_slug, twitter_handle, created_at FROM users WHERE id = $1',
            [req.user.id]
        );

        if (user.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ user: user.rows[0] });
    } catch (error) {
        console.error('[User Routes] Error fetching user:', error);
        res.status(500).json({ error: 'Failed to fetch user profile' });
    }
});

/**
 * PUT /api/users/profile
 * Update user's profile
 */
router.put('/profile', async (req, res) => {
    try {
        const { full_name, email, twitter_handle } = req.body;

        // Validate email
        if (!email || !email.includes('@')) {
            return res.status(400).json({ error: 'Valid email is required' });
        }

        // Check if email is already taken by another user
        const emailCheck = await db.pool.query(
            'SELECT id FROM users WHERE email = $1 AND id != $2',
            [email, req.user.id]
        );

        if (emailCheck.rows.length > 0) {
            return res.status(400).json({ error: 'Email is already in use' });
        }

        // Update user profile
        const result = await db.pool.query(
            `UPDATE users
             SET full_name = $1,
                 email = $2,
                 twitter_handle = $3,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $4
             RETURNING id, email, full_name, company_name, company_slug, twitter_handle`,
            [full_name, email, twitter_handle, req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            message: 'Profile updated successfully',
            user: result.rows[0]
        });
    } catch (error) {
        console.error('[User Routes] Error updating profile:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

module.exports = router;
