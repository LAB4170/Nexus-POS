// backend/middleware/pagination.js
/**
 * Pagination and sorting helper middleware for admin list endpoints.
 * Extracts ?page, ?limit, ?sort, ?order from query string and attaches
 * pagination object to req.pagination.
 */
module.exports = (defaultLimit = 20) => (req, res, next) => {
  const page = parseInt(req.query.page, 10) > 0 ? parseInt(req.query.page, 10) : 1;
  const limit = parseInt(req.query.limit, 10) > 0 ? parseInt(req.query.limit, 10) : defaultLimit;
  const sort = req.query.sort || null; // column name
  const order = (req.query.order || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
  req.pagination = { page, limit, offset: (page - 1) * limit, sort, order };
  next();
};
