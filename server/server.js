import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { findAvailablePort, isPortAvailable } from './utils/portFinder.js';

import WhatsAppClient from './whatsapp.js';
import MessageScheduler from './scheduler.js';
import messagesRouter from './routes/messages.js';
import groupsRouter from './routes/groups.js';
import contactsRouter from './routes/contacts.js';
import autoReplyRouter from './routes/autoReply.js';
import menusRouter from './routes/menus.js';
import configRouter from './routes/config.js';
import usersRouter from './routes/users.js';
import authRouter from './routes/auth.js';
import SessionManager from './sessionManager.js';
import sessionsRouter from './routes/sessions.js';
import { userService, messageCountService, validationService, messageLogService, subscriptionContactLinksService, groupSelectionService } from './database.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const profileSlug = process.env.PROFILE_SLUG || null;
const sessionDir = process.env.SESSION_DIR || null;
const PORT_INFO_FILE = profileSlug
  ? path.join(process.cwd(), `.${profileSlug}-port-info.json`)
  : path.join(__dirname, '..', '.port-info.json');

const persistPortInfo = (info) => {
  try {
    fs.writeFileSync(PORT_INFO_FILE, JSON.stringify(info, null, 2), 'utf8');
  } catch (error) {
    console.error('Failed to persist port info:', error.message);
  }
};

