const { db } = require('../config/database');
const fs = require('fs');
const path = require('path');

async function seed() {
  try {
    const hasProducts = await db.schema.hasTable('products');
    if (!hasProducts) {
      console.log('No existing schema found. Fresh database.');
      return process.exit(0);
    }

    const hasMigrationsTable = await db.schema.hasTable('knex_migrations');
    let needsSeed = false;

    if (!hasMigrationsTable) {
      needsSeed = true;
      // Knex hasn't created it yet. Let's create it.
      await db.schema.createTable('knex_migrations', t => {
        t.increments('id').primary();
        t.string('name');
        t.integer('batch');
        t.timestamp('migration_time');
      });
      await db.schema.createTable('knex_migrations_lock', t => {
        t.increments('index').primary();
        t.integer('is_locked');
      });
      await db('knex_migrations_lock').insert({ is_locked: 0 });
    } else {
      const count = await db('knex_migrations').count('* as c').first();
      if (parseInt(count.c) === 0) {
        needsSeed = true;
      }
    }

    if (needsSeed) {
      console.log('knex_migrations is empty but schema exists. Seeding legacy migrations...');
      
      const files = fs.readdirSync(path.join(__dirname, '../migrations'))
        .filter(f => f.endsWith('.js'))
        .sort();

      // We assume all migrations BEFORE our recent fixes (20260530*) were already applied
      const legacyFiles = files.filter(f => !f.startsWith('20260530'));
      
      const toInsert = legacyFiles.map(f => ({
        name: f,
        batch: 1,
        migration_time: new Date()
      }));

      if (toInsert.length > 0) {
        await db('knex_migrations').insert(toInsert);
        console.log(`Seeded ${toInsert.length} legacy migrations.`);
      }
    } else {
      console.log('knex_migrations already populated. Skipping seed.');
    }
  } catch (e) {
    console.error('Error seeding migrations:', e.message);
  }
  process.exit(0);
}

seed();
