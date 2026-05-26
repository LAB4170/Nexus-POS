require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { db } = require('./backend/config/database');
const Sale = require('./backend/models/Sale');
(async () => {
  try {
    // Get a business ID (first one)
    const business = await db('businesses').first();
    if (!business) { console.error('No business found'); return; }
    const businessId = business.id;
    console.log('Using businessId', businessId);
    // Create a product first
    const product = await db('products').where('business_id', businessId).first();
    if (!product) { console.error('No product found'); return; }
    // Create a sale
    const saleData = {
      items: [{
        productId: product.id,
        productName: product.name,
        quantity: 1,
        unitPrice: product.price,
        total: product.price
      }],
      businessId,
      paymentMethod: 'cash',
      status: 'completed'
    };
    const sale = await Sale.create(saleData);
    console.log('Created sale', sale.id);
    // Delete the sale
    const result = await Sale.delete(sale.id, businessId);
    console.log('Deleted sale result', result);
  } catch (e) {
    console.error('Error', e);
  } finally {
    process.exit();
  }
})();
