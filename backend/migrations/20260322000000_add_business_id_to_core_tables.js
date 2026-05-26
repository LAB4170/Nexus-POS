/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // Add business_id column to core tables
  await knex.schema.alterTable('products', function (table) {
    table
      .uuid('business_id')
      .references('id')
      .inTable('businesses')
      .onDelete('CASCADE')
      .nullable();
  });

  await knex.schema.alterTable('sales', function (table) {
    table
      .uuid('business_id')
      .references('id')
      .inTable('businesses')
      .onDelete('CASCADE')
      .nullable();
  });

  await knex.schema.alterTable('expenses', function (table) {
    table
      .uuid('business_id')
      .references('id')
      .inTable('businesses')
      .onDelete('CASCADE')
      .nullable();
  });

  await knex.schema.alterTable('debts', function (table) {
    table
      .uuid('business_id')
      .references('id')
      .inTable('businesses')
      .onDelete('CASCADE')
      .nullable();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.alterTable('products', function (table) {
    table.dropColumn('business_id');
  });
  await knex.schema.alterTable('sales', function (table) {
    table.dropColumn('business_id');
  });
  await knex.schema.alterTable('expenses', function (table) {
    table.dropColumn('business_id');
  });
  await knex.schema.alterTable('debts', function (table) {
    table.dropColumn('business_id');
  });
};
