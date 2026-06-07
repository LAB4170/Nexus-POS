const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const { catchAsync } = require('../middleware/errorHandler');
const { auditLog } = require('../middleware/auditLog');
const { admin } = require('../config/firebase');
const { v4: uuidv4 } = require('uuid');
const pagination = require('../middleware/pagination');

/**
 * GET /api/admin/overview
 * Provides high-level system-wide statistics for Lewis with advanced insights.
 */
router.get('/overview', auditLog('VIEW_OVERVIEW'), catchAsync(async (req, res) => {
  const now = new Date();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now - 60 * 24 * 60 * 60 * 1000);

  const totalBusinesses = await db('businesses').count('id as count').first();
  const totalSales = await db('sales').count('id as count').sum('total as sum').first();
  const totalProducts = await db('products').count('id as count').first();
  
  // NEW: Real Human Telemetry from Firebase
  let userStats = { totalUsers: 0, newUsersToday: 0 };
  try {
    const listUsers = await admin.auth().listUsers(1000);
    userStats.totalUsers = listUsers.users.length;
    const today = new Date().setHours(0,0,0,0);
    userStats.newUsersToday = listUsers.users.filter(u => new Date(u.metadata.creationTime) >= today).length;
  } catch (e) { console.error('Firebase user fetch failed:', e.message); }
  
  const currentMonthRevenue = await db('sales')
    .sum('total as sum')
    .where('created_at', '>=', thirtyDaysAgo)
    .first();
  
  const prevMonthRevenue = await db('sales')
    .sum('total as sum')
    .where('created_at', '>=', sixtyDaysAgo)
    .andWhere('created_at', '<', thirtyDaysAgo)
    .first();

  // Null-safe growth: handle new platforms with no prior month data
  const prev = parseFloat(prevMonthRevenue.sum || 0);
  const curr = parseFloat(currentMonthRevenue.sum || 0);
  const revGrowth = prev > 0 ? ((curr - prev) / prev) * 100 : (curr > 0 ? 100 : 0);

  const activeBusinessesCount = await db('sales')
    .distinct('business_id')
    .where('created_at', '>=', thirtyDaysAgo)
    .then(rows => rows.length);
  
  const retentionRate = (parseInt(totalBusinesses.count) > 0)
    ? (activeBusinessesCount / parseInt(totalBusinesses.count)) * 100
    : 0;

  const salesTrend = await db('sales')
    .select(db.raw('DATE(created_at) as day'))
    .sum('total as amount')
    .where('created_at', '>=', db.raw('CURRENT_DATE - INTERVAL \'7 days\''))
    .groupBy('day')
    .orderBy('day', 'asc');

  // NEW: Hourly Velocity (Network Pulse)
  const hourlyVelocity = await db('sales')
    .select(db.raw('EXTRACT(HOUR FROM created_at) as hour'))
    .count('id as count')
    .where('created_at', '>=', db.raw('CURRENT_DATE'))
    .groupBy('hour')
    .orderBy('hour', 'asc');

  // NEW: Global Inventory Health (Dynamic Status calculation)
  const inventoryHealth = await db('products')
    .select(db.raw(`
      CASE 
        WHEN stock_quantity <= 0 THEN 'outstock'
        WHEN stock_quantity <= 10 THEN 'lowstock'
        ELSE 'instock'
      END as status
    `))
    .count('id as count')
    .groupBy('status');

  // FIX: product data lives in sale_items in the relational model, not on sales
  const globalTopProducts = await db('sale_items as si')
    .join('sales as s', 'si.sale_id', 's.id')
    .select('si.product_name')
    .sum('si.total as revenue')
    .sum('si.quantity as total_quantity')
    .count('si.id as count')
    .groupBy('si.product_name')
    .orderBy('revenue', 'desc')
    .limit(5);

  const paymentBreakdown = await db('sales')
    .select('payment_method')
    .sum('total as amount')
    .groupBy('payment_method');

  const formattedPayments = paymentBreakdown.map(p => ({
      name: p.payment_method?.toUpperCase() || 'UNKNOWN',
      value: parseFloat(p.amount || 0)
  }));

  res.json({
    success: true,
    data: {
      totalBusinesses: parseInt(totalBusinesses.count),
      totalSalesCount: parseInt(totalSales.count || 0),
      totalRevenue: parseFloat(totalSales.sum || 0),
      totalProducts: parseInt(totalProducts.count),
      growth: {
        revenue: parseFloat(revGrowth.toFixed(2)),
        activeTenants: activeBusinessesCount
      },
      retentionRate: parseFloat(retentionRate.toFixed(2)),
      salesTrend,
      globalTopProducts,
      paymentBreakdown: formattedPayments,
      userStats,
      hourlyVelocity,
      inventoryHealth
    }
  });
}));

