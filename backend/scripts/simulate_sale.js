const { db } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

async function simulateSale() {
  const businessId = 'd32c5890-25e3-4dff-aa5d-752e35a163a7'; // Using a real business id if needed, but we can query one
  
  try {
    const product = await db('products').first();
    if (!product) throw new Error("No product found in the entire DB");
    console.log("Using product:", product.id);

    const business = await db('businesses').where('id', product.business_id).first();
    if (!business) throw new Error("No business found for this product");
    console.log("Using business:", business.id);

    await db.transaction(async (trx) => {
      const saleId = uuidv4();
      
      console.log("Inserting sale...");
      await trx('sales').insert({
        id: saleId,
        business_id: business.id,
        total: 100,
        total_cogs: 50,
        payment_method: 'cash',
        status: 'completed',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      console.log("Sale inserted.");

      console.log("Inserting sale_items...");
      await trx('sale_items').insert([{
        id: uuidv4(),
        sale_id: saleId,
        product_id: product.id,
        product_name: 'Test',
        quantity: 1,
        unit_price: 100,
        unit_cost: 50,
        total: 100
      }]);
      console.log("Sale items inserted.");
      
      // Rollback so we don't pollute the db
      throw new Error("ROLLBACK_SUCCESS");
    });
  } catch (e) {
    if (e.message === "ROLLBACK_SUCCESS") {
      console.log("Simulation successful! The DB schema is flawless.");
    } else {
      console.error("Simulation failed:", e);
    }
  } finally {
    process.exit(0);
  }
}

simulateSale();
