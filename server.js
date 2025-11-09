require('dotenv').config();
const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { getValidatedFrontendURL } = require('./utils/redirect-validator');
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

// Security: JWT_SECRET must be set in environment variables
// Remove fallback to prevent production deployments with default secrets
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('FATAL SECURITY ERROR: JWT_SECRET environment variable is not set.');
    console.error('Generate a strong secret with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
    process.exit(1);
}

// Middleware
// Security: Restrict CORS to validated frontend origin
const FRONTEND_URL = getValidatedFrontendURL();
app.use(cors({
    origin: FRONTEND_URL,
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Security: Rate limiting for authentication endpoints
// Prevents brute-force attacks and credential stuffing
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 login attempts per windowMs
    message: {
        success: false,
        message: 'Too many login attempts from this IP, please try again after 15 minutes'
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    // Skip successful logins from counting towards the limit
    skipSuccessfulRequests: false,
});

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

// JWT Authentication Middleware (accepts token from query parameter)
// Used for OAuth flows where we can't set Authorization headers due to browser redirects
function authenticateTokenFromQuery(req, res, next) {
    const token = req.query.token;

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

// Serve React app for all routes (including landing page)
app.get(['/', '/about', '/login', '/dashboard', '/modules', '/connections', '/brain', '/documents', '/analytics', '/tasks', '/agents'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'app', 'index.html'));
});

// Serve static files (HTML, CSS, JS)
// Serve app assets first (for login/dashboard)
app.use('/assets', express.static(path.join(__dirname, 'public', 'app', 'assets')));
app.use(express.static(path.join(__dirname, 'public')));

// API Routes (ready for future backend logic)
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Polsia server is running' });
});

// Authentication Routes
app.post('/api/auth/login', loginLimiter, async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    try {
        // Get user from database
        const user = await getUserByEmail(email.trim().toLowerCase());

        // Security: Always run bcrypt.compare() to prevent timing attacks
        // Use a dummy hash if user doesn't exist to ensure constant-time comparison
        // This prevents attackers from enumerating valid email addresses via timing analysis
        const dummyHash = '$2b$10$XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
        const passwordHash = user ? user.password_hash : dummyHash;
        const validPassword = await bcrypt.compare(password, passwordHash);

        if (!user || !validPassword) {
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
    const { email, variant } = req.body;

    if (!email || !email.trim()) {
        return res.status(400).json({ success: false, message: 'Email is required' });
    }

    try {
        const result = await addToWaitlist(email.trim().toLowerCase());
        console.log('Waitlist signup:', email, 'from variant:', variant || 'default');

        // Send Slack notification for new signups
        if (result.success && result.data) {
            await slackService.notifyWaitlistSignup(email.trim().toLowerCase(), variant);
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

// Agent API Routes
const agentRoutes = require('./routes/agent-routes');
const gmailRoutes = require('./routes/gmail-routes');
// Apply authentication middleware to GitHub-specific agent routes
app.use('/api/agent/github', authenticateToken);
// Apply authentication middleware to Gmail-specific agent routes
app.use('/api/agent/gmail', authenticateToken, gmailRoutes);
app.use('/api/agent', agentRoutes);

// GitHub OAuth Routes
// Pass middleware functions to the router so it can apply them conditionally
const githubOAuthRoutes = require('./routes/github-oauth')(authenticateTokenFromQuery, authenticateToken);
app.use('/api/auth/github', githubOAuthRoutes);

// Gmail OAuth Routes
// Pass middleware functions to the router so it can apply them conditionally
const gmailOAuthRoutes = require('./routes/gmail-oauth')(authenticateTokenFromQuery, authenticateToken);
app.use('/api/auth/gmail', gmailOAuthRoutes);

// Slack OAuth Routes
// Pass middleware functions to the router so it can apply them conditionally
const slackOAuthRoutes = require('./routes/slack-oauth')(authenticateTokenFromQuery, authenticateToken);
app.use('/api/auth/slack', slackOAuthRoutes);

// Instagram OAuth Routes (via Late.dev)
// Pass middleware functions to the router so it can apply them conditionally
const instagramOAuthRoutes = require('./routes/instagram-oauth')(authenticateTokenFromQuery, authenticateToken);
app.use('/api/auth/instagram', instagramOAuthRoutes);

// Meta Ads OAuth Routes
// Pass middleware functions to the router so it can apply them conditionally
const metaAdsOAuthRoutes = require('./routes/meta-ads-oauth')(authenticateTokenFromQuery, authenticateToken);
app.use('/api/auth/meta-ads', metaAdsOAuthRoutes);
// Also mount at /api/connections/meta-ads for account management (ad account selection)
app.use('/api/connections/meta-ads', metaAdsOAuthRoutes);

// Sentry OAuth Routes
// Pass middleware functions to the router so it can apply them conditionally
const sentryOAuthRoutes = require('./routes/sentry-oauth')(authenticateTokenFromQuery, authenticateToken);
app.use('/api/auth/sentry', sentryOAuthRoutes);

// Render API Key Routes (non-OAuth)
// Pass authentication middleware to the router
const renderRoutes = require('./routes/render-routes')(authenticateToken);
app.use('/api/connections/render', renderRoutes);

// App Store Connect Routes (JWT-based authentication, non-OAuth)
const appStoreConnectRoutes = require('./routes/appstore-connect-routes')(authenticateToken);
app.use('/api/connections/appstore-connect', appStoreConnectRoutes);

// MCP Routes - Host third-party MCP servers
const mcpRoutes = require('./routes/mcp-routes');
app.use('/mcp', authenticateToken, mcpRoutes);

// SSE route for streaming logs (needs query auth because EventSource doesn't support headers)
// IMPORTANT: This must be registered BEFORE the general module routes to avoid route conflicts
const { getModuleById, getExecutionLogs, getExecutionLogsSince, getModuleExecutions } = require('./db');
app.get('/api/modules/:id/executions/:executionId/logs/stream', authenticateTokenFromQuery, async (req, res) => {
    try {
        const moduleId = parseInt(req.params.id);
        const executionId = parseInt(req.params.executionId);

        if (isNaN(moduleId) || isNaN(executionId)) {
            return res.status(400).json({ success: false, message: 'Invalid module or execution ID' });
        }

        // Verify module exists and belongs to user
        const module = await getModuleById(moduleId, req.user.id);

        if (!module) {
            return res.status(404).json({ success: false, message: 'Module not found' });
        }

        // Set up SSE headers
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no', // Disable nginx buffering
        });

        console.log(`[SSE] Client connected for execution ${executionId}`);

        // Send initial comment to establish connection
        res.write(': connected\n\n');

        // 1. Send all existing logs
        const existingLogs = await getExecutionLogs(executionId);
        for (const log of existingLogs) {
            res.write(`data: ${JSON.stringify(log)}\n\n`);
        }

        // 2. Poll for new logs every second
        let lastLogId = existingLogs.length > 0
            ? existingLogs[existingLogs.length - 1].id
            : 0;

        const pollInterval = setInterval(async () => {
            try {
                const newLogs = await getExecutionLogsSince(executionId, lastLogId);

                for (const log of newLogs) {
                    res.write(`data: ${JSON.stringify(log)}\n\n`);
                    lastLogId = log.id;
                }

                // Check if execution is completed
                const executions = await getModuleExecutions(moduleId, req.user.id, 1);
                const currentExecution = executions.find(e => e.id === executionId);

                if (currentExecution && (currentExecution.status === 'completed' || currentExecution.status === 'failed')) {
                    // Send completion event
                    res.write(`data: ${JSON.stringify({ type: 'completion', status: currentExecution.status })}\n\n`);
                    clearInterval(pollInterval);
                    res.end();
                    console.log(`[SSE] Stream ended for execution ${executionId} (${currentExecution.status})`);
                }
            } catch (err) {
                console.error('[SSE] Error polling logs:', err);
                clearInterval(pollInterval);
                res.end();
            }
        }, 1000); // Poll every second

        // Clean up on client disconnect
        req.on('close', () => {
            console.log(`[SSE] Client disconnected from execution ${executionId}`);
            clearInterval(pollInterval);
            res.end();
        });

        // Auto-timeout after 30 minutes
        setTimeout(() => {
            console.log(`[SSE] Stream timeout for execution ${executionId}`);
            clearInterval(pollInterval);
            res.end();
        }, 30 * 60 * 1000);

    } catch (error) {
        console.error('Error setting up SSE stream:', error);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: 'Failed to stream logs' });
        }
    }
});

