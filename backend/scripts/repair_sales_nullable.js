const { db } = require('../config/database');

async function repairNullableColumns() {
  try {
    console.log("Altering sales table columns to be nullable...");
    await db.schema.alterTable('sales', (table) => {
      table.uuid('product_id').nullable().alter();
      table.string('product_name').nullable().alter();
      table.decimal('quantity', 14, 3).nullable().alter();
      table.decimal('unit_price', 14, 2).nullable().alter();
    });
    console.log("✅ sales columns are now nullable.");
  } catch (e) {
    console.error("Repair failed:", e);
  } finally {
    process.exit(0);
  }
}

repairNullableColumns();
