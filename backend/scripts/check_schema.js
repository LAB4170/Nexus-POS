const { db } = require('../config/database');

async function check() {
  try {
    const cols = await db.raw(`SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name='businesses' ORDER BY ordinal_position`);
    console.log('\n[businesses columns]:');
    cols.rows.forEach(r => console.log(`  ${r.column_name} (${r.data_type}) default=${r.column_default}`));
  } catch (e) {
    console.error('ERROR:', e.message);
  }
  process.exit(0);
}

check();
