// backend/middleware/auditLog.js
/**
 * Admin Audit Log Middleware
 * Records every admin action to the admin_audit_log table for compliance and traceability.
 *
 * Usage in routes:
 *   router.get('/businesses/:id', auditLog('VIEW_BUSINESS'), catchAsync(handler))
 *   router.get('/overview',       auditLog('VIEW_OVERVIEW'), catchAsync(handler))
 */
const { db } = require('../config/database');

/**
 * @param {string} action - A short descriptive action label (e.g. 'VIEW_OVERVIEW', 'VIEW_BUSINESS')
 */
const auditLog = (action) => async (req, res, next) => {
  // Non-blocking: write the log asynchronously, don't block the request
  const targetBusinessId = req.params?.id || null;
  // Use identity from Firebase admin auth middleware
  const adminUid = req.adminUid || null;
  const adminEmail = req.adminEmail || req.headers['x-admin-identifier'] || 'api-key-auth';
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const userAgent = req.get('User-Agent') || '';

  db('admin_audit_log').insert({
    action,
    target_business_id: targetBusinessId,
    admin_uid: adminUid,
    admin_identifier: adminEmail,
    ip_address: ip,
    user_agent: userAgent,
    metadata: JSON.stringify({
      method: req.method,
      path: req.originalUrl,
      query: req.query
    })
  }).catch((err) => {
    // Never let audit log failure break the actual request
    console.error('⚠️  Audit log write failed (non-fatal):', err.message);
  });

  next();
};

module.exports = { auditLog };
