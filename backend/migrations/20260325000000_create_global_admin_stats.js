// Migration to create global_admin_stats table
exports.up = async function(knex) {
  const exists = await knex.schema.hasTable('global_admin_stats');
  if (!exists) {
    return knex.schema.createTable('global_admin_stats', function(table) {
      table.increments('id').primary();
      table.integer('total_businesses').notNullable().defaultTo(0);
      table.decimal('retention_rate', 5, 2).notNullable().defaultTo(0.00);
      table.decimal('total_platform_revenue', 14, 2).notNullable().defaultTo(0.00);
      table.integer('total_platform_sales').notNullable().defaultTo(0);
      table.jsonb('data_payload');
      table.boolean('is_latest').defaultTo(false);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }
};

exports.down = async function(knex) {
  return knex.schema.dropTableIfExists('global_admin_stats');
};
