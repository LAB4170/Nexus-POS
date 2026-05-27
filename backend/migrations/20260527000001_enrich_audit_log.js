exports.up = async function(knex) {
  const hasAdminUid = await knex.schema.hasColumn('admin_audit_log', 'admin_uid');
  const hasUserAgent = await knex.schema.hasColumn('admin_audit_log', 'user_agent');

  await knex.schema.alterTable('admin_audit_log', function(table) {
    if (!hasAdminUid) {
      table.string('admin_uid').nullable();
    }
    if (!hasUserAgent) {
      table.text('user_agent').nullable();
    }
  });
};

exports.down = async function(knex) {
  const hasAdminUid = await knex.schema.hasColumn('admin_audit_log', 'admin_uid');
  const hasUserAgent = await knex.schema.hasColumn('admin_audit_log', 'user_agent');

  await knex.schema.alterTable('admin_audit_log', function(table) {
    if (hasAdminUid) {
      table.dropColumn('admin_uid');
    }
    if (hasUserAgent) {
      table.dropColumn('user_agent');
    }
  });
};
