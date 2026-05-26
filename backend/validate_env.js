// validate_env.js
// Simple script to verify that all required environment variables are present and not empty.
// It reads the .env file at the project root and prints a concise report.

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const required = [
  'DB_HOST',
  'DB_PORT',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  // Optional but common in this project
  'FIREBASE_ADMIN_SDK',
  'REDIS_URL',
];

let missing = [];
required.forEach((key) => {
  if (!process.env[key] || process.env[key].trim() === '') {
    missing.push(key);
  }
});

if (missing.length === 0) {
  console.log('✅ All required environment variables are set.');
  process.exit(0);
} else {
  console.error('❌ Missing environment variables:');
  missing.forEach((k) => console.error('   -', k));
  process.exit(1);
}
