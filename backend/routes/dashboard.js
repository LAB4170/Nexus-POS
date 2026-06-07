const express = require('express');
const router = express.Router();
const Sale = require('../models/Sale');
const Product = require('../models/Product');
const Expense = require('../models/Expense');
const Debt = require('../models/Debt');
const { catchAsync } = require('../middleware/errorHandler');
const { client: redisClient, isRedisEnabled } = require('../config/redis');

// ─── Cache TTLs (in seconds for Redis, ms for memory fallback) ───────────────
const CACHE_TTL = {
  stats:  60,        // 60s — stay accurate for live dashboard
  charts: 5 * 60    // 5 min for chart data
};

// In-memory fallback (used when Redis is unavailable)
const memCache = new Map();

/**
 * getFromCache — async, Redis-first with in-memory fallback
 */
const getFromCache = async (key) => {
  try {
    if (isRedisEnabled && redisClient && redisClient.isReady) {
      const raw = await redisClient.get(key);
      return raw ? JSON.parse(raw) : null;
    }
  } catch (err) {
    console.warn('⚠️ Redis GET failed, falling back to memory:', err.message);
  }

  // In-memory fallback
  const item = memCache.get(key);
  if (!item) return null;
  if (Date.now() > item.expires) { memCache.delete(key); return null; }
  return item.data;
};

/**
 * setCache — async, Redis-first with in-memory fallback
 */
const setCache = async (key, data, ttlSeconds) => {
  try {
    if (isRedisEnabled && redisClient && redisClient.isReady) {
      await redisClient.setEx(key, ttlSeconds, JSON.stringify(data));
      return;
    }
  } catch (err) {
    console.warn('⚠️ Redis SET failed, falling back to memory:', err.message);
  }

  // In-memory fallback — safety flush at 1000 entries
  if (memCache.size > 1000) {
    console.warn('⚠️ Memory Cache Limit Reached. Flushing.');
    memCache.clear();
  }
  memCache.set(key, { data, expires: Date.now() + ttlSeconds * 1000 });
};

/**
 * clearDashboardCache — async, Redis-first with in-memory fallback
 * businessId: clears only that tenant's keys. Omit to clear all.
 */
const clearDashboardCache = async (businessId) => {
  try {
    if (isRedisEnabled && redisClient && redisClient.isReady) {
      const pattern = businessId ? `dashboard:*:${businessId}*` : 'dashboard:*';
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) await redisClient.del(keys);
      console.log(`⚡ Redis cache invalidated ${keys.length} key(s) ${businessId ? `for business: ${businessId}` : '(global)'}`);
      return;
    }
  } catch (err) {
    console.warn('⚠️ Redis DEL failed, clearing memory cache:', err.message);
  }

  // In-memory fallback
  if (businessId) {
    for (const key of memCache.keys()) {
      if (key.includes(`:${businessId}`)) memCache.delete(key);
    }
  } else {
    memCache.clear();
  }
  console.log(`⚡ Memory cache invalidated ${businessId ? `for business: ${businessId}` : '(global)'}`);
};

