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

    async extractAlumniFromElement(element, page) {
        try {
            // Extract name from the card first - try multiple selectors
            let name = 'N/A';
            const nameSelectors = [
                'h3 a',
                'h3',
                'strong',
                'a[data-test="personcard-link"]',
                '.personcard-name',
                '[data-test*="name"]'
            ];
            
            for (const selector of nameSelectors) {
                try {
                    const nameElement = await element.$(selector);
                    if (nameElement) {
                        const nameText = await nameElement.textContent();
                        if (nameText && nameText.trim() && nameText.trim() !== '') {
                            name = nameText.trim();
                            console.log(`Found name with selector "${selector}": ${name}`);
                            break;
                        }
                    }
                } catch (e) {
                    // Try next selector
                }
            }
            
            if (name === 'N/A' || name === '') {
                console.log(`❌ Could not extract name from element, trying text content...`);
                try {
                    const elementText = await element.textContent();
                    console.log(`Element text: ${elementText.substring(0, 200)}...`);
                    // Try to extract name from the first line of text
                    const lines = elementText.split('\n').filter(line => line.trim());
                    if (lines.length > 0) {
                        name = lines[0].trim();
                        console.log(`Extracted name from text: ${name}`);
                    }
                } catch (e) {
                    console.log(`Failed to get element text: ${e.message}`);
                }
            }
            
            console.log(`\n🔍 Processing profile for: ${name}`);
            
            // Try to find and click the profile link to get full details
            let profileLink = null;
            const profileLinkSelectors = [
                'a[data-test="personcard-link"]',
                'h3 a',
                'a[href*="/profile/"]',
                'a.stretched-link',
                'a',  // Fallback to any link
            ];
            
            for (const selector of profileLinkSelectors) {
                try {
                    const links = await element.$$(selector);
                    for (const link of links) {
                        const href = await link.getAttribute('href');
                        if (href && href.includes('/profile/')) {
                            profileLink = link;
                            console.log(`Found profile link with selector: ${selector} (${href})`);
                            break;
                        }
                    }
                    if (profileLink) break;
                } catch (e) {
                    // Try next selector
                }
            }
            
            if (!profileLink) {
                console.log(`❌ No profile link found for ${name}, trying alternative approach...`);
                
                // Try to find any clickable element that might lead to the profile
                try {
                    const allLinks = await element.$$('a');
                    for (const link of allLinks) {
                        const href = await link.getAttribute('href');
                        if (href && (href.includes('/profile/') || href.includes('stanford.edu'))) {
                            profileLink = link;
                            console.log(`Found alternative profile link: ${href}`);
                            break;
                        }
                    }
                } catch (e) {
                    console.log(`Alternative link search failed: ${e.message}`);
                }
                
                if (!profileLink) {
                    console.log(`❌ Still no profile link found for ${name}, skipping`);
                    return null;
                }
            }
            
            // Get the current page to navigate back to later
            const currentUrl = page.url();
            
            // Click the profile link to go to full profile
            console.log(`🔗 Clicking profile link for ${name}...`);
            await profileLink.click();
            
            // Wait for the profile page to load
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Now extract data from the full profile page
            const degree = await page.$eval('body', () => {
                // Look for degree information
                const degreePatterns = [
                    /MS\s*'?\d{2}/i,
                    /PhD\s*'?\d{2}/i,
                    /BA\s*'?\d{2}/i,
                    /BS\s*'?\d{2}/i,
                    /MBA\s*'?\d{2}/i
                ];
                
                const bodyText = document.body.textContent;
                for (const pattern of degreePatterns) {
                    const match = bodyText.match(pattern);
                    if (match) return match[0];
                }
                return 'N/A';
            }).catch(() => 'N/A');
            
            // Extract company/position
            const company = await page.$eval('body', () => {
                const bodyText = document.body.textContent;
                // Look for current position or company
                const lines = bodyText.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (line.toLowerCase().includes('current position') || 
                        line.toLowerCase().includes('primary') ||
                        line.toLowerCase().includes('employee')) {
                        // Return the next few lines that might contain the position
                        const nextLines = lines.slice(i+1, i+3).join(' ').trim();
                        if (nextLines && nextLines.length > 0) {
                            return nextLines;
                        }
                    }
                }
                return 'N/A';
            }).catch(() => 'N/A');
            
            // Extract emails from the full profile page
            let emails = [];
            let urls = [];
            try {
                console.log(`📧 Extracting emails and URLs from full profile for ${name}...`);
                
                // First try to expand email section if it exists
                const emailButtonSelectors = [
                    'button[data-test="profile-summary-email"]',
                    'button:has-text("Stanford & personal emails")',
                    'button:has-text("emails")',
                    '[aria-expanded="false"]:has-text("email")'
                ];
                
                for (const buttonSelector of emailButtonSelectors) {
                    try {
                        const emailButton = await page.$(buttonSelector);
                        if (emailButton) {
                            console.log(`Found and clicking email button: ${buttonSelector}`);
                            await emailButton.click();
                            await new Promise(resolve => setTimeout(resolve, 2000));
                            break;
                        }
                    } catch (e) {
                        // Try next selector
                    }
                }
                
                // Also try to expand URLs section if it exists
                console.log(`🔗 Looking for URLs section...`);
                const urlButtonSelectors = [
                    'button:has-text("URLs")',
                    'button:has-text("Website")',
                    'button:has-text("LinkedIn")',
                    '[aria-expanded="false"]:has-text("URL")',
                    'button[data-test*="url"]',
                    'button[data-test*="link"]'
                ];
                
                for (const buttonSelector of urlButtonSelectors) {
                    try {
                        const urlButton = await page.$(buttonSelector);
                        if (urlButton) {
                            console.log(`Found and clicking URL button: ${buttonSelector}`);
                            await urlButton.click();
                            await new Promise(resolve => setTimeout(resolve, 2000));
                            break;
                        }
                    } catch (e) {
                        // Try next selector
                    }
                }
                
                // Extract URLs
                console.log(`🔗 Extracting URLs...`);
                try {
                    // Look for website and LinkedIn URLs
                    const urlSelectors = [
                        'a[href*="linkedin.com"]',
                        'a[href*="www."]',
                        'a[href^="http"]',
                        'a[href^="https"]'
                    ];
                    
                    for (const selector of urlSelectors) {
                        const urlElements = await page.$$(selector);
                        for (const urlEl of urlElements) {
                            const href = await urlEl.getAttribute('href');
                            const text = await urlEl.textContent();
                            
                            if (href && (href.startsWith('http') || href.startsWith('www.'))) {
                                // Skip email links and internal Stanford links
                                if (!href.includes('mailto:') && 
                                    !href.includes('alumnidirectory.stanford.edu') &&
                                    !href.includes('stanford.edu/profile') &&
                                    !href.includes('stanford.edu/search') &&
                                    !href.includes('stanford.edu/site') &&
                                    !href.includes('myaccount.stanford.edu') &&
                                    !href.includes('alumni.stanford.edu') &&
                                    !href.includes('give.stanford.edu') &&
                                    !href.includes('gostanford.com') &&
                                    !href.includes('oval.stanford.edu') &&
                                    !href.includes('ed.stanford.edu') &&
                                    !href.includes('engineering.stanford.edu') &&
                                    !href.includes('humsci.stanford.edu') &&
                                    !href.includes('law.stanford.edu') &&
                                    !href.includes('medicine.stanford.edu') &&
                                    !href.includes('sustainability.stanford.edu') &&
                                    !href.includes('visit.stanford.edu') &&
                                    !href.includes('emergency.stanford.edu') &&
                                    !href.includes('uit.stanford.edu') &&
                                    !href.includes('adminguide.stanford.edu') &&
                                    !href.includes('non-discrimination.stanford.edu') &&
                                    !href.includes('honorrolls.stanford.edu') &&
                                    !href.includes('studentservices.stanford.edu') &&
                                    !href.includes('www.stanford.edu') &&
                                    !href.includes('gsb.stanford.edu')) {
                                    
                                    let urlType = 'Website';
                                    if (href.includes('linkedin.com')) {
                                        urlType = 'LinkedIn';
                                    }
                                    
                                    const urlEntry = `${urlType}: ${href}`;
                                    urls.push(urlEntry);
                                    console.log(`Found ${urlType}: ${href}`);
                                }
                            }
                        }
                    }
                    
                    // Also look for URLs in text content (like the screenshot shows)
                    const pageText = await page.evaluate(() => document.body.textContent);
                    const urlMatches = pageText.match(/(?:https?:\/\/|www\.)[^\s\n\r]+/g);
                    if (urlMatches) {
                        urlMatches.forEach(url => {
                            // Clean up the URL and check if it's valid
                            const cleanUrl = url.replace(/[.,;!?]+$/, ''); // Remove trailing punctuation
                            if (cleanUrl.includes('.') && 
                                !cleanUrl.includes('stanford.edu/profile') &&
                                !cleanUrl.includes('alumnidirectory.stanford.edu') &&
                                !cleanUrl.includes('stanford.edu/search') &&
                                !cleanUrl.includes('stanford.edu/site') &&
                                !cleanUrl.includes('myaccount.stanford.edu') &&
                                !cleanUrl.includes('alumni.stanford.edu') &&
                                !cleanUrl.includes('give.stanford.edu') &&
                                !cleanUrl.includes('gostanford.com') &&
                                !cleanUrl.includes('oval.stanford.edu') &&
                                !cleanUrl.includes('ed.stanford.edu') &&
                                !cleanUrl.includes('engineering.stanford.edu') &&
                                !cleanUrl.includes('humsci.stanford.edu') &&
                                !cleanUrl.includes('law.stanford.edu') &&
                                !cleanUrl.includes('medicine.stanford.edu') &&
                                !cleanUrl.includes('sustainability.stanford.edu') &&
                                !cleanUrl.includes('visit.stanford.edu') &&
                                !cleanUrl.includes('emergency.stanford.edu') &&
                                !cleanUrl.includes('uit.stanford.edu') &&
                                !cleanUrl.includes('adminguide.stanford.edu') &&
                                !cleanUrl.includes('non-discrimination.stanford.edu') &&
                                !cleanUrl.includes('honorrolls.stanford.edu') &&
                                !cleanUrl.includes('studentservices.stanford.edu') &&
                                !cleanUrl.includes('www.stanford.edu') &&
                                !cleanUrl.includes('gsb.stanford.edu')) {
                                
                                let urlType = 'Website';
                                if (cleanUrl.includes('linkedin.com')) {
                                    urlType = 'LinkedIn';
                                }
                                
                                const urlEntry = `${urlType}: ${cleanUrl}`;
                                if (!urls.includes(urlEntry)) {
                                    urls.push(urlEntry);
                                    console.log(`Found ${urlType} from text: ${cleanUrl}`);
                                }
                            }
                        });
                    }
                    
                } catch (e) {
                    console.log(`URL extraction failed: ${e.message}`);
                }
                
                // Extract emails using multiple methods
                const emailSelectors = [
                    'a[href^="mailto:"]',
                    'ul[data-test="profile-summary-email-items"] a',
                    'ul[data-test="profile-summary-email-items"]'
                ];
                
                for (const selector of emailSelectors) {
                    try {
                        if (selector === 'ul[data-test="profile-summary-email-items"]') {
                            // Extract from ul text content
                            const ulElement = await page.$(selector);
                            if (ulElement) {
                                const ulText = await ulElement.textContent();
                                console.log(`Found email section text: ${ulText}`);
                                if (ulText && ulText.includes('@')) {
                                    const emailMatches = ulText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
                                    if (emailMatches) {
                                        emailMatches.forEach(email => {
                                            emails.push(email);
                                            console.log(`Found email from section: ${email}`);
                                        });
                                    }
                                }
                            }
                        } else {
                            // Extract from links
                            const emailElements = await page.$$(selector);
                            for (const emailEl of emailElements) {
                                const href = await emailEl.getAttribute('href');
                                if (href && href.includes('mailto:')) {
                                    const email = href.replace('mailto:', '');
                                    if (email.includes('@')) {
                                        emails.push(email);
                                        console.log(`Found email from link: ${email}`);
                                    }
                                }
                                
                                const text = await emailEl.textContent();
                                if (text && text.includes('@')) {
                                    const emailMatches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
                                    if (emailMatches) {
                                        emailMatches.forEach(email => {
                                            emails.push(email);
                                            console.log(`Found email from text: ${email}`);
                                        });
                                    }
                                }
                            }
                        }
                        
                        if (emails.length > 0) break;
                    } catch (e) {
                        console.log(`Email selector failed: ${e.message}`);
                    }
                }
                
                // Fallback: search entire page for emails
                if (emails.length === 0) {
                    console.log(`No emails found with selectors, searching page text...`);
                    const pageText = await page.evaluate(() => document.body.textContent);
                    const emailMatches = pageText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
                    if (emailMatches) {
                        emailMatches.forEach(email => {
                            if (!email.includes('example.com') && !email.includes('domain.com')) {
                                emails.push(email);
                                console.log(`Found email from page search: ${email}`);
                            }
                        });
                    }
                }
                
                // If still no emails, try clicking ALL buttons that might expand email sections
                if (emails.length === 0) {
                    console.log(`Still no emails found, trying to click any email-related buttons...`);
                    try {
                        // Try to find and click any button that might expand emails
                        const allButtons = await page.$$('button');
                        for (const button of allButtons) {
                            const buttonText = await button.textContent();
                            if (buttonText && (buttonText.toLowerCase().includes('email') || buttonText.toLowerCase().includes('stanford'))) {
                                console.log(`Trying to click button with text: ${buttonText.substring(0, 50)}...`);
                                try {
                                    await button.click();
                                    await new Promise(resolve => setTimeout(resolve, 1000));
                                    
                                    // Check if emails appeared after clicking
                                    const quickEmailCheck = await page.$$('a[href^="mailto:"]');
                                    if (quickEmailCheck.length > 0) {
                                        console.log(`Found ${quickEmailCheck.length} email links after clicking button!`);
                                        for (const emailEl of quickEmailCheck) {
                                            const href = await emailEl.getAttribute('href');
                                            if (href && href.includes('mailto:')) {
                                                const email = href.replace('mailto:', '');
                                                if (email.includes('@')) {
                                                    emails.push(email);
                                                    console.log(`Found email after button click: ${email}`);
                                                }
                                            }
                                        }
                                        break; // Stop clicking buttons if we found emails
                                    }
                                } catch (e) {
                                    // Button click failed, continue
                                }
                            }
                        }
                    } catch (e) {
                        console.log(`Button clicking failed: ${e.message}`);
                    }
                }
                
                // Remove duplicates
                emails = [...new Set(emails)];
                urls = [...new Set(urls)];
                
                if (emails.length > 0) {
                    console.log(`✅ Found ${emails.length} emails for ${name}: ${emails.join(', ')}`);
                } else {
                    console.log(`❌ No emails found for ${name} on profile page`);
                }
                
                if (urls.length > 0) {
                    console.log(`✅ Found ${urls.length} URLs for ${name}: ${urls.join(', ')}`);
                } else {
                    console.log(`ℹ️ No URLs found for ${name}`);
                }
                
            } catch (error) {
                console.warn(`Email/URL extraction failed for ${name}:`, error.message);
            }
            
            // Navigate back to the directory
            console.log(`🔙 Navigating back to directory...`);
            await page.goto(currentUrl, { waitUntil: 'networkidle', timeout: 30000 });
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const stanfordEmails = emails.filter(e => e.match(/@(alumni\.|gsb\.)?stanford\.edu$/i)).join(', ');
            const personalEmails = emails.filter(e => !e.match(/@(alumni\.|gsb\.)?stanford\.edu$/i)).join(', ');
            const allUrls = urls.join(', ');
            
            return {
                name,
                classYear: 'N/A',
                degree,
                location: 'N/A',
                company,
                stanfordEmail: stanfordEmails || 'N/A',
                personalEmail: personalEmails || 'N/A',
                urls: allUrls || 'N/A',
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
                { id: 'urls', title: 'URLs' },
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
                timeout: 60000 // Increased to 60 seconds
            });
            
            console.log('⏳ Waiting for page to fully load...');
            
            // Wait longer for the page to settle
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // Check if we were redirected to auth page
            const currentUrl = page.url();
            console.log(`🔗 Current URL: ${currentUrl}`);
            
            if (currentUrl.includes('/auth') || currentUrl.includes('/login') || currentUrl.includes('/signin') || currentUrl.includes('pass.stanford.edu')) {
                console.log('🔐 Detected redirect to authentication page');
                console.log('❌ Your saved session has expired or is invalid');
                console.log('\n📝 To fix this:');
                console.log('1. Run: npm run save-session');
                console.log('2. Manually log in when the browser opens');
                console.log('3. Press Enter to save the session');
                console.log('4. Then run the crawler again');
                
                // Keep browser open for 30 seconds so user can see the error
                console.log('\n⏸️ Browser will stay open for 30 seconds so you can see the error...');
                await new Promise(resolve => setTimeout(resolve, 30000));
                
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
                    await page.waitForSelector(selector, { timeout: 10000 });
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
                
                // Keep browser open for inspection
                console.log('\n⏸️ Browser will stay open for 60 seconds for manual inspection...');
                await new Promise(resolve => setTimeout(resolve, 60000));
                
                throw new Error('No alumni cards found on the page. Please check if you need to login manually first.');
            }
            
            let allAlumniData = [];
            let currentPage = 1;
            const targetProfiles = 20; // Reduced from 100 to ensure completion
            
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
                let processedCount = 0;
                while (processedCount < alumniCards.length && allAlumniData.length < targetProfiles) {
                    // Re-fetch alumni cards after each profile visit to avoid stale elements
                    const currentAlumniCards = await page.$$(foundSelector);
                    
                    if (processedCount >= currentAlumniCards.length) {
                        console.log(`⚠️ No more cards to process (${processedCount}/${currentAlumniCards.length})`);
                        break;
                    }
                    
                    console.log(`\n📋 Processing card ${processedCount + 1}/${currentAlumniCards.length} on page ${currentPage}`);
                    
                    const alumniData = await this.extractAlumniFromElement(currentAlumniCards[processedCount], page);
                    if (alumniData) {
                        allAlumniData.push(alumniData);
                        console.log(`✅ Extracted ${allAlumniData.length}/${targetProfiles}: ${alumniData.name}`);
                        
                        // Save to CSV after every profile for immediate progress tracking
                        console.log(`💾 Saving progress... (${allAlumniData.length} profiles)`);
                        await this.saveToCSV(allAlumniData);
                    }
                    
                    processedCount++;
                    
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
                    await page.waitForSelector(foundSelector, { timeout: 30000 });
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
            
            console.log('\n⏸️ Browser will stay open indefinitely for inspection.');
            console.log('📝 You can manually navigate, inspect the data, or close when ready.');
            console.log('Press Enter to close the browser...');
            
            // Wait indefinitely until user presses Enter
            await new Promise(resolve => {
                process.stdin.once('data', resolve);
            });
            
        } catch (error) {
            console.error('❌ Error during crawling:', error.message);
            console.log('\n🔍 Debug info:');
            console.log(`Current URL: ${page.url()}`);
            console.log(`Page title: ${await page.title().catch(() => 'Unable to get title')}`);
            
            // Keep browser open even on error
            console.log('\n⏸️ Browser will stay open for 60 seconds even after error for debugging...');
            await new Promise(resolve => setTimeout(resolve, 60000));
            
        } finally {
            // Only close if user is ready
            console.log('🔒 Closing browser...');
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