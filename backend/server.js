// -------------------------------------------------------
// Nexus POS Backend Server
// This file sets up the Express server, middleware, sockets,
// and connects to the PostgreSQL database.
// Security notes:
// - Environment variables are loaded from .env and never logged.
// - No API keys or secrets are exposed in code or responses.
// -------------------------------------------------------
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 5000;
const { initWorker } = require('./workers/statsWorker');
const { initJobs } = require('./jobs/index');
const { client, pubClient, subClient, initRedis, isRedisEnabled } = require('./config/redis');
const { createAdapter } = require('@socket.io/redis-adapter');
const RedisStore = require('rate-limit-redis').default;
const { initAdminSocket, emitAdminAlert } = require('./socketAdmin');

/**
 * NEXUS POS MASTER SERVER
 * Multi-tenant backend for grocery operations, stats, and real-time syncing.
 */

// Global Route Inspector (Debug Only)
app.get('/api/debug-routes', (req, res) => {
  const routes = [];
  function print(path, layer) {
    if (layer.route) {
      layer.route.stack.forEach(print.bind(null, path + layer.route.path));
    } else if (layer.name === 'router' && layer.handle.stack) {
      layer.handle.stack.forEach(print.bind(null, path + (layer.regexp.source.replace('^\\/', '').replace('\\/?(?=\\/|$)', '').replace('\\/', '/'))));
    } else if (layer.method) {
      routes.push(`${layer.method.toUpperCase()} ${path}`);
    }
  }
  app._router.stack.forEach(print.bind(null, ''));
  res.json(routes);
});

// Utility: normalize origin
function normalizeOrigin(value) {
  if (!value) return value;
  try {
    const u = new URL(value);
    return `${u.protocol}//${u.host}`.toLowerCase();
  } catch {
    return value.replace(/\/$/, '').toLowerCase();
  }
}

function getAllowedOrigins() {
  const isDevelopment = process.env.NODE_ENV === 'development';
  if (isDevelopment) {
    return ['http://localhost:5000', 'http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:3000'].map(normalizeOrigin);
  }
  const all = (process.env.FRONTEND_URLS ? process.env.FRONTEND_URLS.split(',') : [process.env.FRONTEND_URL]).filter(Boolean).map(normalizeOrigin);
  return all;
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  const allowed = getAllowedOrigins();
  return allowed.length === 0 || allowed.includes(normalizeOrigin(origin));
}

const isProduction = process.env.NODE_ENV === 'production';
app.set('trust proxy', isProduction);
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: (origin, cb) => isAllowedOrigin(origin) ? cb(null, true) : cb(new Error('CORS')),
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Use Redis Adapter for Socket.IO only if Redis is enabled
if (isRedisEnabled && pubClient && subClient) {
  io.adapter(createAdapter(pubClient, subClient));
}

// Initialize Admin Socket Namespace
initAdminSocket(io);

const { db, testConnection } = require('./config/database');
const { router: dashboardRoutes, clearDashboardCache } = require('./routes/dashboard');
const productRoutes = require('./routes/products');
const salesRoutes = require('./routes/sales');
const expenseRoutes = require('./routes/expenses');
const debtRoutes = require('./routes/debts');
const businessRoutes = require('./routes/businesses');
const paymentsRoutes = require('./routes/payments');
const adminRoutes = require('./routes/admin');
const adminExportRoutes = require('./routes/adminExport');
const supportRoutes = require('./routes/support');

const { errorHandler } = require('./middleware/errorHandler');
const { requireBusinessAuth } = require('./middleware/auth');
const { requireFirebaseAdminAuth } = require('./middleware/firebaseAdminAuth');
const { requireTenantContext } = require('./middleware/tenantGuard');
const { requireActiveSubscription } = require('./middleware/billingGuard');

const adminAuth = requireFirebaseAdminAuth;

