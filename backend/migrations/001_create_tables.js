/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  if (!(await knex.schema.hasTable('products'))) {
    await knex.schema.createTable('products', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('name').notNullable();
      table.string('category').notNullable();
      table.decimal('price', 10, 2).notNullable();
      table.integer('stock_quantity').defaultTo(0);
      table.decimal('cost_price', 10, 2);
      table.integer('min_stock').defaultTo(0);
      table.boolean('is_active').defaultTo(true);
      table.timestamps(true, true);
    });
  }

  if (!(await knex.schema.hasTable('sales'))) {
    await knex.schema.createTable('sales', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('product_id').references('id').inTable('products').onDelete('CASCADE');
      table.string('product_name').notNullable();
      table.integer('quantity').notNullable();
      table.decimal('unit_price', 10, 2).notNullable();
      table.decimal('total', 10, 2).notNullable();
      table.string('payment_method').notNullable();
      table.string('customer_name');
      table.string('customer_phone');
      table.string('mpesa_code');
      table.string('status').defaultTo('completed');
      table.text('notes');
      table.date('date').defaultTo(knex.raw('CURRENT_DATE'));
      table.string('created_by').defaultTo('system');
      table.timestamps(true, true);
    });
  }

  if (!(await knex.schema.hasTable('expenses'))) {
    await knex.schema.createTable('expenses', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('description').notNullable();
      table.string('category').notNullable();
      table.decimal('amount', 10, 2).notNullable();
      table.string('created_by').defaultTo('system');
      table.timestamps(true, true);
    });
  }

  if (!(await knex.schema.hasTable('debts'))) {
    await knex.schema.createTable('debts', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('customer_name').notNullable();
      table.string('customer_phone');
      table.decimal('amount', 10, 2).notNullable();
      table.decimal('amount_paid', 10, 2).defaultTo(0);
      table.decimal('balance', 10, 2).notNullable();
      table.string('status').defaultTo('pending');
      table.date('due_date');
      table.text('notes');
      table.uuid('sale_id').references('id').inTable('sales').onDelete('SET NULL');
      table.string('created_by').defaultTo('system');
      table.timestamps(true, true);
    });
  }

  if (!(await knex.schema.hasTable('debt_payments'))) {
    await knex.schema.createTable('debt_payments', function(table) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('debt_id').references('id').inTable('debts').onDelete('CASCADE');
      table.decimal('amount', 10, 2).notNullable();
      table.string('payment_method').notNullable();
      table.string('mpesa_code');
      table.text('notes');
      table.string('created_by').defaultTo('system');
      table.timestamps(true, true);
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('debt_payments')
    .dropTableIfExists('debts')
    .dropTableIfExists('expenses')
    .dropTableIfExists('sales')
    .dropTableIfExists('products');
};
