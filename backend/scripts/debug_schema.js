const { db } = require('../config/database');

async function checkSchema() {
  try {
    const saleItemsCols = await db.raw("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'sale_items'");
    console.log("=== sale_items columns ===");
    console.table(saleItemsCols.rows);

    const salesCols = await db.raw("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'sales'");
    console.log("=== sales columns ===");
    console.table(salesCols.rows);

  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}

checkSchema();
