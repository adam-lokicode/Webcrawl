const { chromium } = require('playwright');
const fs = require('fs');

async function debugEmailExtraction() {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    
    // Load saved session
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
        console.log('🔍 Navigating to Stanford Alumni Directory...');
        await page.goto('https://alumnidirectory.stanford.edu/');
        
        // Wait for alumni cards to load
        await page.waitForSelector('div.flex.flex-col.break-words.text-saa-black.border.border-black-10.shadow-sm', { timeout: 10000 });
        
        const alumniCards = await page.$$('div.flex.flex-col.break-words.text-saa-black.border.border-black-10.shadow-sm');
        console.log(`📋 Found ${alumniCards.length} alumni cards`);
        
        if (alumniCards.length > 0) {
            console.log('\n🔍 Inspecting first alumni card...');
            const firstCard = alumniCards[0];
            
            // Extract name first
            const name = await firstCard.$eval('h3, strong', el => el.textContent.trim()).catch(() => 'Unknown');
            console.log(`👤 Name: ${name}`);
            
            // Get the full HTML of the card to inspect
            const cardHTML = await firstCard.innerHTML();
            console.log('\n📄 Card HTML structure:');
            console.log(cardHTML);
            
            // Try different email selectors and see what we find
            const emailSelectors = [
                'ul[data-test="profile-summary-email-items"] a[href^="mailto:"]',
                'a[href^="mailto:"]',
                'a[href*="@"]',
                '[href*="@"]',
                'span:has-text("@")',
                'div:has-text("@")'
            ];
            
            console.log('\n📧 Testing email selectors:');
            for (const selector of emailSelectors) {
                try {
                    const emails = await firstCard.$$eval(selector, els => els.map(e => ({
                        text: e.textContent.trim(),
                        href: e.getAttribute('href')
                    })));
                    
                    if (emails.length > 0) {
                        console.log(`✅ Selector "${selector}" found ${emails.length} emails:`);
                        emails.forEach(email => console.log(`   - ${email.text} (href: ${email.href})`));
                    } else {
                        console.log(`❌ Selector "${selector}" found no emails`);
                    }
                } catch (error) {
                    console.log(`❌ Selector "${selector}" failed: ${error.message}`);
                }
            }
            
            // Look for any text containing @ symbol
            console.log('\n🔍 Looking for any text containing "@" symbol:');
            try {
                const allText = await firstCard.evaluate(el => {
                    const walker = document.createTreeWalker(
                        el,
                        NodeFilter.SHOW_TEXT,
                        null,
                        false
                    );
                    
                    const textNodes = [];
                    let node;
                    while (node = walker.nextNode()) {
                        if (node.textContent.includes('@')) {
                            textNodes.push(node.textContent.trim());
                        }
                    }
                    return textNodes;
                });
                
                if (allText.length > 0) {
                    console.log('📧 Found text containing "@":');
                    allText.forEach(text => console.log(`   - ${text}`));
                } else {
                    console.log('❌ No text containing "@" found');
                }
            } catch (error) {
                console.log('❌ Failed to search for "@" text:', error.message);
            }
        }
        
        console.log('\n⏸️ Browser will stay open for manual inspection. Press Enter to close...');
        await new Promise(resolve => {
            process.stdin.once('data', resolve);
        });
        
    } catch (error) {
        console.error('❌ Error during debugging:', error.message);
    } finally {
        await browser.close();
    }
}

debugEmailExtraction().catch(console.error); 