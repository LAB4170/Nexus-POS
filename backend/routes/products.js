const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const { catchAsync, AppError } = require('../middleware/errorHandler');
const { productValidationRules, validate } = require('../middleware/validation');

// GET /api/products - Get all products (supports pagination and filters)
router.get('/', catchAsync(async (req, res) => {
  const filters = {
    category: req.query.category,
    low_stock: req.query.low_stock === 'true',
    search: req.query.search
  };

  const page = req.query.page ? parseInt(req.query.page) : null;
  const perPage = req.query.perPage ? parseInt(req.query.perPage) : (req.query.per_page ? parseInt(req.query.per_page) : null);
  const sortBy = req.query.sortBy || req.query.sort_by || 'name';
  const sortDir = req.query.sortDir || req.query.sort_dir || 'asc';

  if (page || perPage) {
    const result = await Product.findPaginated({ category: filters.category, search: filters.search }, {
      page: page || 1,
      perPage: perPage || 25,
      sortBy,
      sortDir
    }, req.businessId);

    return res.json({
      success: true,
      data: result.items,
      meta: {
        total: result.total,
        page: result.page,
        perPage: result.perPage,
        totalPages: result.totalPages,
        sortBy,
        sortDir
      }
    });
  }

  const products = await Product.findAll(filters, req.businessId);
  
  res.json({
    success: true,
    data: products,
    count: products.length
  });
}));

// GET /api/products/categories - Get all product categories
router.get('/categories', catchAsync(async (req, res) => {
  const categories = await Product.getCategories(req.businessId);
  
  res.json({
    success: true,
    data: categories
  });
}));

// GET /api/products/low-stock - Get low stock products
router.get('/low-stock', catchAsync(async (req, res) => {
  const products = await Product.getLowStock(req.businessId);
  
  res.json({
    success: true,
    data: products,
    count: products.length
  });
}));

// GET /api/products/:id - Get product by ID
router.get('/:id', catchAsync(async (req, res) => {
  const product = await Product.findById(req.params.id, req.businessId);
  
  if (!product) {
    throw new AppError('Product not found', 404);
  }
  
  res.json({
    success: true,
    data: product
  });
}));

// GET /api/products/:id/can-delete - Check if product can be deleted
router.get('/:id/can-delete', catchAsync(async (req, res) => {
  const product = await Product.findById(req.params.id, req.businessId);
  if (!product) {
    throw new AppError('Product not found', 404);
  }

  const hasSales = await Product.hasSalesRecords(req.params.id, req.businessId);
  
  res.json({
    success: true,
    data: {
      canDelete: !hasSales,
      hasSalesRecords: hasSales,
      message: hasSales ? 'Product has sales records and cannot be deleted' : 'Product can be safely deleted'
    }
  });
}));

// POST /api/products - Create new product
router.post('/', productValidationRules, validate, catchAsync(async (req, res) => {
  const productData = {
    ...req.body,
    businessId: req.businessId,
    businessCategory: req.business?.business_category || 'retail'
  };

  const product = await Product.create(productData);
  
  // Real-time broadcast
  req.app.locals.broadcastDataChange('product', product);
  req.app.locals.clearDashboardCache(req.businessId);
  
  res.status(201).json({
    success: true,
    message: 'Product created successfully',
    data: product
  });
}));

// PUT /api/products/:id - Update product
router.put('/:id', productValidationRules, validate, catchAsync(async (req, res) => {
  const product = await Product.findById(req.params.id, req.businessId);
  if (!product) {
    throw new AppError('Product not found', 404);
  }

  const updatedProduct = await Product.update(req.params.id, req.body, req.businessId);
  
  // Real-time broadcast
  req.app.locals.broadcastDataChange('product', updatedProduct);
  req.app.locals.clearDashboardCache(req.businessId);
  
  res.json({
    success: true,
    message: 'Product updated successfully',
    data: updatedProduct
  });
}));

// PATCH /api/products/:id/stock - Update product stock
router.patch('/:id/stock', catchAsync(async (req, res) => {
  const { quantity, operation } = req.body;
  
  if (!quantity || !operation) {
    throw new AppError('Quantity and operation are required', 400);
  }

  if (!['add', 'subtract'].includes(operation)) {
    throw new AppError('Operation must be "add" or "subtract"', 400);
  }

  const updatedProduct = await Product.updateStock(req.params.id, quantity, operation, req.businessId);
  
  res.json({
    success: true,
    message: 'Stock updated successfully',
    data: updatedProduct
  });
  req.app.locals.clearDashboardCache(req.businessId);
}));

// DELETE /api/products/:id - Delete product
router.delete('/:id', catchAsync(async (req, res) => {
  const product = await Product.findById(req.params.id, req.businessId);
  if (!product) {
    throw new AppError('Product not found', 404);
  }

  // Database ON DELETE SET NULL will safely handle the historical sales receipts


  await Product.delete(req.params.id, req.businessId);
  
  // Real-time broadcast
  req.app.locals.broadcastDataChange('product', { id: req.params.id, deleted: true });
  req.app.locals.clearDashboardCache(req.businessId);
  
  res.json({
    success: true,
    message: 'Product deleted successfully'
  });
}));

module.exports = router;
