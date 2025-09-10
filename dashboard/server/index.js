const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs-extra');
const jwt = require('jsonwebtoken');

/**
 * Test Validation Dashboard Server
 * 
 * Provides REST API endpoints and web interface for visualizing test validation metrics,
 * pattern library statistics, and health scores across multiple projects.
 * 
 * Features:
 * - Authentication integration (GitHub/GitLab/SSO)
 * - Real-time WebSocket updates for live metrics
 * - Pattern library management and analysis
 * - Cross-project validation result aggregation
 * - Quality metrics calculation and trending
 */
class DashboardServer {
    constructor(options = {}) {
        this.port = options.port || process.env.PORT || 3001;
        this.authSecret = options.authSecret || process.env.JWT_SECRET || 'dev-secret-key';
        this.dataPath = options.dataPath || path.join(__dirname, '../../data');
        this.corsOrigins = options.corsOrigins || ['http://localhost:3000', 'http://localhost:3001'];
        
        this.app = express();
        this.server = null;
        this.io = null;
        
        this.initializeMiddleware();
        this.initializeRoutes();
        this.initializeErrorHandling();
    }

    /**
     * Initialize Express middleware
     */
    initializeMiddleware() {
        // Security middleware
        this.app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    imgSrc: ["'self'", "data:", "https:"],
                    connectSrc: ["'self'", "ws:", "wss:"],
                    fontSrc: ["'self'"],
                    objectSrc: ["'none'"],
                    mediaSrc: ["'self'"],
                    frameSrc: ["'none'"],
                }
            }
        }));

        // CORS configuration
        this.app.use(cors({
            origin: this.corsOrigins,
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
        }));

        // Request parsing
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

        // Logging
        this.app.use(morgan('combined'));

        // Authentication middleware
        this.app.use('/api', this.authenticateToken.bind(this));

        // Serve static files
        const clientBuild = path.join(__dirname, '../client/build');
        if (fs.existsSync(clientBuild)) {
            this.app.use(express.static(clientBuild));
        }
    }

    /**
     * JWT Authentication middleware
     */
    authenticateToken(req, res, next) {
        // Skip authentication for health check
        if (req.path === '/health') {
            return next();
        }

        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({ error: 'Access token required' });
        }

        jwt.verify(token, this.authSecret, (err, user) => {
            if (err) {
                return res.status(403).json({ error: 'Invalid or expired token' });
            }
            req.user = user;
            next();
        });
    }

    /**
     * Initialize API routes
     */
    initializeRoutes() {
        // Health check endpoint
        this.app.get('/api/health', (req, res) => {
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                version: process.env.npm_package_version || '1.0.0',
                uptime: process.uptime()
            });
        });

        // Authentication endpoints
        this.app.post('/api/auth/login', this.handleLogin.bind(this));
        this.app.post('/api/auth/refresh', this.handleRefresh.bind(this));
        this.app.post('/api/auth/logout', this.handleLogout.bind(this));

        // Import API route modules
        const validationRoutes = require('./api/validation');
        const patternsRoutes = require('./api/patterns');
        const metricsRoutes = require('./api/metrics');

        this.app.use('/api/validation', validationRoutes);
        this.app.use('/api/patterns', patternsRoutes);
        this.app.use('/api/metrics', metricsRoutes);

        // Serve React app for any non-API routes
        this.app.get('*', (req, res) => {
            const clientBuild = path.join(__dirname, '../client/build');
            const indexPath = path.join(clientBuild, 'index.html');
            
            if (fs.existsSync(indexPath)) {
                res.sendFile(indexPath);
            } else {
                res.status(404).json({
                    error: 'Dashboard client not built',
                    message: 'Run npm run build in dashboard/client to build the frontend'
                });
            }
        });
    }

    /**
     * Handle user authentication
     */
    async handleLogin(req, res) {
        try {
            const { username, password, provider } = req.body;

            // TODO: Integrate with actual authentication providers (GitHub, GitLab, SSO)
            // For now, implement basic validation
            if (!username || !password) {
                return res.status(400).json({ error: 'Username and password required' });
            }

            // Mock authentication - replace with real provider integration
            if (username === 'admin' && password === 'password') {
                const user = {
                    id: 1,
                    username: 'admin',
                    email: 'admin@example.com',
                    provider: provider || 'local'
                };

                const accessToken = jwt.sign(user, this.authSecret, { expiresIn: '15m' });
                const refreshToken = jwt.sign({ id: user.id }, this.authSecret, { expiresIn: '7d' });

                res.json({
                    user,
                    accessToken,
                    refreshToken,
                    expiresIn: 15 * 60 * 1000 // 15 minutes
                });
            } else {
                res.status(401).json({ error: 'Invalid credentials' });
            }
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * Handle token refresh
     */
    async handleRefresh(req, res) {
        try {
            const { refreshToken } = req.body;

            if (!refreshToken) {
                return res.status(401).json({ error: 'Refresh token required' });
            }

            jwt.verify(refreshToken, this.authSecret, (err, decoded) => {
                if (err) {
                    return res.status(403).json({ error: 'Invalid refresh token' });
                }

                // Generate new access token
                const user = { id: decoded.id, username: 'admin', email: 'admin@example.com' };
                const accessToken = jwt.sign(user, this.authSecret, { expiresIn: '15m' });

                res.json({
                    accessToken,
                    expiresIn: 15 * 60 * 1000
                });
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * Handle user logout
     */
    async handleLogout(req, res) {
        try {
            // TODO: Implement token blacklisting for enhanced security
            res.json({ message: 'Logged out successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * Initialize WebSocket for real-time updates
     */
    initializeWebSocket() {
        const { Server } = require('socket.io');
        this.io = new Server(this.server, {
            cors: {
                origin: this.corsOrigins,
                methods: ['GET', 'POST']
            }
        });

        this.io.use((socket, next) => {
            const token = socket.handshake.auth.token;
            if (!token) {
                return next(new Error('Authentication error'));
            }

            jwt.verify(token, this.authSecret, (err, user) => {
                if (err) {
                    return next(new Error('Authentication error'));
                }
                socket.user = user;
                next();
            });
        });

        this.io.on('connection', (socket) => {
            console.log(`User ${socket.user.username} connected to dashboard`);

            socket.on('subscribe-metrics', () => {
                socket.join('metrics-updates');
            });

            socket.on('subscribe-patterns', () => {
                socket.join('pattern-updates');
            });

            socket.on('disconnect', () => {
                console.log(`User ${socket.user.username} disconnected from dashboard`);
            });
        });
    }

    /**
     * Broadcast real-time updates to connected clients
     */
    broadcastUpdate(channel, data) {
        if (this.io) {
            this.io.to(channel).emit('update', data);
        }
    }

    /**
     * Initialize error handling
     */
    initializeErrorHandling() {
        // 404 handler
        this.app.use((req, res) => {
            res.status(404).json({ error: 'Route not found' });
        });

        // Global error handler
        this.app.use((err, req, res, next) => {
            console.error('Dashboard server error:', err);
            
            res.status(err.status || 500).json({
                error: err.message || 'Internal server error',
                ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
            });
        });

        // Handle graceful shutdown
        process.on('SIGTERM', () => {
            console.log('Received SIGTERM, shutting down dashboard server gracefully');
            this.stop();
        });

        process.on('SIGINT', () => {
            console.log('Received SIGINT, shutting down dashboard server gracefully');
            this.stop();
        });
    }

    /**
     * Start the dashboard server
     */
    async start() {
        try {
            // Ensure data directory exists
            await fs.ensureDir(this.dataPath);

            // Start HTTP server
            this.server = this.app.listen(this.port, () => {
                console.log(`Test Validation Dashboard server running on port ${this.port}`);
                console.log(`Access the dashboard at http://localhost:${this.port}`);
            });

            // Initialize WebSocket
            this.initializeWebSocket();

            return this.server;
        } catch (error) {
            console.error('Failed to start dashboard server:', error);
            throw error;
        }
    }

    /**
     * Stop the dashboard server
     */
    async stop() {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => {
                    console.log('Dashboard server stopped');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

// Export for use as module
module.exports = DashboardServer;

// Start server if run directly
if (require.main === module) {
    const server = new DashboardServer();
    server.start().catch(console.error);
}