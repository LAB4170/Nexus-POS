const { body, validationResult } = require('express-validator');
const { AppError } = require('./errorHandler');

/**
 * Common middleware to validate the request and throw a 400 if validation fails.
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return next();
  }
  
  const extractedErrors = [];
  errors.array().map(err => extractedErrors.push({ [err.path]: err.msg }));

  throw new AppError(`Validation failed: ${JSON.stringify(extractedErrors)}`, 400);
};

/**
 * Product Validation Rules
 */
const productValidationRules = [
  body('name').trim().notEmpty().withMessage('Product name is required').isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
  body('category').trim().notEmpty().withMessage('Category is required'),
  body('price').isFloat({ min: 0.01 }).withMessage('Price must be a positive number'),
  body('stockQuantity').isFloat({ min: 0 }).withMessage('Stock quantity cannot be negative'),
  body('unit').optional().trim().isLength({ max: 20 })
];

/**
 * Sale Validation Rules
 */
const saleValidationRules = [
  // Accept an array of items for multi-product sales
  body('items')
    .optional()
    .isArray({ min: 1 })
    .withMessage('Items must be a non-empty array')
    .custom((items) => {
      for (const i of items) {
        if (!i.productId) {
          throw new Error('Each item must have productId');
        }
        if (!i.quantity || Number(i.quantity) <= 0) {
          throw new Error('Each item must have a positive quantity');
        }
      }
      return true;
    }),
  // Fallback to single item fields when items array not provided
  body('productId')
    .if((value, { req }) => !req.body.items)
    .notEmpty()
    .withMessage('Product ID is required'),
  body('quantity')
    .if((value, { req }) => !req.body.items)
    .isFloat({ min: 0.01 })
    .withMessage('Quantity must be greater than zero'),
  // Payment method supports both snake_case and camelCase
  body('paymentMethod').optional().isIn(['cash', 'mpesa', 'debt']).withMessage('Invalid payment method'),
  body('payment_method').optional().isIn(['cash', 'mpesa', 'debt']).withMessage('Invalid payment method'),
  body('customerName').optional().trim().isLength({ max: 100 }),
  body('customer_name').optional().trim().isLength({ max: 100 }),
  // Ensure at least one payment field is present
  body().custom((value) => {
    if (!value.paymentMethod && !value.payment_method) {
      throw new Error('Payment method is required');
    }
    return true;
  })
];

/**
 * Expense Validation Rules
 */
const expenseValidationRules = [
  body('description').trim().notEmpty().withMessage('Description is required').isLength({ max: 255 }),
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be a positive number'),
  body('category').trim().notEmpty().withMessage('Category is required')
];

/**
 * Debt Payment Validation Rules
 */
const debtPaymentValidationRules = [
  body('amount').isFloat({ min: 0.01 }).withMessage('Payment amount must be positive'),
  body('payment_method').isIn(['cash', 'mpesa', 'bank']).withMessage('Invalid payment method')
];

module.exports = {
  validate,
  productValidationRules,
  saleValidationRules,
  expenseValidationRules,
  debtPaymentValidationRules
};