/**
 * GET /api/admin/activities
 */
router.get('/activities', auditLog('VIEW_ACTIVITIES'), pagination(50), catchAsync(async (req, res) => {
    const { limit, offset } = req.pagination;
    
    // Get total count
    const totalRes = await db('sale_items as si').join('sales as s', 'si.sale_id', 's.id').count('si.id as count').first();
    const total = parseInt(totalRes.count || 0);

    const activities = await db('sale_items as si')
        .join('sales as s', 'si.sale_id', 's.id')
        .join('businesses as b', 's.business_id', 'b.id')
        .select(
          'si.id', 'si.product_name', 'si.quantity', 'si.total', 'si.unit_price',
          's.id as sale_id', 's.created_at', 's.payment_method',
          'b.name as business_name'
        )
        .orderBy('s.created_at', 'desc')
        .limit(limit)
        .offset(offset);
        
    res.json({ success: true, data: activities, pagination: { ...req.pagination, total } });
}));

/**
 * SUPPORT ROUTES
 */
router.get('/support/tickets', auditLog('VIEW_SUPPORT_TICKETS'), pagination(20), catchAsync(async (req, res) => {
  const { limit, offset } = req.pagination;
  const totalRes = await db('support_tickets').count('id as count').first();
  const total = parseInt(totalRes.count || 0);

  const tickets = await db('support_tickets as t')
    .join('businesses as b', 't.business_id', 'b.id')
    .select('t.*', 'b.name as business_name', 'b.owner_email')
    .orderBy('t.updated_at', 'desc')
    .limit(limit)
    .offset(offset);
    
  res.json({ success: true, data: tickets, pagination: { ...req.pagination, total } });
}));

router.get('/support/tickets/:id', auditLog('VIEW_SUPPORT_TICKET_DETAIL'), catchAsync(async (req, res) => {
  const { id } = req.params;
  const ticket = await db('support_tickets as t')
    .join('businesses as b', 't.business_id', 'b.id')
    .select('t.*', 'b.name as business_name', 'b.owner_email')
    .where('t.id', id)
    .first();
  if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
  const messages = await db('support_messages').where({ ticket_id: id }).orderBy('created_at', 'asc');
  res.json({ success: true, data: { ticket, messages } });
}));

router.post('/support/tickets/:id/reply', auditLog('REPLY_SUPPORT_TICKET'), catchAsync(async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ success: false, message: 'Reply content is required' });
  // FIX: Include UUID and timestamps
  await db('support_messages').insert({
    id: uuidv4(),
    ticket_id: id,
    sender_id: req.adminEmail || 'admin',
    sender_role: 'admin',
    content: content.trim(),
    created_at: new Date().toISOString()
  });
  await db('support_tickets').where({ id }).update({ status: 'in_progress', updated_at: new Date().toISOString() });
  
  // Broadcast to tenants
  if (req.app.locals.broadcastDataChange) {
    req.app.locals.broadcastDataChange('support', { ticketId: id });
  }

  res.json({ success: true, message: 'Reply sent' });
}));

router.patch('/support/tickets/:id/status', auditLog('UPDATE_SUPPORT_TICKET_STATUS'), catchAsync(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  await db('support_tickets').where({ id }).update({ status, updated_at: new Date().toISOString() });
  
  // Broadcast to tenants
  if (req.app.locals.broadcastDataChange) {
    req.app.locals.broadcastDataChange('support', { ticketId: id });
  }

  res.json({ success: true, message: `Ticket marked as ${status}` });
}));

/**
 * MERCHANT FLEET
 */
