const express = require('express');
const router = express.Router();
const db = require('../db');

// Helper function to generate URL-safe slug from company name
function generateSlug(companyName) {
    if (!companyName) return '';
    return companyName
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
        .replace(/\s+/g, '-')          // Spaces to hyphens
        .replace(/-+/g, '-')           // Multiple hyphens to one
        .replace(/^-+|-+$/g, '')       // Trim hyphens from start/end
        .substring(0, 50);             // Max length
}

// Helper function to validate slug format
function isValidSlug(slug) {
    if (!slug || typeof slug !== 'string') return false;
    // Only lowercase letters, numbers, and hyphens, no special chars
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length >= 3 && slug.length <= 50;
}

// GET /api/user/settings - Get current user's company settings
router.get('/settings', async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await db.getUserById(userId);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            company_name: user.company_name || '',
            company_slug: user.company_slug || '',
            public_dashboard_enabled: user.public_dashboard_enabled || false,
        });
    } catch (err) {
        console.error('Error fetching user settings:', err);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

// PUT /api/user/settings - Update user's company settings
router.put('/settings', async (req, res) => {
    try {
        const userId = req.user.id;
        const { company_name, company_slug, public_dashboard_enabled } = req.body;

        const updates = {};

        // Handle company name
        if (company_name !== undefined) {
            updates.companyName = company_name;
        }

        // Handle slug
        if (company_slug !== undefined) {
            let slug = company_slug;

            // If slug is empty but company_name is provided, auto-generate
            if (!slug && company_name) {
                slug = generateSlug(company_name);
            }

            // Validate slug format
            if (slug) {
                if (!isValidSlug(slug)) {
                    return res.status(400).json({
                        error: 'Invalid slug format. Use only lowercase letters, numbers, and hyphens (3-50 characters).'
                    });
                }

                // Check if slug is available
                const isAvailable = await db.checkSlugAvailability(slug, userId);
                if (!isAvailable) {
                    return res.status(400).json({ error: 'This slug is already taken' });
                }
            }

            updates.companySlug = slug || null;
        }

        // Handle public dashboard toggle
        if (public_dashboard_enabled !== undefined) {
            updates.publicDashboardEnabled = public_dashboard_enabled;
        }

        // Update user settings
        const updatedUser = await db.updateUserCompanySettings(userId, updates);

        if (!updatedUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            company_name: updatedUser.company_name || '',
            company_slug: updatedUser.company_slug || '',
            public_dashboard_enabled: updatedUser.public_dashboard_enabled || false,
        });
    } catch (err) {
        console.error('Error updating user settings:', err);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// POST /api/user/settings/check-slug - Check if slug is available
router.post('/settings/check-slug', async (req, res) => {
    try {
        const userId = req.user.id;
        const { slug } = req.body;

        if (!slug) {
            return res.status(400).json({ error: 'Slug is required' });
        }

        if (!isValidSlug(slug)) {
            return res.json({ available: false, reason: 'Invalid format' });
        }

        const isAvailable = await db.checkSlugAvailability(slug, userId);
        res.json({ available: isAvailable });
    } catch (err) {
        console.error('Error checking slug availability:', err);
        res.status(500).json({ error: 'Failed to check slug' });
    }
});

// PUT /api/user/public-dashboard - Toggle public dashboard setting
router.put('/public-dashboard', async (req, res) => {
    try {
        const userId = req.user.id;
        const { public_dashboard_enabled } = req.body;

        if (typeof public_dashboard_enabled !== 'boolean') {
            return res.status(400).json({ error: 'public_dashboard_enabled must be a boolean' });
        }

        const updatedUser = await db.updateUserCompanySettings(userId, {
            publicDashboardEnabled: public_dashboard_enabled
        });

        if (!updatedUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            success: true,
            public_dashboard_enabled: updatedUser.public_dashboard_enabled
        });
    } catch (err) {
        console.error('Error updating public dashboard setting:', err);
        res.status(500).json({ error: 'Failed to update public dashboard setting' });
    }
});

module.exports = router;
