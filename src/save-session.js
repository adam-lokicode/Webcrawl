const { chromium } = require('playwright');
const fs = require('fs');

async function saveSession() {
    console.log('🔐 Starting session save process...');
    
    const browser = await chromium.launch({ 
        headless: false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
        ]
    });
    
    const context = await browser.newContext();
    const page = await context.newPage();
    
    try {
        console.log('🌐 Opening Stanford Alumni Directory...');
        await page.goto('https://alumnidirectory.stanford.edu/', {
            waitUntil: 'networkidle',
            timeout: 60000
        });
        
        console.log('\n📋 INSTRUCTIONS:');
        console.log('1. 🔐 Log in with your Stanford credentials');
        console.log('2. 🎯 Navigate to the alumni directory');
        console.log('3. ✅ Make sure you can see alumni cards/profiles');
        console.log('4. 📝 Once logged in and you see alumni data, press Enter below');
        console.log('\n⏰ Take your time - the browser will stay open until you press Enter');
        
        console.log('\n⏸️ Press Enter here when you are fully logged in and can see alumni profiles...');
        
        // Wait indefinitely for user input
        await new Promise(resolve => {
            process.stdin.once('data', resolve);
        });
        
        console.log('💾 Saving session...');
        
        // Wait a moment for any final page loads
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Check current URL to make sure we're in the right place
        const currentUrl = page.url();
        console.log(`🔗 Current URL: ${currentUrl}`);
        
        if (currentUrl.includes('/auth') || currentUrl.includes('/login') || currentUrl.includes('/signin') || currentUrl.includes('pass.stanford.edu')) {
            console.log('⚠️ Warning: You appear to still be on a login page');
            console.log('Make sure you are fully logged in before saving the session');
            
            console.log('\nDo you want to save the session anyway? (y/n)');
            const answer = await new Promise(resolve => {
                process.stdin.once('data', (data) => {
                    resolve(data.toString().trim().toLowerCase());
                });
            });
            
            if (answer !== 'y' && answer !== 'yes') {
                console.log('❌ Session save cancelled');
                await browser.close();
                return;
            }
        }
        
        // Save the session
        const sessionData = {
            cookies: await context.cookies(),
            timestamp: new Date().toISOString(),
            url: currentUrl
        };
        
        fs.writeFileSync('auth-session.json', JSON.stringify(sessionData, null, 2));
        
        console.log('✅ Session saved successfully!');
        console.log(`📄 Saved ${sessionData.cookies.length} cookies`);
        console.log(`🕐 Session saved at: ${sessionData.timestamp}`);
        
        console.log('\n🎉 You can now run: npm run crawl');
        
        // Keep browser open for a few more seconds
        console.log('\n⏸️ Browser will close in 5 seconds...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
    } catch (error) {
        console.error('❌ Error saving session:', error.message);
        console.log('\n⏸️ Browser will stay open for 30 seconds for debugging...');
        await new Promise(resolve => setTimeout(resolve, 30000));
    } finally {
        await browser.close();
        console.log('🔒 Browser closed');
    }
}

saveSession().catch(console.error); 