/**
 * Safety net: ensure sales columns are nullable from the failed multi-item migration.
 */
exports.up = async function(knex) {
  await knex.schema.alterTable('sales', (table) => {
    table.uuid('product_id').nullable().alter();
    table.string('product_name').nullable().alter();
    table.decimal('quantity', 14, 3).nullable().alter();
    table.decimal('unit_price', 14, 2).nullable().alter();
    table.decimal('unit_cost', 14, 2).nullable().alter();
  });
  console.log('✅ sales legacy columns made nullable.');
};

exports.down = async function(knex) {
};
