const express = require('express');
const path = require('path');

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

// API endpoint for waitlist (placeholder for future implementation)
app.post('/api/waitlist', (req, res) => {
    const { email } = req.body;
    // TODO: Add database logic here later
    console.log('Waitlist signup:', email);
    res.json({ success: true, message: 'Added to waitlist' });
});

// Serve index.html for all other routes (SPA support)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Polsia server running on http://localhost:${PORT}`);
});
