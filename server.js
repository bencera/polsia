require('dotenv').config();
const express = require('express');
const path = require('path');
const { initDatabase, addToWaitlist, getWaitlistCount } = require('./db');
const slackService = require('./slack');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));

// API Routes (ready for future backend logic)
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Polsia server is running' });
});

// API endpoint for waitlist
app.post('/api/waitlist', async (req, res) => {
    const { email } = req.body;

    if (!email || !email.trim()) {
        return res.status(400).json({ success: false, message: 'Email is required' });
    }

    try {
        const result = await addToWaitlist(email.trim().toLowerCase());
        console.log('Waitlist signup:', email);

        // Send Slack notification for new signups
        if (result.success && result.data) {
            await slackService.notifyWaitlistSignup(email.trim().toLowerCase());
        }

        res.json(result);
    } catch (error) {
        console.error('Error adding to waitlist:', error);
        res.status(500).json({ success: false, message: 'Failed to add to waitlist' });
    }
});

// API endpoint to get waitlist count
app.get('/api/waitlist/count', async (req, res) => {
    try {
        const count = await getWaitlistCount();
        res.json({ count });
    } catch (error) {
        console.error('Error getting waitlist count:', error);
        res.status(500).json({ success: false, message: 'Failed to get count' });
    }
});

// Serve index.html for all other routes (SPA support)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
async function startServer() {
    try {
        // Initialize database tables
        if (process.env.DATABASE_URL) {
            await initDatabase();
        } else {
            console.warn('⚠️  DATABASE_URL not set - database features disabled');
        }

        app.listen(PORT, () => {
            console.log(`🚀 Polsia server running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
