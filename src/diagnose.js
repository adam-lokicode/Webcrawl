const { chromium } = require('playwright');

async function diagnose() {
    console.log('🔍 Running browser diagnostics...\n');
    
    try {
        console.log('1. Testing basic browser launch...');
        const browser = await chromium.launch({ 
            headless: false,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        });
        console.log('✅ Browser launched successfully');
        
        console.log('2. Testing page creation...');
        const context = await browser.newContext();
        const page = await context.newPage();
        console.log('✅ Page created successfully');
        
        console.log('3. Testing basic navigation...');
        await page.goto('https://www.google.com', { timeout: 10000 });
        console.log('✅ Navigation successful');
        
        console.log('4. Testing page title...');
        const title = await page.title();
        console.log(`✅ Page title: ${title}`);
        
        console.log('5. Testing Stanford Alumni Directory...');
        try {
            await page.goto('https://alumnidirectory.stanford.edu/', { timeout: 15000 });
            console.log('✅ Stanford Alumni Directory accessible');
            
            const currentUrl = page.url();
            console.log(`🔗 Current URL: ${currentUrl}`);
            
            if (currentUrl.includes('/auth')) {
                console.log('ℹ️ Redirected to auth page (normal if not logged in)');
            }
        } catch (error) {
            console.log('⚠️ Stanford Alumni Directory navigation failed:', error.message);
        }
        
        console.log('\n✅ All basic tests passed!');
        console.log('Press Enter to close browser...');
        
        await new Promise(resolve => {
            process.stdin.once('data', resolve);
        });
        
        await browser.close();
        console.log('✅ Browser closed cleanly');
        
    } catch (error) {
        console.error('❌ Diagnostic failed:', error.message);
        console.error('Stack trace:', error.stack);
        
        // Try to provide specific solutions
        if (error.message.includes('browserType.launch')) {
            console.log('\n🔧 Possible solutions:');
            console.log('1. Install Playwright browsers: npm run install-browsers');
            console.log('2. Check if you have enough disk space');
            console.log('3. Try running with sudo (if on Linux)');
        }
        
        if (error.message.includes('timeout')) {
            console.log('\n🔧 Possible solutions:');
            console.log('1. Check your internet connection');
            console.log('2. Try running the script again');
            console.log('3. Check if a firewall is blocking the connection');
        }
        
        if (error.message.includes('ECONNREFUSED') || error.message.includes('net::ERR_')) {
            console.log('\n🔧 Possible solutions:');
            console.log('1. Check your internet connection');
            console.log('2. Try using a VPN if Stanford site is blocked');
            console.log('3. Check if your firewall is blocking connections');
        }
    }
}

diagnose().catch(console.error); 