// GET /api/dashboard/stats - Get dashboard statistics
router.get('/stats', catchAsync(async (req, res) => {
  const { date_from, date_to } = req.query;
  const isCustomDate = date_from || date_to;

  const cacheKey = `dashboard:stats:${req.businessId}:${req.user?.role || 'merchant'}${isCustomDate ? `:${date_from}:${date_to}` : ''}`;
  
  try {
    // Try to get from cache first
    let stats = await getFromCache(cacheKey);
    
    if (!stats) {
      // Calculate stats from database
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      
      const customFilters = {};
      if (date_from) customFilters.date_from = new Date(date_from);
      if (date_to) customFilters.date_to = new Date(date_to);

      // Get sales summary: Period vs Today vs Month
      const salesSummary = (await Sale.getSummary(isCustomDate ? customFilters : {}, req.businessId)) || {};
      const todaySales = (await Sale.getSummary({ date_from: startOfDay, date_to: today }, req.businessId)) || {};
      const monthlySales = (await Sale.getSummary({ date_from: startOfMonth, date_to: today }, req.businessId)) || {};
      
      // Get expenses summary
      const expensesSummary = (await Expense.getSummary(isCustomDate ? customFilters : {}, req.businessId)) || {};
      const todayExpenses = (await Expense.getSummary({ date_from: startOfDay, date_to: today }, req.businessId)) || {};
      const monthlyExpenses = (await Expense.getSummary({ date_from: startOfMonth, date_to: today }, req.businessId)) || {};
      
      // Get debts summary
      const debtsSummary = (await Debt.getSummary(isCustomDate ? customFilters : {}, req.businessId)) || {};
      const todayDebts = (await Debt.getSummary({ date_from: startOfDay, date_to: today }, req.businessId)) || {};
      const monthlyDebts = (await Debt.getSummary({ date_from: startOfMonth, date_to: today }, req.businessId)) || {};
      
      // Get low stock
      const lowStockProducts = (await Product.getLowStock(req.businessId)) || [];
      const inventoryValuation = (await Product.getValuation(req.businessId)) || 0;
      
      stats = {
        sales: {
          total_revenue: Number(salesSummary.total_revenue || 0),
          total_cogs: Number(salesSummary.total_cogs || 0),
          total_sales: Number(salesSummary.total_sales || 0),
          cash_sales: Number(salesSummary.cash_sales || 0),
          mpesa_sales: Number(salesSummary.mpesa_sales || 0),
          debt_sales: Number(salesSummary.debt_sales || 0),
          today_revenue: Number(todaySales.total_revenue || 0),
          today_cogs: Number(todaySales.total_cogs || 0),
          today_sales: Number(todaySales.total_sales || 0),
          today_cash: Number(todaySales.cash_sales || 0),
          today_mpesa: Number(todaySales.mpesa_sales || 0),
          today_debt: Number(todaySales.debt_sales || 0),
          monthly_revenue: Number(monthlySales.total_revenue || 0),
          monthly_cogs: Number(monthlySales.total_cogs || 0),
          monthly_sales: Number(monthlySales.total_sales || 0)
        },
        expenses: {
          total_expenses: Number(expensesSummary.total_amount || 0),
          today_expenses: Number(todayExpenses.total_amount || 0),
          monthly_expenses: Number(monthlyExpenses.total_amount || 0)
        },
        debts: {
          total_outstanding: Number(debtsSummary.pending_amount || 0),
          total_debts: Number(debtsSummary.total_debts || 0),
          today_debts: Number(todayDebts.total_amount || 0),
          monthly_debts: Number(monthlyDebts.pending_amount || 0)
        },
        inventory: {
          total_valuation: Number(inventoryValuation || 0),
          low_stock_count: lowStockProducts.length,
          low_stock_products: lowStockProducts.slice(0, 5)
        }
      };
      
      // Cache result
      await setCache(cacheKey, stats, CACHE_TTL.stats);
    }
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Dashboard stats fetch failed:', error);
    res.json({
      success: true,
      data: { sales: {}, expenses: {}, debts: {}, inventory: { low_stock_products: [] } },
      error: 'Failed to fetch dashboard stats'
    });
  }
}));

// GET /api/dashboard/charts - Get chart data
router.get('/charts', catchAsync(async (req, res) => {
  const { date_from, date_to } = req.query;
  const isCustomDate = date_from || date_to;

  const cacheKey = `dashboard:charts:${req.businessId}${isCustomDate ? `:${date_from}:${date_to}` : ''}`;
  
  try {
    let chartData = await getFromCache(cacheKey);
    
    if (!chartData) {
      // Chart 1: Revenue Trend (Daily Sales)
      let dailySales;
      if (isCustomDate && date_from && date_to) {
          dailySales = (await Sale.getTrend(date_from, date_to, req.businessId)) || [];
      } else {
          dailySales = (await Sale.getDailySales(7, req.businessId)) || [];
      }
      
      // Get sales by payment method
      const customFilters = {};
      if (date_from) customFilters.date_from = new Date(date_from);
      if (date_to) customFilters.date_to = new Date(date_to);

      // Top selling products
      const topProducts = (await Sale.getTopProducts(10, req.businessId, isCustomDate ? customFilters : {})) || [];

      const salesSummary = (await Sale.getSummary(isCustomDate ? customFilters : {}, req.businessId)) || {};
      const paymentDistribution = {
        cash: Number(salesSummary.cash_sales || 0),
        mpesa: Number(salesSummary.mpesa_sales || 0),
        debt: Number(salesSummary.debt_sales || 0)
      };
      
      // Get expenses by category
      const expensesByCategory = (await Expense.getByCategory(req.businessId, isCustomDate ? customFilters : {})) || [];
      
      chartData = {
        daily_sales: dailySales,
        top_products: topProducts,
        payment_distribution: paymentDistribution,
        expenses_by_category: expensesByCategory
      };
      
      // Cache result
      await setCache(cacheKey, chartData, CACHE_TTL.charts);
    }
    
    res.json({
      success: true,
      data: chartData
    });
  } catch (error) {
    console.error('Dashboard charts fetch failed:', error);
    res.json({
      success: true,
      data: { daily_sales: [], top_products: [], payment_distribution: {}, expenses_by_category: [] },
      error: 'Failed to fetch chart data'
    });
  }
}));

