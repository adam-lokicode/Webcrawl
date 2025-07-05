const { chromium } = require('playwright');
require('dotenv').config();

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 100 });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Go to the alumni directory (will redirect to login)
  await page.goto('https://alumnidirectory.stanford.edu/', { waitUntil: 'networkidle' });

  console.log('Please log in manually in the opened browser window.');
  console.log('When you are fully logged in and see the alumni directory, press Enter here to save your session.');

  // Wait for user to press Enter
  await new Promise(resolve => process.stdin.once('data', resolve));

  // Save storage state (cookies, local storage)
  await context.storageState({ path: 'auth-session.json' });
  console.log('Session saved to auth-session.json');

  await browser.close();
})(); 