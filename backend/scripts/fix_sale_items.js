/**
 * Emergency fix: create sale_items table directly on Neon.
 * This is safe to run multiple times (idempotent).
 */
const knex = require('knex');

const db = knex({
  client: 'postgresql',
  connection: {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  },
  pool: { min: 1, max: 2 }
});

async function fix() {
  console.log('\n🔧 NEXUS POS - Emergency sale_items Fix\n');

  try {
    await db.raw('SELECT 1');
    console.log('✅ Connected to Neon\n');
  } catch (e) {
    console.error('❌ Cannot connect:', e.message);
    process.exit(1);
  }

  // Check if already exists
  const exists = await db.schema.hasTable('sale_items');
  if (exists) {
    console.log('✅ sale_items already exists — nothing to do.');
    process.exit(0);
  }

  console.log('⚠️  sale_items is MISSING. Creating it now...');

  try {
    await db.schema.createTable('sale_items', (table) => {
      table.uuid('id').primary();
      table.uuid('sale_id').references('id').inTable('sales').onDelete('CASCADE').notNullable();
      table.uuid('product_id').references('id').inTable('products').onDelete('SET NULL');
      table.string('product_name').notNullable();
      table.decimal('quantity', 14, 3).notNullable();
      table.decimal('unit_price', 14, 2).notNullable();
      table.decimal('unit_cost', 14, 2).defaultTo(0);
      table.decimal('total', 14, 2).notNullable();
      table.timestamp('created_at').defaultTo(db.fn.now());
    });

    console.log('✅ sale_items table created successfully!\n');

    // Verify
    const count = await db('sale_items').count('* as c').first();
    console.log(`📊 sale_items rows: ${count.c}`);
    console.log('\n🎉 Fix complete — sales CRUD should now work on production.\n');

  } catch (e) {
    console.error('❌ Failed to create table:', e.message);
    process.exit(1);
  }

  process.exit(0);
}

fix();