app.use(cors({
  origin: (origin, cb) => isAllowedOrigin(origin) ? cb(null, true) : cb(new Error('CORS')),
  credentials: true
}));
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false, crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" } }));
app.use(morgan('dev'));
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate Limiters - Use RedisStore only if Redis is enabled
const apiGeneralLimiter = rateLimit({ 
  windowMs: 15 * 60 * 1000, 
  max: 1000,
  store: isRedisEnabled ? new RedisStore({ sendCommand: (...args) => client.sendCommand(args) }) : undefined
});

const adminDashboardLimiter = rateLimit({ 
  windowMs: 1 * 60 * 1000, 
  max: 60,
  store: isRedisEnabled ? new RedisStore({ sendCommand: (...args) => client.sendCommand(args) }) : undefined
});

const onboardingLimiter = rateLimit({ 
  windowMs: 60 * 60 * 1000, 
  max: 20,
  store: isRedisEnabled ? new RedisStore({ sendCommand: (...args) => client.sendCommand(args) }) : undefined
});

const adminApiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // limit each IP to 100 requests per windowMs
  message: { success: false, message: 'Too many admin requests, please try again later.' },
  store: isRedisEnabled ? new RedisStore({ sendCommand: (...args) => client.sendCommand(args) }) : undefined
});

const paymentLimiter = rateLimit({ 
  windowMs: 5 * 60 * 1000, 
  max: 50,
  store: isRedisEnabled ? new RedisStore({ sendCommand: (...args) => client.sendCommand(args) }) : undefined
});

app.get('/api/health', async (req, res) => {
  try { 
    await db.raw('SELECT 1'); 
    res.json({ 
      status: 'HEALTHY', 
      database: 'Connected',
      environment: process.env.NODE_ENV || 'development'
    }); 
  }
  catch (e) { res.status(503).json({ status: 'ERROR', message: e.message }); }
});

app.get('/health', (req, res) => res.redirect('/api/health'));

// Wire up app.locals so all route handlers can call cache invalidation and broadcast
// clearDashboardCache now accepts an optional businessId for targeted invalidation
app.locals.clearDashboardCache = (businessId) => clearDashboardCache(businessId);
app.locals.broadcastDataChange = (type, data) => {
  io.emit('data-update', { type, data });
};
app.locals.emitAdminAlert = emitAdminAlert;

// API routes
app.use('/api', apiGeneralLimiter);
app.use('/api/business', onboardingLimiter, requireBusinessAuth, businessRoutes);
app.use('/api/products', requireBusinessAuth, requireTenantContext, requireActiveSubscription, productRoutes);
app.use('/api/sales', requireBusinessAuth, requireTenantContext, requireActiveSubscription, salesRoutes);
app.use('/api/expenses', requireBusinessAuth, requireTenantContext, requireActiveSubscription, expenseRoutes);
app.use('/api/debts', requireBusinessAuth, requireTenantContext, requireActiveSubscription, debtRoutes);
app.use('/api/dashboard', adminDashboardLimiter, requireBusinessAuth, requireTenantContext, requireActiveSubscription, dashboardRoutes);
app.use('/api/payments', paymentLimiter, requireBusinessAuth, requireTenantContext, paymentsRoutes);
app.use('/api/admin/export', adminApiLimiter, requireFirebaseAdminAuth, adminExportRoutes);
app.use('/api/admin', adminApiLimiter, requireFirebaseAdminAuth, adminRoutes);
app.use('/api/support', requireBusinessAuth, supportRoutes);

// API Root Message
app.get('/', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Nexus POS API is Live', 
    version: '1.0.0',
    documentation: '/api/debug-routes' 
  });
});

app.get('*', (req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint not found' });
});

app.use(errorHandler);

const start = async () => {
  try {
    await testConnection();
    await initRedis();
    initWorker();
    initJobs();
    server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  } catch (e) { console.error('FATAL', e); process.exit(1); }
};
start();
