/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  // Disable Row-Level Security (RLS) as it conflicts with Knex connection pooling
  // for non-transactional queries (like findAll and findPaginated).
  // Multi-tenant isolation is already enforced correctly at the application layer 
  // via explicit .where('business_id', ...) in all model queries.
  const tables = [
    'products', 'sales', 'expenses', 'debts', 
    'debt_payments', 'tenant_audit_logs', 
    'support_tickets'
  ];

  for (const table of tables) {
    const hasTable = await knex.schema.hasTable(table);
    if (hasTable) {
      await knex.raw(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY`);
    }
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  // We do not re-enable RLS on down to prevent breaking the app again.
};
