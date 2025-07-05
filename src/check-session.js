const fs = require('fs');

const SESSION_FILE = 'auth-session.json';
const TARGET_DOMAIN = 'alumnidirectory.stanford.edu';

function checkSession() {
  if (!fs.existsSync(SESSION_FILE)) {
    console.error('❌ Session file not found:', SESSION_FILE);
    process.exit(1);
  }

  const session = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
  const cookies = session.cookies || [];

  // List all domains in the cookies
  const domains = [...new Set(cookies.map(c => c.domain))];
  console.log('Cookies found for domains:');
  domains.forEach(domain => console.log('  -', domain));

  // Check for the target domain
  const hasTarget = cookies.some(c => c.domain.includes(TARGET_DOMAIN));
  if (hasTarget) {
    console.log(`✅ Session contains cookies for ${TARGET_DOMAIN}.`);
    console.log('Your session is likely valid for crawling the alumni directory.');
  } else {
    console.log(`❌ No cookies found for ${TARGET_DOMAIN}.`);
    console.log('Your session is likely NOT valid for crawling the alumni directory.');
    console.log('Try logging in again and make sure you reach the alumni directory after login.');
  }
}

checkSession(); 