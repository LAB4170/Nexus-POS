/**
 * Production Database Health Check Script
 * Run this LOCALLY pointing at the production (Neon) DB
 * Usage: DATABASE_URL="your-neon-url" node scripts/prod_health_check.js
 */

const knex = require('knex');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const DB_URL = process.env.DATABASE_URL;

if (!DB_URL) {
  console.error('❌ DATABASE_URL is not set. Set it in .env or pass as env var.');
  process.exit(1);
}

const db = knex({
  client: 'postgresql',
  connection: {
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false }
  },
  pool: { min: 1, max: 2 }
});

async function main() {
  console.log('\n========== NEXUS POS PRODUCTION DB HEALTH CHECK ==========\n');

  // 1. Connectivity
  try {
    await db.raw('SELECT 1');
    console.log('✅ Database is reachable\n');
  } catch (e) {
    console.error('❌ CANNOT CONNECT TO DATABASE:', e.message);
    process.exit(1);
  }

  // 2. Tables present
  const requiredTables = ['products', 'sales', 'sale_items', 'expenses', 'debts', 'businesses', 'knex_migrations'];
  console.log('--- Table Existence ---');
  for (const t of requiredTables) {
    const exists = await db.schema.hasTable(t);
    console.log(`  ${exists ? '✅' : '❌'} ${t}`);
  }

  // 3. Migration tracking
  console.log('\n--- Knex Migration Tracking ---');
  try {
    const migrations = await db('knex_migrations').select('name', 'batch').orderBy('id');
    if (migrations.length === 0) {
      console.log('  ⚠️  knex_migrations is EMPTY - Knex has never tracked migrations on this DB');
    } else {
      console.log(`  ✅ ${migrations.length} migrations tracked:`);
      migrations.forEach(m => console.log(`     [batch ${m.batch}] ${m.name}`));
    }
  } catch (e) {
    console.log('  ❌ knex_migrations table does NOT exist:', e.message);
  }

  // 4. Businesses
  console.log('\n--- Businesses ---');
  try {
    const bizList = await db('businesses').select('id', 'name', 'owner_email', 'subscription_status', 'is_suspended').catch(() => null);
    if (!bizList) {
      console.log('  ❌ Could not query businesses (column missing?)');
    } else {
      console.log(`  ${bizList.length} businesses found:`);
      bizList.forEach(b => console.log(`    - ${b.name} (${b.owner_email}) | status=${b.subscription_status} | suspended=${b.is_suspended}`));
    }
  } catch (e) {
    console.log('  ❌ Error querying businesses:', e.message);
  }

  // 5. Row counts
  console.log('\n--- Data Counts ---');
  const countTables = ['products', 'sales', 'sale_items', 'expenses', 'debts'];
  for (const t of countTables) {
    try {
      const [{ count }] = await db(t).count('* as count');
      console.log(`  ${t}: ${count} rows`);
    } catch (e) {
      console.log(`  ${t}: ❌ ERROR - ${e.message}`);
    }
  }

  // 6. RLS Check
  console.log('\n--- Row-Level Security (RLS) Status ---');
  try {
    const rls = await db.raw(`
      SELECT tablename, rowsecurity 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename IN ('products', 'sales', 'expenses', 'debts')
      ORDER BY tablename
    `);
    rls.rows.forEach(r => {
      console.log(`  ${r.tablename}: RLS ${r.rowsecurity ? '🔴 ENABLED (DANGER - causes 500s)' : '✅ disabled'}`);
    });
  } catch (e) {
    console.log('  ❌ Could not check RLS:', e.message);
  }

  // 7. Businesses columns
  console.log('\n--- Businesses Table Columns ---');
  try {
    const cols = await db.raw(`SELECT column_name FROM information_schema.columns WHERE table_name='businesses' ORDER BY ordinal_position`);
    console.log(' ', cols.rows.map(r => r.column_name).join(', '));
  } catch (e) {
    console.log('  ❌ Error:', e.message);
  }

  console.log('\n========== HEALTH CHECK COMPLETE ==========\n');
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
