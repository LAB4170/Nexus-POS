/**
 * Safety net: ensure sale_items table exists.
 * The original multi_item_baskets migration was tracked as complete on Neon
 * but the table was never actually created. This migration fixes that permanently.
 */
exports.up = async function(knex) {
  if (!(await knex.schema.hasTable('sale_items'))) {
    await knex.schema.createTable('sale_items', (table) => {
      table.uuid('id').primary();
      table.uuid('sale_id').references('id').inTable('sales').onDelete('CASCADE').notNullable();
      table.uuid('product_id').references('id').inTable('products').onDelete('SET NULL');
      table.string('product_name').notNullable();
      table.decimal('quantity', 14, 3).notNullable();
      table.decimal('unit_price', 14, 2).notNullable();
      table.decimal('unit_cost', 14, 2).defaultTo(0);
      table.decimal('total', 14, 2).notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
    console.log('✅ sale_items table created by safety-net migration.');
  } else {
    console.log('✅ sale_items already exists — skipped.');
  }
};

exports.down = async function(knex) {
  // Do not drop sale_items on rollback — it contains critical sales data
};
