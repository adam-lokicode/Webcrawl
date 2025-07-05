const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
require('dotenv').config();

class StanfordAlumniCrawler {
    constructor() {
        this.browser = null;
        this.page = null;
        this.isLoggedIn = false;
        this.data = [];
        
        // Configuration
        this.config = {
            headless: process.env.HEADLESS === 'true',
            slowMo: parseInt(process.env.SLOW_MO) || 1000,
            timeout: parseInt(process.env.TIMEOUT) || 90000,
            maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
            outputDir: process.env.OUTPUT_DIR || './output',
            csvFilename: process.env.CSV_FILENAME || 'stanford_alumni_data.csv',
            sessionFile: 'auth-session.json'
        };
        
        // Ensure output directory exists
        if (!fs.existsSync(this.config.outputDir)) {
            fs.mkdirSync(this.config.outputDir, { recursive: true });
        }
    }

    async initialize() {
        console.log('🚀 Initializing Stanford Alumni Crawler...');
        
        this.browser = await chromium.launch({
            headless: this.config.headless,
            slowMo: this.config.slowMo
        });
        
        // Use saved session if available
        let context;
        if (fs.existsSync(this.config.sessionFile)) {
            context = await this.browser.newContext({ storageState: this.config.sessionFile });
            console.log('✅ Loaded session from auth-session.json');
            this.isLoggedIn = true;
        } else {
            context = await this.browser.newContext();
        }
        this.page = await context.newPage();
        
        // Set viewport and user agent
        await this.page.setViewportSize({ width: 1920, height: 1080 });
        await this.page.setExtraHTTPHeaders({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        
        console.log('✅ Browser initialized successfully');
    }

    async login() {
        // If using session, skip login
        if (fs.existsSync(this.config.sessionFile)) {
            console.log('✅ Using saved session, skipping login.');
            return;
        }
        
        console.log('🔐 Attempting to login to Stanford Alumni Directory...');
        
        try {
            // Start at the alumni directory to establish session and let it redirect
            await this.page.goto('https://alumnidirectory.stanford.edu/', {
                waitUntil: 'networkidle',
                timeout: 15000
            });
            
            // Wait for redirect to the login page and for the login form to appear
            // Print the page HTML for debugging
            const html = await this.page.content();
            console.log('--- PAGE HTML START ---');
            console.log(html);
            console.log('--- PAGE HTML END ---');

            await this.page.waitForSelector('input[id="userid"]', {
                timeout: 20000
            });
            await this.page.waitForSelector('input[id="password"]', {
                timeout: 20000
            });
            
            // Fill in credentials
            const username = process.env.STANFORD_USERNAME;
            const password = process.env.STANFORD_PASSWORD;
            
            if (!username || !password) {
                throw new Error('Missing credentials. Please set STANFORD_USERNAME and STANFORD_PASSWORD in your .env file');
            }
            
            // Fill username and password fields slowly to avoid bot detection
            await this.page.type('input[id="userid"]', username, { delay: 150 });
            await this.page.type('input[id="password"]', password, { delay: 150 });
            
            // Find and click login button
            const loginButton = await this.page.$('button[type="submit"]');
            if (!loginButton) {
                throw new Error('Could not find login button');
            }
            await loginButton.click();
            
            // Wait for navigation after login
            await this.page.waitForLoadState('networkidle');
            
            // Check if we're still on login page or if there's an error
            const currentUrl = this.page.url();
            if (currentUrl.includes('login') || currentUrl.includes('signin')) {
                // Check for error messages
                const errorElement = await this.page.$('.error, .alert, .error-message');
                if (errorElement) {
                    const errorText = await errorElement.textContent();
                    throw new Error(`Login failed: ${errorText}`);
                }
                throw new Error('Login failed: Still on login page');
            }
            
            this.isLoggedIn = true;
            console.log('✅ Successfully logged in to Stanford Alumni Directory');
            
        } catch (error) {
            console.error('❌ Login failed:', error.message);
            throw error;
        }
    }

    async searchAlumni(searchCriteria = {}) {
        if (!this.isLoggedIn) {
            throw new Error('Must be logged in to search alumni');
        }
        
        console.log('🔍 Searching for alumni...');
        
        try {
            // Navigate to the alumni directory homepage (not /search)
            await this.page.goto('https://alumnidirectory.stanford.edu/', {
                waitUntil: 'networkidle',
                timeout: this.config.timeout
            });
            
            // Optionally, fill in search criteria here if needed
            // ...
            
            console.log('✅ Search completed');
            
        } catch (error) {
            console.error('❌ Search failed:', error.message);
            throw error;
        }
    }

    async extractAlumniData() {
        console.log('📊 Extracting alumni data...');
        
        try {
            // Wait for alumni cards to load (no timeout - wait until user closes browser)
            await this.page.waitForSelector('div.flex.flex-col.break-words.text-saa-black.border.border-black-10.shadow-sm', {
                timeout: 0
            });
            
            // Extract data from alumni cards
            const alumniElements = await this.page.$$('div.flex.flex-col.break-words.text-saa-black.border.border-black-10.shadow-sm');
            
            for (const element of alumniElements) {
                try {
                    const alumniData = await this.extractAlumniFromElement(element);
                    if (alumniData) {
                        this.data.push(alumniData);
                    }
                } catch (error) {
                    console.warn('⚠️ Failed to extract data from one alumni element:', error.message);
                }
            }
            
            console.log(`✅ Extracted data for ${this.data.length} alumni`);
            
        } catch (error) {
            console.error('❌ Data extraction failed:', error.message);
            throw error;
        }
    }

    async extractAlumniFromElement(element) {
        try {
            // Extract name (h3 or strong inside the card)
            const name = await element.$eval('h3, strong', el => el.textContent.trim()).catch(() => 'N/A');
            // Extract degree/year (first div or span after name)
            const degree = await element.$eval('div, span', el => el.textContent.trim()).catch(() => 'N/A');
            // Extract current position (look for "Current position" or similar)
            const company = await element.$$eval('div, span', els => {
                const el = els.find(e => e.textContent && e.textContent.toLowerCase().includes('current position'));
                return el ? el.textContent.trim() : 'N/A';
            }).catch(() => 'N/A');
            
            // Improved: Extract emails with multiple attempts and debugging
            let emails = [];
            try {
                // First, try to expand the email section by clicking the email button
                const emailButton = await element.$('button[data-test="profile-summary-email"]');
                if (emailButton) {
                    console.log(`Clicking email button for ${name}...`);
                    await emailButton.click();
                    // Wait a moment for the email section to expand
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                
                // Now try to extract emails from the expanded section
                try {
                    const emailElements = await element.$$('ul[data-test="profile-summary-email-items"] a[href^="mailto:"]');
                    if (emailElements.length > 0) {
                        emails = await Promise.all(emailElements.map(async (el) => {
                            const href = await el.getAttribute('href');
                            // Extract email from href="mailto:email@domain.com"
                            return href ? href.replace('mailto:', '') : '';
                        }));
                        emails = emails.filter(email => email); // Remove empty emails
                        console.log(`Found ${emails.length} emails for ${name}: ${emails.join(', ')}`);
                    }
                } catch (e) {
                    console.warn(`Failed to extract emails for ${name}:`, e.message);
                }
                
                if (emails.length === 0) {
                    console.log(`No emails found for ${name} after expanding section`);
                }
                
            } catch (error) {
                console.warn(`Email extraction failed for ${name}:`, error.message);
            }
            
            const stanfordEmails = emails.filter(e => e.match(/@(alumni\.|gsb\.)?stanford\.edu$/i)).join(', ');
            const personalEmails = emails.filter(e => !e.match(/@(alumni\.|gsb\.)?stanford\.edu$/i)).join(', ');
            
            // Location and classYear may not be present, so set as N/A
            const location = 'N/A';
            const classYear = 'N/A';
            return {
                name,
                classYear,
                degree,
                location,
                company,
                stanfordEmail: stanfordEmails || 'N/A',
                personalEmail: personalEmails || 'N/A',
                extractedAt: new Date().toISOString()
            };
        } catch (error) {
            console.warn('⚠️ Failed to extract data from element:', error.message);
            return null;
        }
    }

    async saveToCSV(data = null) {
        const dataToSave = data || this.data;
        
        if (dataToSave.length === 0) {
            console.log('⚠️ No data to save');
            return;
        }
        
        console.log('💾 Saving data to CSV...');
        
        const csvWriter = createCsvWriter({
            path: path.join(this.config.outputDir, this.config.csvFilename),
            header: [
                { id: 'name', title: 'Name' },
                { id: 'classYear', title: 'Class Year' },
                { id: 'degree', title: 'Degree' },
                { id: 'location', title: 'Location' },
                { id: 'company', title: 'Company' },
                { id: 'stanfordEmail', title: 'Stanford Email' },
                { id: 'personalEmail', title: 'Personal Email' },
                { id: 'extractedAt', title: 'Extracted At' }
            ]
        });
        
        await csvWriter.writeRecords(dataToSave);
        console.log(`✅ Data saved to ${path.join(this.config.outputDir, this.config.csvFilename)}`);
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            console.log('🔒 Browser closed');
        }
    }

    async crawlAlumni() {
        // Initialize browser and context if not already done
        if (!this.browser) {
            await this.initialize();
        }
        
        const page = await this.browser.newContext({
            storageState: fs.existsSync(this.config.sessionFile) ? this.config.sessionFile : undefined
        }).then(context => context.newPage());
        
        try {
            console.log('🔍 Navigating to Stanford Alumni Directory...');
            await page.goto('https://alumnidirectory.stanford.edu/', {
                waitUntil: 'networkidle',
                timeout: 30000
            });
            
            console.log('⏳ Waiting for page to fully load...');
            
            // Wait a bit for the page to settle
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Check if we were redirected to auth page
            const currentUrl = page.url();
            console.log(`🔗 Current URL: ${currentUrl}`);
            
            if (currentUrl.includes('/auth') || currentUrl.includes('/login') || currentUrl.includes('/signin')) {
                console.log('🔐 Detected redirect to authentication page');
                console.log('❌ Your saved session has expired or is invalid');
                console.log('\n📝 To fix this:');
                console.log('1. Run: npm run save-session');
                console.log('2. Manually log in when the browser opens');
                console.log('3. Press Enter to save the session');
                console.log('4. Then run the crawler again');
                
                throw new Error('Session expired. Please run "npm run save-session" to create a new session.');
            }
            
            // Try multiple selectors to find alumni cards
            const cardSelectors = [
                'div.flex.flex-col.break-words.text-saa-black.border.border-black-10.shadow-sm',
                'div[class*="flex"][class*="flex-col"]',
                'div[class*="border"][class*="shadow"]',
                '[data-test*="profile"]',
                '.profile-card',
                '.alumni-card'
            ];
            
            let alumniCards = [];
            let foundSelector = null;
            
            for (const selector of cardSelectors) {
                try {
                    console.log(`🔍 Trying selector: ${selector}`);
                    await page.waitForSelector(selector, { timeout: 5000 });
                    alumniCards = await page.$$(selector);
                    if (alumniCards.length > 0) {
                        foundSelector = selector;
                        console.log(`✅ Found ${alumniCards.length} cards with selector: ${selector}`);
                        break;
                    }
                } catch (e) {
                    console.log(`❌ Selector "${selector}" not found`);
                }
            }
            
            if (alumniCards.length === 0) {
                console.log('🔍 No alumni cards found with standard selectors, checking page content...');
                
                // Debug: Check what's actually on the page
                const pageTitle = await page.title();
                console.log(`📄 Page title: ${pageTitle}`);
                
                // Check if we're on a login page or error page
                const bodyText = await page.evaluate(() => document.body.innerText).catch(() => 'Unable to get page text');
                console.log('📄 Page content preview:');
                console.log(bodyText.substring(0, 500) + '...');
                
                // Try to find any clickable elements or forms
                const forms = await page.$$('form').catch(() => []);
                const buttons = await page.$$('button').catch(() => []);
                const links = await page.$$('a').catch(() => []);
                
                console.log(`📋 Found ${forms.length} forms, ${buttons.length} buttons, ${links.length} links`);
                
                if (forms.length > 0) {
                    console.log('🔐 Detected forms on page - might need authentication');
                }
                
                throw new Error('No alumni cards found on the page. Please check if you need to login manually first.');
            }
            
            let allAlumniData = [];
            let currentPage = 1;
            const targetProfiles = 100;
            
            console.log(`🎯 Target: ${targetProfiles} profiles`);
            console.log(`📋 Starting with ${alumniCards.length} alumni cards on page ${currentPage}`);
            
            while (allAlumniData.length < targetProfiles) {
                console.log(`\n📄 Processing page ${currentPage}...`);
                
                // Scroll to load more content on current page
                await this.scrollToLoadContent(page);
                
                // Re-get alumni cards after scrolling (in case more loaded)
                alumniCards = await page.$$(foundSelector);
                console.log(`📋 Found ${alumniCards.length} alumni cards on page ${currentPage} after scrolling`);
                
                // Extract data from each card
                for (let i = 0; i < alumniCards.length && allAlumniData.length < targetProfiles; i++) {
                    const alumniData = await this.extractAlumniFromElement(alumniCards[i]);
                    if (alumniData) {
                        allAlumniData.push(alumniData);
                        console.log(`✅ Extracted ${allAlumniData.length}/${targetProfiles}: ${alumniData.name}`);
                    }
                    
                    // Small delay between extractions to avoid overwhelming the server
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                
                // Check if we have enough profiles
                if (allAlumniData.length >= targetProfiles) {
                    console.log(`🎉 Reached target of ${targetProfiles} profiles!`);
                    break;
                }
                
                // Try to navigate to next page
                const hasNextPage = await this.goToNextPage(page);
                if (!hasNextPage) {
                    console.log('📄 No more pages available');
                    break;
                }
                
                currentPage++;
                
                // Wait for new page to load with the same selector we found earlier
                try {
                    await page.waitForSelector(foundSelector, { timeout: 15000 });
                } catch (e) {
                    console.log('⚠️ Timeout waiting for new page content, continuing anyway...');
                }
            }
            
            console.log(`\n📊 Final Results: Collected ${allAlumniData.length} profiles`);
            
            // Save to CSV
            if (allAlumniData.length > 0) {
                await this.saveToCSV(allAlumniData);
                console.log('✅ Data saved to CSV successfully!');
            } else {
                console.log('❌ No alumni data collected');
            }
            
            console.log('\n⏸️ Browser will stay open for inspection. Press Enter to close...');
            await new Promise(resolve => {
                process.stdin.once('data', resolve);
            });
            
        } catch (error) {
            console.error('❌ Error during crawling:', error.message);
            console.log('\n🔍 Debug info:');
            console.log(`Current URL: ${page.url()}`);
            console.log(`Page title: ${await page.title().catch(() => 'Unable to get title')}`);
        } finally {
            await page.close();
        }
    }
    
    async scrollToLoadContent(page) {
        console.log('📜 Scrolling to load more content...');
        
        // Scroll to bottom of page to trigger any lazy loading
        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });
        
        // Wait for content to load
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Scroll back to top for easier navigation
        await page.evaluate(() => {
            window.scrollTo(0, 0);
        });
        
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    async goToNextPage(page) {
        try {
            // Look for pagination buttons - common selectors
            const nextButtonSelectors = [
                'button[aria-label="Next page"]',
                'button[aria-label="next"]',
                'a[aria-label="Next page"]',
                'a[aria-label="next"]',
                'button:has-text("Next")',
                'a:has-text("Next")',
                'button[data-testid="next-page"]',
                'a[data-testid="next-page"]',
                '.pagination button:last-child',
                '.pagination a:last-child'
            ];
            
            for (const selector of nextButtonSelectors) {
                try {
                    const nextButton = await page.$(selector);
                    if (nextButton) {
                        // Check if button is enabled/clickable
                        const isDisabled = await nextButton.evaluate(el => 
                            el.disabled || el.classList.contains('disabled') || el.getAttribute('aria-disabled') === 'true'
                        );
                        
                        if (!isDisabled) {
                            console.log(`🔄 Clicking next page button: ${selector}`);
                            await nextButton.click();
                            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for navigation
                            return true;
                        }
                    }
                } catch (e) {
                    // Try next selector
                }
            }
            
            // If no pagination buttons found, try scrolling to see if there's infinite scroll
            console.log('🔄 No pagination buttons found, trying infinite scroll...');
            const initialHeight = await page.evaluate(() => document.body.scrollHeight);
            
            // Scroll to bottom
            await page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight);
            });
            
            // Wait for potential new content
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            const newHeight = await page.evaluate(() => document.body.scrollHeight);
            
            if (newHeight > initialHeight) {
                console.log('📜 New content loaded via infinite scroll');
                return true;
            }
            
            return false;
            
        } catch (error) {
            console.warn('⚠️ Error navigating to next page:', error.message);
            return false;
        }
    }
}

module.exports = StanfordAlumniCrawler; 