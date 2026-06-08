require('dotenv').config();
const { admin } = require('./config/firebase');

async function check() {
  try {
    const user = await admin.auth().getUserByEmail('eobordtech@gmail.com');
    console.log("CUSTOM CLAIMS:", user.customClaims);
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
check();
