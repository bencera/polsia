require('dotenv').config();
const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const {
    addToWaitlist,
    getWaitlistCount,
    getUserByEmail,
    getUserById,
    getTasksByUserId,
    getServiceConnectionsByUserId,
    updateServiceConnectionStatus
} = require('./db');
const slackService = require('./slack');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// JWT Authentication Middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ success: false, message: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, async (err, decoded) => {
        if (err) {
            return res.status(403).json({ success: false, message: 'Invalid or expired token' });
        }

        // Get user from database
        try {
            const user = await getUserById(decoded.userId);
            if (!user) {
                return res.status(403).json({ success: false, message: 'User not found' });
            }
            req.user = user;
            next();
        } catch (error) {
            console.error('Error verifying user:', error);
            return res.status(500).json({ success: false, message: 'Authentication error' });
        }
    });
}

// Serve static files (HTML, CSS, JS)
// Serve app assets first (for login/dashboard)
app.use('/assets', express.static(path.join(__dirname, 'public', 'app', 'assets')));
app.use(express.static(path.join(__dirname, 'public')));

// API Routes (ready for future backend logic)
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Polsia server is running' });
});

// Authentication Routes
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    try {
        // Get user from database
        const user = await getUserByEmail(email.trim().toLowerCase());

        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        // Verify password
        const validPassword = await bcrypt.compare(password, user.password_hash);

        if (!validPassword) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        // Generate JWT token
        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name
            }
        });
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ success: false, message: 'Login failed' });
    }
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
    res.json({
        success: true,
        user: {
            id: req.user.id,
            email: req.user.email,
            name: req.user.name,
            created_at: req.user.created_at
        }
    });
});

app.post('/api/auth/logout', (req, res) => {
    // For JWT, logout is handled client-side by removing the token
    res.json({ success: true, message: 'Logged out successfully' });
});

// Protected API Routes
app.get('/api/tasks', authenticateToken, async (req, res) => {
    try {
        const tasks = await getTasksByUserId(req.user.id);
        res.json({ success: true, tasks });
    } catch (error) {
        console.error('Error getting tasks:', error);
        res.status(500).json({ success: false, message: 'Failed to get tasks' });
    }
});

app.get('/api/connections', authenticateToken, async (req, res) => {
    try {
        const connections = await getServiceConnectionsByUserId(req.user.id);
        res.json({ success: true, connections });
    } catch (error) {
        console.error('Error getting connections:', error);
        res.status(500).json({ success: false, message: 'Failed to get connections' });
    }
});

app.put('/api/connections/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['connected', 'disconnected'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Valid status is required (connected/disconnected)' });
    }

    try {
        const connection = await updateServiceConnectionStatus(id, req.user.id, status);

        if (!connection) {
            return res.status(404).json({ success: false, message: 'Connection not found' });
        }

        res.json({ success: true, connection });
    } catch (error) {
        console.error('Error updating connection:', error);
        res.status(500).json({ success: false, message: 'Failed to update connection' });
    }
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

// Serve React app for authenticated routes
app.get(['/login', '/dashboard', '/settings'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'app', 'index.html'));
});

// Serve landing page for root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 for any other routes
app.get('*', (req, res) => {
    res.status(404).json({ success: false, message: 'Not found' });
});

// Start server
async function startServer() {
    try {
        // Database migrations are managed via node-pg-migrate
        // Run migrations before starting: npm run migrate
        if (!process.env.DATABASE_URL) {
            console.warn('⚠️  DATABASE_URL not set - database features disabled');
        } else {
            console.log('✅ Database configured');
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
