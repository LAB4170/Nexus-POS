// init_database.js
// This script ensures the PostgreSQL database exists and runs Knex migrations.
// It reads connection parameters from the .env file at the project root.

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Client } = require('pg');
const { execSync } = require('child_process');

// Build connection config for the target database (or fallback to postgres db for creation)
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'EobordTech-POS',
};

async function ensureDatabase() {
  // Connect to the default postgres database to check/create the target DB
  const adminClient = new Client({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: 'postgres',
  });
  await adminClient.connect();
  const res = await adminClient.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [dbConfig.database]
  );
  if (res.rowCount === 0) {
    console.log(`Creating database \"${dbConfig.database}\"`);
    await adminClient.query(`CREATE DATABASE \"${dbConfig.database}\"`);
  } else {
    console.log(`Database \"${dbConfig.database}\" already exists`);
  }
  await adminClient.end();
}

async function runMigrations() {
  console.log('Running Knex migrations...');
  // Use knex CLI via npx to run migrations in the backend folder
  execSync('npx knex migrate:latest', { cwd: path.join(__dirname), stdio: 'inherit' });
}

(async () => {
  try {
    await ensureDatabase();
    await runMigrations();
    console.log('Database initialization complete.');
    process.exit(0);
  } catch (err) {
    console.error('Error during DB init:', err);
    process.exit(1);
  }
})();
