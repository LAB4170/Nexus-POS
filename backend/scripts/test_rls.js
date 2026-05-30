const { db } = require('../config/database');

async function check() {
  try {
    const businessId = 'f64e66ad-b096-4203-94c7-5c976e8ffab3';

    // DO NOT set the session variable. 
    // Just try to query sales.
    console.log('Testing sales query WITHOUT setting RLS session variable...');
    
    // We expect this to either throw an error OR return 0 rows.
    const sales = await db('sales as s').limit(1).select('*');
    
    console.log('SUCCESS. Total sales returned:', sales.length);

  } catch (e) {
    console.error('ERROR THROWN BY POSTGRES:');
    console.error(e.message);
  }
  process.exit(0);
}

check();
