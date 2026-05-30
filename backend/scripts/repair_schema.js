const { db } = require('../config/database');

async function repairSchema() {
  try {
    console.log("Checking sales.total_cogs...");
    const hasTotalCogs = await db.schema.hasColumn('sales', 'total_cogs');
    if (!hasTotalCogs) {
      console.log("Missing sales.total_cogs! Adding it...");
      await db.schema.alterTable('sales', t => t.decimal('total_cogs', 14, 2).defaultTo(0).notNullable());
      console.log("Added sales.total_cogs.");
    } else {
      console.log("sales.total_cogs exists.");
    }

    console.log("Checking products.unit_cost...");
    const hasUnitCost = await db.schema.hasColumn('products', 'unit_cost');
    if (!hasUnitCost) {
      console.log("Missing products.unit_cost! Adding it...");
      await db.schema.alterTable('products', t => t.decimal('unit_cost', 14, 2).defaultTo(0));
      console.log("Added products.unit_cost.");
    } else {
      console.log("products.unit_cost exists.");
    }

    console.log("Checking products.metadata...");
    const hasMetadata = await db.schema.hasColumn('products', 'metadata');
    if (!hasMetadata) {
      console.log("Missing products.metadata! Adding it...");
      await db.schema.alterTable('products', t => t.jsonb('metadata').defaultTo('{}'));
      console.log("Added products.metadata.");
    } else {
      console.log("products.metadata exists.");
    }

    console.log("Checking products.unit...");
    const hasUnit = await db.schema.hasColumn('products', 'unit');
    if (!hasUnit) {
      console.log("Missing products.unit! Adding it...");
      await db.schema.alterTable('products', t => t.string('unit').defaultTo('pcs'));
      console.log("Added products.unit.");
    } else {
      console.log("products.unit exists.");
    }

  } catch (e) {
    console.error("Repair failed:", e);
  } finally {
    process.exit(0);
  }
}

repairSchema();
