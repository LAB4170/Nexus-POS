/**
 * Safety net: ensure missing columns from partially failed batch migrations exist.
 * The original migrations were tracked as complete on Neon but columns were missing.
 */
exports.up = async function(knex) {
  const hasTotalCogs = await knex.schema.hasColumn('sales', 'total_cogs');
  if (!hasTotalCogs) {
    await knex.schema.alterTable('sales', t => {
      t.decimal('total_cogs', 14, 2).defaultTo(0).notNullable();
    });
    console.log('✅ sales.total_cogs safety-net created.');
  } else {
    console.log('✅ sales.total_cogs already exists.');
  }

  const hasUnitCost = await knex.schema.hasColumn('products', 'unit_cost');
  if (!hasUnitCost) {
    await knex.schema.alterTable('products', t => {
      t.decimal('unit_cost', 14, 2).defaultTo(0);
    });
    console.log('✅ products.unit_cost safety-net created.');
  } else {
    console.log('✅ products.unit_cost already exists.');
  }
};

exports.down = async function(knex) {
  // Do not drop these critical data columns
};