// GET /api/dashboard/weekly-expenses - Get weekly expenses (Mon–Sun)
router.get('/weekly-expenses', catchAsync(async (req, res) => {
  try {
    const weekly = await Expense.getWeeklyExpenses(req.businessId);
    res.json({ success: true, data: weekly });
  } catch (error) {
    console.error('Weekly expenses fetch failed:', error);
    res.json({ success: true, data: { days: [] } });
  }
}));

// GET /api/dashboard/recent-activities - Get recent activities
router.get('/recent-activities', catchAsync(async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const halfLimit = Math.ceil(limit / 2);

    // Use findPaginated for proper limit support
    const salesResult = await Sale.findPaginated({}, { page: 1, perPage: halfLimit, sortBy: 'created_at', sortDir: 'desc' }, req.businessId);
    const recentSales = salesResult.items || [];

    // Get recent expenses (findAll supports ordering already)
    const allExpenses = await Expense.findAll({}, req.businessId);
    const recentExpenses = (allExpenses || []).slice(0, halfLimit);

    // Normalize to a safe ISO date string
    const toISO = (val) => {
      if (!val) return new Date().toISOString();
      try { return new Date(val).toISOString(); } catch { return new Date().toISOString(); }
    };

    // Combine and sort by date
    const activities = [
      ...recentSales.map(sale => {
        let desc = 'Unknown Product';
        if (sale.items && sale.items.length > 0) {
          desc = sale.items.map(it => `${it.product_name || it.productName || 'Unknown'} (x${it.quantity})`).join(', ');
        }
        return {
          id: sale.id,
          type: 'sale',
          description: `Sale: ${desc}`,
          amount: parseFloat(sale.total) || 0,
          payment_method: sale.paymentMethod || 'cash',
          created_at: toISO(sale.createdAt || sale.created_at)
        };
      }),
      ...recentExpenses.map(expense => ({
        id: expense.id,
        type: 'expense',
        description: `Expense: ${expense.description || 'General'}`,
        amount: parseFloat(expense.amount) || 0,
        payment_method: null,
        created_at: toISO(expense.createdAt || expense.created_at)
      }))
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
     .slice(0, limit);

    res.json({
      success: true,
      data: activities
    });
  } catch (error) {
    console.error('Recent activities fetch failed:', error);
    res.json({ success: true, data: [] });
  }
}));

// GET /api/dashboard/alerts - Get system alerts
router.get('/alerts', catchAsync(async (req, res) => {
  const alerts = [];

  // Each block is independently guarded so one failure can't produce a 500
  try {
    const lowStockProducts = (await Product.getLowStock(req.businessId)) || [];
    lowStockProducts.slice(0, 5).forEach(product => {
      alerts.push({
        type: 'warning',
        title: 'Low Stock Alert',
        message: `${product.name} is running low (${product.stock_quantity ?? product.stock ?? 0} units left)`,
        created_at: new Date().toISOString()
      });
    });
  } catch (e) { console.error('[alerts] low stock check failed:', e.message); }

  try {
    // Use getSummary instead of getOverdue (which doesn't exist)
    const debtSummary = (await Debt.getSummary({}, req.businessId)) || {};
    const pending = Number(debtSummary.pending_amount || debtSummary.total_outstanding || 0);
    const total = Number(debtSummary.total_debts || 0);
    if (total > 0) {
      alerts.push({
        type: total > 5 ? 'error' : 'warning',
        title: 'Outstanding Debts',
        message: `${total} outstanding debt${total !== 1 ? 's' : ''} totalling KSh ${pending.toLocaleString()}`,
        created_at: new Date().toISOString()
      });
    }
  } catch (e) { console.error('[alerts] debt check failed:', e.message); }

  try {
    // High expense alert using only getSummary (confirmed to exist)
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const todayExp = (await Expense.getSummary({ date_from: startOfDay, date_to: today }, req.businessId)) || {};
    const monthlyExp = (await Expense.getSummary({ date_from: startOfMonth, date_to: today }, req.businessId)) || {};
    const todayAmt = Number(todayExp.total_amount || 0);
    const monthlyAmt = Number(monthlyExp.total_amount || 0);
    const avgDaily = monthlyAmt / (today.getDate() || 1);
    if (avgDaily > 0 && todayAmt > avgDaily * 1.5) {
      alerts.push({
        type: 'warning',
        title: 'High Daily Expenses',
        message: `Today's expenses (KSh ${todayAmt.toLocaleString()}) are 50% above your daily average`,
        created_at: new Date().toISOString()
      });
    }
  } catch (e) { console.error('[alerts] expense check failed:', e.message); }

  res.json({ success: true, data: alerts });
}));

module.exports = {
  router,
  clearDashboardCache
};

