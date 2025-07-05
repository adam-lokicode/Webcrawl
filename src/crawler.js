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
            // Wait for alumni cards to load
            await this.page.waitForSelector('div.flex.flex-col.break-words.text-saa-black.border.border-black-10.shadow-sm', {
                timeout: this.config.timeout
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
            // Location and classYear may not be present, so set as N/A
            const location = 'N/A';
            const classYear = 'N/A';
            return {
                name,
                classYear,
                degree,
                location,
                company,
                extractedAt: new Date().toISOString()
            };
        } catch (error) {
            console.warn('⚠️ Failed to extract data from element:', error.message);
            return null;
        }
    }

    async saveToCSV() {
        if (this.data.length === 0) {
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
                { id: 'extractedAt', title: 'Extracted At' }
            ]
        });
        
        await csvWriter.writeRecords(this.data);
        console.log(`✅ Data saved to ${path.join(this.config.outputDir, this.config.csvFilename)}`);
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            console.log('🔒 Browser closed');
        }
    }

    async crawl(searchCriteria = {}) {
        try {
            await this.initialize();
            await this.login();
            await this.searchAlumni(searchCriteria);
            await this.extractAlumniData();
            await this.saveToCSV();
        } catch (error) {
            console.error('❌ Crawling failed:', error.message);
            throw error;
        } finally {
            await this.close();
        }
    }
}

module.exports = StanfordAlumniCrawler; 