router.get('/businesses', auditLog('LIST_BUSINESSES'), pagination(20), catchAsync(async (req, res) => {
    const { limit, offset } = req.pagination;
    const totalRes = await db('businesses').count('id as count').first();
    const total = parseInt(totalRes.count || 0);

    const businesses = await db('businesses as b')
      .select('b.*', 
        db.raw('(SELECT COUNT(*) FROM products WHERE business_id = b.id) as product_count'),
        db.raw('(SELECT COUNT(*) FROM sales WHERE business_id = b.id) as sales_count'),
        db.raw('(SELECT SUM(total) FROM sales WHERE business_id = b.id) as total_revenue'),
        db.raw('(SELECT MAX(created_at) FROM sales WHERE business_id = b.id) as last_activity_at'))
      .orderBy('total_revenue', 'desc')
      .limit(limit)
      .offset(offset);

    const now = new Date();
    const enriched = businesses.map(b => {
        const lastActivity = b.last_activity_at ? new Date(b.last_activity_at) : null;
        const days = lastActivity ? (now - lastActivity) / (1000 * 60 * 60 * 24) : 999;
        let healthStatus = 'HEALTHY';
        if (days > 14) healthStatus = 'DORMANT';
        else if (days > 7) healthStatus = 'AT_RISK';
        return { ...b, healthStatus, daysSinceActivity: Math.floor(days) };
    });
    res.json({ success: true, data: enriched, pagination: { ...req.pagination, total } });
}));

router.get('/businesses/:id', auditLog('VIEW_BUSINESS'), catchAsync(async (req, res) => {
    const { id } = req.params;
    const business = await db('businesses').where({ id }).first();
    if (!business) return res.status(404).json({ success: false, message: 'Business not found' });

    // FIX: Use sale_items for product-level data
    const recentSales = await db('sales as s')
      .where('s.business_id', id)
      .leftJoin('sale_items as si', 's.id', 'si.sale_id')
      .select('s.id', 's.total', 's.payment_method', 's.status', 's.created_at',
        db.raw("COALESCE(string_agg(si.product_name, ', '), 'Multiple Items') as product_name"))
      .groupBy('s.id')
      .orderBy('s.created_at', 'desc')
      .limit(15);

    const topProducts = await db('sale_items as si')
      .join('sales as s', 'si.sale_id', 's.id')
      .where('s.business_id', id)
      .select('si.product_name')
      .sum('si.total as revenue')
      .sum('si.quantity as total_quantity')
      .groupBy('si.product_name')
      .orderBy('revenue', 'desc')
      .limit(10);

    const revenueTrend = await db('sales')
      .select(db.raw('DATE(created_at) as day'))
      .sum('total as amount')
      .where({ business_id: id })
      .groupBy('day')
      .orderBy('day', 'asc');

    res.json({ success: true, data: { business, recentSales, topProducts, revenueTrend } });
}));

router.post('/businesses/:id/status', auditLog('UPDATE_BUSINESS_STATUS'), catchAsync(async (req, res) => {
    const { id } = req.params;
    const { is_suspended, admin_notes } = req.body;
    await db('businesses').where({ id }).update({ is_suspended: !!is_suspended, admin_notes: admin_notes || '', updated_at: new Date() });
    res.json({ success: true, message: 'Status updated' });
}));

router.post('/businesses/:id/extend-trial', auditLog('EXTEND_TRIAL'), catchAsync(async (req, res) => {
    const { id } = req.params;
    const { days = 7 } = req.body;
    await db.raw(`UPDATE businesses SET trial_ends_at = GREATEST(trial_ends_at, CURRENT_TIMESTAMP) + (? || ' days')::interval WHERE id = ?`, [days, id]);
    res.json({ success: true, message: 'Trial extended' });
}));

router.post('/businesses/:id/impersonate', auditLog('IMPERSONATE_BUSINESS'), catchAsync(async (req, res) => {
    const { id } = req.params;
    const business = await db('businesses').where({ id }).first();
    const userRecord = await admin.auth().getUserByEmail(business.owner_email);
    const customToken = await admin.auth().createCustomToken(userRecord.uid, { is_impersonation: true });
    res.json({ success: true, customToken });
}));

