/**
 * Add is_suspended and is_active flags to businesses table.
 * These are needed by auth middleware to gate suspended accounts.
 */
exports.up = async function(knex) {
  const hasSuspended = await knex.schema.hasColumn('businesses', 'is_suspended');
  if (!hasSuspended) {
    await knex.schema.alterTable('businesses', table => {
      table.boolean('is_suspended').defaultTo(false).notNullable();
    });
  }

  const hasActive = await knex.schema.hasColumn('businesses', 'is_active');
  if (!hasActive) {
    await knex.schema.alterTable('businesses', table => {
      table.boolean('is_active').defaultTo(true).notNullable();
    });
  }
};

exports.down = async function(knex) {
  const hasSuspended = await knex.schema.hasColumn('businesses', 'is_suspended');
  if (hasSuspended) {
    await knex.schema.alterTable('businesses', table => {
      table.dropColumn('is_suspended');
    });
  }
  const hasActive = await knex.schema.hasColumn('businesses', 'is_active');
  if (hasActive) {
    await knex.schema.alterTable('businesses', table => {
      table.dropColumn('is_active');
    });
  }
};