// Module Routes - Autonomous module management (registered after SSE route)
const moduleRoutes = require('./routes/module-routes');
app.use('/api/modules', authenticateToken, moduleRoutes);

// Task Management Routes - Agent-driven task workflow system
const taskRoutes = require('./routes/task-routes');
app.use('/api/tasks', authenticateToken, taskRoutes);

// Agents Routes - Task-driven AI agents system
const agentsRoutes = require('./routes/agents-routes');
app.use('/api/agents', authenticateToken, agentsRoutes);

// Routine Routes - Scheduled agent tasks with session persistence
const routineRoutes = require('./routes/routine-routes');
app.use('/api/routines', authenticateToken, routineRoutes);

// Social Media Routes - Late.dev integration for social media management
const socialRoutes = require('./routes/social-routes');
app.use('/api/social', authenticateToken, socialRoutes);

// AI Generation Routes - Fal.ai integration for AI content generation
const aiGenerationRoutes = require('./routes/ai-generation-routes');
app.use('/api/ai', authenticateToken, aiGenerationRoutes);

// Document Store Routes - Manage company documents (vision, goals, analytics, memory)
const documentRoutes = require('./routes/document-routes');
app.use('/api/documents', authenticateToken, documentRoutes);

// Reports Routes - Access and manage reports by category
const reportRoutes = require('./routes/reports-routes');
app.use('/api/reports', authenticateToken, reportRoutes);

// Tools Routes - MCP server catalog and system tools
const toolsRoutes = require('./routes/tools-routes');
app.use('/api/tools', authenticateToken, toolsRoutes);

// Brain Routes - Brain orchestrator status and control
const brainRoutes = require('./routes/brain-routes');
app.use('/api/brain', authenticateToken, brainRoutes);

// Connection Routes - Service connection management
const connectionRoutes = require('./routes/connection-routes');
app.use('/api/connections', authenticateToken, connectionRoutes);

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

        // Start module scheduler
        const { startScheduler } = require('./services/scheduler');
        startScheduler();
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
