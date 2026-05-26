exports.up = async function(knex) {
  const hasTotalCogs = await knex.schema.hasColumn('sales', 'total_cogs');
  if (!hasTotalCogs) {
    await knex.schema.alterTable('sales', function(table) {
      table.decimal('total_cogs', 14, 2).defaultTo(0).notNullable();
    });
  }
};

exports.down = async function(knex) {
  const hasTotalCogs = await knex.schema.hasColumn('sales', 'total_cogs');
  if (hasTotalCogs) {
    await knex.schema.alterTable('sales', function(table) {
      table.dropColumn('total_cogs');
    });
  }
};
