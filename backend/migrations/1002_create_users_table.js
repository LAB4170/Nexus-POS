/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  if (!(await knex.schema.hasTable('users'))) {
    await knex.schema.createTable('users', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('firebase_uid').notNullable().unique();
      table.string('email').notNullable().unique();
      table.string('display_name');
      table.string('role').defaultTo('user'); // 'admin', 'user'
      table.boolean('is_active').defaultTo(true);
      table.timestamps(true, true);
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('users');
};
