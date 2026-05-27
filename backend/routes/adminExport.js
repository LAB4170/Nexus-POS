const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const { catchAsync } = require('../middleware/errorHandler');

const formatCSVField = (field) => {
  if (field === null || field === undefined) return '';
  const str = String(field);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

// GET /api/admin/export/businesses
router.get('/businesses', catchAsync(async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 1000;
  
  const businesses = await db('businesses as b')
    .select('b.*', 
      db.raw('(SELECT COUNT(*) FROM products WHERE business_id = b.id) as product_count'),
      db.raw('(SELECT COUNT(*) FROM sales WHERE business_id = b.id) as sales_count'),
      db.raw('(SELECT SUM(total) FROM sales WHERE business_id = b.id) as total_revenue'),
      db.raw('(SELECT MAX(created_at) FROM sales WHERE business_id = b.id) as last_activity_at'))
    .orderBy('total_revenue', 'desc')
    .limit(limit);

  const now = new Date();
  const headers = ['ID', 'Name', 'Owner Email', 'Product Count', 'Sales Count', 'Total Revenue', 'Health Status', 'Created At'];
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="businesses_export.csv"');
  
  res.write(headers.join(',') + '\n');
  
  businesses.forEach(b => {
    const lastActivity = b.last_activity_at ? new Date(b.last_activity_at) : null;
    const days = lastActivity ? (now - lastActivity) / (1000 * 60 * 60 * 24) : 999;
    let healthStatus = 'HEALTHY';
    if (days > 14) healthStatus = 'DORMANT';
    else if (days > 7) healthStatus = 'AT_RISK';

    const row = [
      b.id,
      b.name,
      b.owner_email,
      b.product_count,
      b.sales_count,
      b.total_revenue,
      healthStatus,
      b.created_at
    ].map(formatCSVField);
    res.write(row.join(',') + '\n');
  });
  
  res.end();
}));

// GET /api/admin/export/sales
router.get('/sales', catchAsync(async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 1000;

  const sales = await db('sale_items as si')
    .join('sales as s', 'si.sale_id', 's.id')
    .join('businesses as b', 's.business_id', 'b.id')
    .select(
      's.id', 'b.name as business_name', 'si.product_name', 'si.quantity', 'si.total', 's.payment_method', 's.created_at'
    )
    .orderBy('s.created_at', 'desc')
    .limit(limit);

  const headers = ['Sale ID', 'Business Name', 'Product Name', 'Quantity', 'Total', 'Payment Method', 'Created At'];
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="sales_export.csv"');
  
  res.write(headers.join(',') + '\n');
  
  sales.forEach(s => {
    const row = [
      s.id,
      s.business_name,
      s.product_name,
      s.quantity,
      s.total,
      s.payment_method,
      s.created_at
    ].map(formatCSVField);
    res.write(row.join(',') + '\n');
  });
  
  res.end();
}));

// GET /api/admin/export/audit
router.get('/audit', catchAsync(async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 1000;

  const logs = await db('admin_audit_log as a')
    .orderBy('a.created_at', 'desc')
    .limit(limit);

  const headers = ['ID', 'Action', 'Admin Identifier', 'IP Address', 'User Agent', 'Target Business ID', 'Created At'];
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="audit_export.csv"');
  
  res.write(headers.join(',') + '\n');
  
  logs.forEach(l => {
    const row = [
      l.id,
      l.action,
      l.admin_identifier,
      l.ip_address,
      l.user_agent,
      l.target_business_id,
      l.created_at
    ].map(formatCSVField);
    res.write(row.join(',') + '\n');
  });
  
  res.end();
}));

module.exports = router;
