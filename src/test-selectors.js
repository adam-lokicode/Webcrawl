const { chromium } = require('playwright');
require('dotenv').config();

/**
 * Test script to help identify correct CSS selectors for the Stanford Alumni Directory
 * This script will help you find the right selectors for login forms and data extraction
 */
async function testSelectors() {
    const browser = await chromium.launch({ headless: false, slowMo: 1000 });
    const page = await browser.newPage();
    
    try {
        console.log('🔍 Testing selectors for Stanford Alumni Directory...\n');
        
        // Navigate to the site
        await page.goto('https://alumnidirectory.stanford.edu/', {
            waitUntil: 'networkidle',
            timeout: 30000
        });
        
        console.log('📄 Current page URL:', page.url());
        console.log('📄 Page title:', await page.title());
        
        // Test login form selectors
        console.log('\n🔐 Testing login form selectors...');
        
        const loginSelectors = [
            'input[type="email"]',
            'input[name="username"]',
            'input[id="username"]',
            'input[name="email"]',
            'input[id="email"]',
            'input[placeholder*="email"]',
            'input[placeholder*="username"]'
        ];
        
        for (const selector of loginSelectors) {
            try {
                const element = await page.$(selector);
                if (element) {
                    console.log(`✅ Found username/email field: ${selector}`);
                    const placeholder = await element.getAttribute('placeholder');
                    const name = await element.getAttribute('name');
                    const id = await element.getAttribute('id');
                    console.log(`   - placeholder: ${placeholder}`);
                    console.log(`   - name: ${name}`);
                    console.log(`   - id: ${id}`);
                }
            } catch (e) {
                // Element not found
            }
        }
        
        // Test password field
        console.log('\n🔑 Testing password field...');
        const passwordField = await page.$('input[type="password"]');
        if (passwordField) {
            console.log('✅ Found password field');
            const placeholder = await passwordField.getAttribute('placeholder');
            const name = await passwordField.getAttribute('name');
            const id = await passwordField.getAttribute('id');
            console.log(`   - placeholder: ${placeholder}`);
            console.log(`   - name: ${name}`);
            console.log(`   - id: ${id}`);
        } else {
            console.log('❌ No password field found');
        }
        
        // Test login button
        console.log('\n🔘 Testing login button...');
        const loginButtonSelectors = [
            'button[type="submit"]',
            'input[type="submit"]',
            '.login-button',
            '#login-button',
            'button:contains("Login")',
            'button:contains("Sign In")',
            'input[value*="Login"]',
            'input[value*="Sign"]'
        ];
        
        for (const selector of loginButtonSelectors) {
            try {
                const element = await page.$(selector);
                if (element) {
                    console.log(`✅ Found login button: ${selector}`);
                    const text = await element.textContent();
                    const value = await element.getAttribute('value');
                    console.log(`   - text: ${text}`);
                    console.log(`   - value: ${value}`);
                }
            } catch (e) {
                // Element not found
            }
        }
        
        // Test search form selectors
        console.log('\n🔍 Testing search form selectors...');
        
        const searchSelectors = [
            'input[name="name"]',
            'input[id="name"]',
            'input[placeholder*="name"]',
            'input[name="year"]',
            'input[id="year"]',
            'select[name="year"]',
            'input[name="degree"]',
            'input[id="degree"]',
            'input[name="major"]',
            'input[id="major"]'
        ];
        
        for (const selector of searchSelectors) {
            try {
                const element = await page.$(selector);
                if (element) {
                    console.log(`✅ Found search field: ${selector}`);
                    const placeholder = await element.getAttribute('placeholder');
                    const name = await element.getAttribute('name');
                    const id = await element.getAttribute('id');
                    console.log(`   - placeholder: ${placeholder}`);
                    console.log(`   - name: ${name}`);
                    console.log(`   - id: ${id}`);
                }
            } catch (e) {
                // Element not found
            }
        }
        
        // Test search button
        console.log('\n🔘 Testing search button...');
        const searchButtonSelectors = [
            'button[type="submit"]',
            'input[type="submit"]',
            '.search-button',
            '#search-button',
            'button:contains("Search")',
            'input[value*="Search"]'
        ];
        
        for (const selector of searchButtonSelectors) {
            try {
                const element = await page.$(selector);
                if (element) {
                    console.log(`✅ Found search button: ${selector}`);
                    const text = await element.textContent();
                    const value = await element.getAttribute('value');
                    console.log(`   - text: ${text}`);
                    console.log(`   - value: ${value}`);
                }
            } catch (e) {
                // Element not found
            }
        }
        
        // Test result selectors
        console.log('\n📊 Testing result selectors...');
        
        const resultSelectors = [
            '.alumni-result',
            '.search-result',
            '.profile-card',
            'tr[data-alumni]',
            '.result-item',
            '.alumni-item',
            '.profile-item'
        ];
        
        for (const selector of resultSelectors) {
            try {
                const elements = await page.$$(selector);
                if (elements.length > 0) {
                    console.log(`✅ Found ${elements.length} result elements: ${selector}`);
                }
            } catch (e) {
                // Element not found
            }
        }
        
        console.log('\n📋 Selector testing completed!');
        console.log('💡 Use this information to update the selectors in src/crawler.js');
        
        // Keep browser open for manual inspection
        console.log('\n🔍 Browser will remain open for 30 seconds for manual inspection...');
        await new Promise(resolve => setTimeout(resolve, 30000));
        
    } catch (error) {
        console.error('❌ Error during selector testing:', error.message);
    } finally {
        await browser.close();
    }
}

// Run the test if this file is executed directly
if (require.main === module) {
    testSelectors().catch(console.error);
}

module.exports = { testSelectors }; 