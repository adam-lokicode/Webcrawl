const { chromium } = require('playwright');
const fs = require('fs');

async function checkSession() {
    if (!fs.existsSync('auth-session.json')) {
        console.log('❌ No saved session found');
        console.log('📝 Run: npm run save-session');
        return;
    }

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    
    try {
        const sessionData = JSON.parse(fs.readFileSync('auth-session.json', 'utf8'));
        await context.addCookies(sessionData.cookies);
        console.log('✅ Loaded saved session');
    } catch (error) {
        console.error('❌ Failed to load session:', error.message);
        await browser.close();
        return;
    }
    
    const page = await context.newPage();
    
    try {
        console.log('🔍 Testing session validity...');
        await page.goto('https://alumnidirectory.stanford.edu/', {
            waitUntil: 'networkidle',
            timeout: 15000
        });
        
        // Wait for page to settle
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const currentUrl = page.url();
        console.log(`🔗 Current URL: ${currentUrl}`);
        
        if (currentUrl.includes('/auth') || currentUrl.includes('/login') || currentUrl.includes('/signin')) {
            console.log('❌ Session is invalid or expired');
            console.log('\n📝 To fix this:');
            console.log('1. Run: npm run save-session');
            console.log('2. Manually log in when the browser opens');
            console.log('3. Press Enter to save the session');
            console.log('4. Then run the crawler again');
        } else {
            console.log('✅ Session is valid!');
            
            // Try to find alumni cards
            const cardSelectors = [
                'div.flex.flex-col.break-words.text-saa-black.border.border-black-10.shadow-sm',
                'div[class*="flex"][class*="flex-col"]',
                '[data-test*="profile"]'
            ];
            
            let foundCards = false;
            for (const selector of cardSelectors) {
                try {
                    await page.waitForSelector(selector, { timeout: 3000 });
                    const cards = await page.$$(selector);
                    if (cards.length > 0) {
                        console.log(`✅ Found ${cards.length} alumni cards with selector: ${selector}`);
                        foundCards = true;
                        break;
                    }
                } catch (e) {
                    // Try next selector
                }
            }
            
            if (!foundCards) {
                console.log('⚠️ Session is valid but no alumni cards found');
                console.log('🔍 This might be normal if the page structure has changed');
            }
        }
        
        console.log('\n⏸️ Browser will stay open for inspection. Press Enter to close...');
        await new Promise(resolve => {
            process.stdin.once('data', resolve);
        });
        
    } catch (error) {
        console.error('❌ Error checking session:', error.message);
    } finally {
        await browser.close();
    }
}

checkSession().catch(console.error); 