router.get('/audit-log', auditLog('VIEW_AUDIT_LOG'), pagination(50), catchAsync(async (req, res) => {
  const { limit, offset } = req.pagination;
  const totalRes = await db('admin_audit_log').count('id as count').first();
  const total = parseInt(totalRes.count || 0);

  const logs = await db('admin_audit_log as a')
    .leftJoin('businesses as b', 'a.target_business_id', 'b.id')
    .select('a.*', 'b.name as business_name')
    .orderBy('a.created_at', 'desc')
    .limit(limit)
    .offset(offset);
    
  res.json({ success: true, data: logs, pagination: { ...req.pagination, total } });
}));

/**
 * GET /api/admin/users
 * Lists actual human users from Firebase
 */
router.get('/users', auditLog('LIST_USERS'), pagination(50), catchAsync(async (req, res) => {
    // Note: Firebase listUsers doesn't natively support easy offset pagination.
    // For large scale, we would need to use pageToken.
    // Here we'll fetch a larger set and manually paginate or just return all with faux pagination data if it's small.
    // Given the task, we'll fetch up to 1000 and slice it.
    const { limit, offset, page } = req.pagination;
    const listUsers = await admin.auth().listUsers(1000); // Grab up to 1000 users for simple slicing
    
    let users = listUsers.users.map(u => ({
        uid: u.uid,
        email: u.email,
        displayName: u.displayName,
        createdAt: u.metadata.creationTime,
        lastLogin: u.metadata.lastSignInTime,
        role: u.customClaims?.role || 'merchant'
    }));
    
    const total = users.length;
    users = users.slice(offset, offset + limit);

    res.json({ success: true, data: users, pagination: { page, limit, offset, total } });
}));


/**
 * GET /api/admin/db-health
 * Comprehensive database health check for diagnosing production issues.
 * Protected by requireFirebaseAdminAuth (admin-only).
 */
router.get('/db-health', catchAsync(async (req, res) => {
  const report = {};

  // 1. Connectivity
  try {
    await db.raw('SELECT 1');
    report.connectivity = 'OK';
  } catch (e) {
    return res.status(503).json({ success: false, message: 'DB unreachable: ' + e.message });
  }

  // 2. Table existence
  const tables = ['products', 'sales', 'sale_items', 'expenses', 'debts', 'businesses', 'knex_migrations', 'knex_migrations_lock'];
  report.tables = {};
  for (const t of tables) {
    report.tables[t] = await db.schema.hasTable(t);
  }

  // 3. Migration history
  try {
    const migrations = await db('knex_migrations').select('name', 'batch').orderBy('id');
    report.migrations = { count: migrations.length, records: migrations };
  } catch (e) {
    report.migrations = { error: e.message };
  }

  // 4. Row counts
  const countTables = ['products', 'sales', 'sale_items', 'expenses', 'debts', 'businesses'];
  report.rowCounts = {};
  for (const t of countTables) {
    try {
      const [{ count }] = await db(t).count('* as count');
      report.rowCounts[t] = parseInt(count);
    } catch (e) {
      report.rowCounts[t] = 'ERROR: ' + e.message;
    }
  }

  // 5. RLS status — the main suspect for 500s
  try {
    const rls = await db.raw(`
      SELECT tablename, rowsecurity 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename IN ('products', 'sales', 'expenses', 'debts', 'sale_items')
      ORDER BY tablename
    `);
    report.rls = {};
    rls.rows.forEach(r => { report.rls[r.tablename] = r.rowsecurity ? 'ENABLED (🔴 DANGER)' : 'disabled ✅'; });
  } catch (e) {
    report.rls = { error: e.message };
  }

  // 6. Businesses table columns
  try {
    const cols = await db.raw(`SELECT column_name FROM information_schema.columns WHERE table_name='businesses' ORDER BY ordinal_position`);
    report.businessesColumns = cols.rows.map(r => r.column_name);
  } catch (e) {
    report.businessesColumns = 'ERROR: ' + e.message;
  }

  // 7. Businesses data
  try {
    const biz = await db('businesses').select('id', 'name', 'owner_email', 'subscription_status');
    report.businesses = biz;
  } catch (e) {
    report.businesses = 'ERROR: ' + e.message;
  }

  res.json({ success: true, data: report });
}));

module.exports = router;