// Initialize server with dynamic ports
(async () => {
  const app = express();
  const httpServer = createServer(app);

  // Backend and frontend base ports (can be overridden by env vars)
  const envBackendPort = process.env.BACKEND_PORT ? parseInt(process.env.BACKEND_PORT, 10) : null;
  const envFrontendPort = process.env.FRONTEND_PORT ? parseInt(process.env.FRONTEND_PORT, 10) : null;
  const defaultBackendPort = envBackendPort || 23456;
  const defaultFrontendPort = envFrontendPort || 12345;

  let backendPort = defaultBackendPort;
  let io;

  try {
    // Resolve backend port: if explicitly provided, ensure availability, otherwise find one
    if (envBackendPort) {
      const available = await isPortAvailable(envBackendPort);
      if (!available) {
        const error = new Error(`Configured BACKEND_PORT ${envBackendPort} is already in use`);
        error.code = 'CONFIGURED_PORT_IN_USE';
        error.port = envBackendPort;
        error.portType = 'backend';
        throw error;
      }
      backendPort = envBackendPort;
    } else {
      backendPort = await findAvailablePort(defaultBackendPort);
    }

    // Resolve frontend port (if env provided, respect it)
    const frontendPort = envFrontendPort || defaultFrontendPort;

    // Update CORS origins with dynamic ports
    const allowedOrigins = [
      `http://localhost:${frontendPort}`,
      `http://localhost:12345`,
      process.env.FRONTEND_URL
    ].filter(Boolean);

    io = new Server(httpServer, {
      cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        credentials: true
      }
    });

    persistPortInfo({ backendPort, frontendPort });

    console.log(`🔌 Backend will run on port ${backendPort}`);
    console.log(`🌐 Frontend expected on port ${frontendPort}`);

    // Setup middleware
    app.use(cors({
      origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        if (allowedOrigins.indexOf(origin) !== -1) {
          callback(null, true);
        } else {
          console.log('CORS blocked origin:', origin);
          callback(null, true); // Allow anyway for development
        }
      },
      credentials: true
    }));
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Middleware to extract user and session from request (must be after express.json())
    app.use((req, res, next) => {
      // Try to get user from Authorization header or body
      const userId = req.headers['x-user-id'] || (req.body && req.body.userId);
      if (userId) {
        req.userId = parseInt(userId);
      }

      const sessionId = req.headers['x-session-id'] || (req.body && req.body.sessionId);
      if (sessionId) {
        req.sessionId = sessionId;
      }
      next();
    });

    // Create uploads directory
    const uploadsDir = process.env.UPLOAD_DIR || './uploads';
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    app.use('/uploads', express.static(uploadsDir));

    // Initialize Session Manager
    const sessionManager = new SessionManager(io);
    await sessionManager.restoreSessions(); // Restores saved sessions from disk

    const whatsappClient = sessionManager; // Temporary fallback for code using whatsappClient directly
    const messageScheduler = new MessageScheduler(sessionManager);

    // Make services available to routes
    app.set('sessionManager', sessionManager);
    app.set('whatsappClient', sessionManager); // Keep for compatibility
    app.set('messageScheduler', messageScheduler);
    app.set('userService', userService);
    app.set('messageCountService', messageCountService);
    app.set('validationService', validationService);
    app.set('messageLogService', messageLogService);
    app.set('subscriptionContactLinksService', subscriptionContactLinksService);
    app.set('groupSelectionService', groupSelectionService);
    app.set('io', io);

    // Routes
    app.use('/api/sessions', sessionsRouter);
    app.use('/api/messages', messagesRouter);
    app.use('/api/groups', groupsRouter);
    app.use('/api/contacts', contactsRouter);
    app.use('/api/auto-reply', autoReplyRouter);
    app.use('/api/menus', menusRouter);
    app.use('/api/users', usersRouter);
    app.use('/api/auth', authRouter);
    app.use('/api', configRouter);

    // Health check
    app.get('/api/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date() });
    });

    // Status endpoint
    app.get('/api/status', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date() });
    });

    // Socket.io connection
    io.on('connection', (socket) => {
      console.log('Client connected:', socket.id);

      // Listen for session selection to join specific room
      socket.on('select_session', (sessionId) => {
        socket.join(`session_${sessionId}`);
        console.log(`Socket ${socket.id} joined session_${sessionId}`);

        // Optionally send immediate status for this session
        const status = sessionManager.getSessionStatus(sessionId);
        socket.emit('session_status', { sessionId, ...status });
      });

      // Listen for user login/logout events
      // These might be relevant if we track active user per socket
      socket.on('user_logged_in', async (data) => {
        if (data && data.userId) {
          // sessionManager.setUserActive(data.userId, socket.id); // If we tracked users
          console.log(`[Server] Socket ${socket.id} logged in as user: ${data.userId}`);
        }
      });

      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
      });
    });

    // Error handling middleware
    app.use((err, req, res, next) => {
      console.error('Error:', err);
      res.status(500).json({
        error: 'Internal server error',
        message: err.message
      });
    });

    // Start server
    httpServer.listen(backendPort, () => {
      console.log('=================================');
      console.log(`🚀 Server running on port ${backendPort}`);
      console.log(`🌐 Frontend URL: http://localhost:${frontendPort}`);
      console.log(`🔓 CORS Allowed Origins: ${allowedOrigins.join(', ')}`);
      console.log('👉 Waiting for manual initialization via frontend button...');
      console.log('=================================');
    });

    // Graceful shutdown handler
    const gracefulShutdown = async (signal) => {
      console.log(`\nReceived ${signal}, shutting down gracefully...`);
      try {
        await whatsappClient.destroy();
        console.log('WhatsApp client disconnected');
      } catch (error) {
        console.error('Error disconnecting WhatsApp client:', error);
      }

      httpServer.close(() => {
        console.log('Server closed');
        process.exit(0);
      });

      // Force exit after 10 seconds if server doesn't close
      setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    // Handle shutdown signals
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

    // Store in global for export (temporary workaround for async init)
    if (typeof global !== 'undefined') {
      global.serverIo = io;
      global.serverWhatsappClient = whatsappClient;
    }

  } catch (error) {
    console.error('Error initializing server:', error);

    if (error.code === 'CONFIGURED_PORT_IN_USE') {
      console.error(
        `❌ Cannot start profile${profileSlug ? ` "${profileSlug}"` : ''}: configured ${error.portType} port ${error.port} is already in use.`
      );
      process.exitCode = 98;
      return;
    }

    // Fallback to default port
    backendPort = defaultBackendPort;
    const frontendPort = defaultFrontendPort;
    io = new Server(httpServer, {
      cors: {
        origin: ['http://localhost:12345'],
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        credentials: true
      }
    });

    const whatsappClient = new WhatsAppClient(io);
    const messageScheduler = new MessageScheduler(whatsappClient);

    persistPortInfo({ backendPort, frontendPort });

    httpServer.listen(backendPort, () => {
      console.log('=================================');
      console.log(`🚀 Server running on port ${backendPort} (fallback)`);
      console.log('=================================');
    });

    if (typeof global !== 'undefined') {
      global.serverIo = io;
      global.serverWhatsappClient = whatsappClient;
    }
  }
})();

// Export for use in other modules (will be available after async init completes)
export const getIo = () => (typeof global !== 'undefined' ? global.serverIo : null);
export const getWhatsappClient = () => (typeof global !== 'undefined' ? global.serverWhatsappClient : null);
