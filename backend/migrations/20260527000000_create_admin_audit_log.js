exports.up = async function(knex) {
  const exists = await knex.schema.hasTable('admin_audit_log');
  if (!exists) {
    await knex.schema.createTable('admin_audit_log', (table) => {
      table.increments('id').primary();
      table.string('action', 100).notNullable();
      table.uuid('target_business_id').references('id').inTable('businesses').onDelete('SET NULL').nullable();
      table.string('admin_identifier', 255).defaultTo('system');
      table.string('ip_address', 45).nullable();
      table.jsonb('metadata').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }
};

exports.down = async function(knex) {
  const exists = await knex.schema.hasTable('admin_audit_log');
  if (exists) {
    await knex.schema.dropTable('admin_audit_log');
  }
};
