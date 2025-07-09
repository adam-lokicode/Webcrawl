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
            const degree = await page.evaluate(() => {
                const fullText = document.body.textContent;
                
                // Method 1: Look for degree displayed prominently near the name (like "LLM '25")
                const nameSection = fullText.substring(0, 500); // First 500 chars likely contain name and degree
                const prominentDegreeMatch = nameSection.match(/\b(MBA|MS|PhD|BA|BS|JD|MD|MA|MEd|MFA|MPH|MSW|MPA|LLM|ScD|EdD)\s*['']?\d{2}\b/i);
                if (prominentDegreeMatch) {
                    return prominentDegreeMatch[0].trim();
                }
                
                // Method 2: Look for the "Degrees" section specifically
                const degreesIndex = fullText.indexOf('Degrees');
                if (degreesIndex !== -1) {
                    // Get text after "Degrees"
                    const afterDegrees = fullText.substring(degreesIndex + 'Degrees'.length);
                    
                    // Look for the next major section to know where to stop
                    const nextSectionMatch = afterDegrees.match(/\n\s*(More about me|Skills & specialties|Stanford information|Contact information|Professional experience|Personal information)/i);
                    const degreesText = nextSectionMatch ? 
                        afterDegrees.substring(0, nextSectionMatch.index) : 
                        afterDegrees.substring(0, 800); // Increased limit
                    
                    // Clean up the degrees text and extract meaningful degree info
                    const lines = degreesText.split('\n').map(line => line.trim()).filter(line => line);
                    
                    let degreeInfo = [];
                    let currentYear = '';
                    
                    for (const line of lines) {
                        // Check if it's a year (4 digits)
                        if (/^\d{4}$/.test(line)) {
                            currentYear = line;
                        }
                        // Check if it's a degree line (contains degree abbreviations or full names)
                        else if (line.match(/\b(BS|BA|MS|MA|MBA|PhD|JD|MD|MEd|MFA|MPH|MSW|MPA|LLM|ScD|EdD|Bachelor|Master|Doctor)\b/i)) {
                            // Clean up the degree line
                            let cleanDegree = line
                                .replace(/School\s*$/, '') // Remove "School" at the end
                                .replace(/Humanities.*$/, '') // Remove "Humanities" and everything after
                                .replace(/Sciences.*$/, '') // Remove "Sciences" and everything after
                                .trim();
                            
                            if (cleanDegree && cleanDegree.length > 2) {
                                if (currentYear) {
                                    degreeInfo.push(`${cleanDegree} '${currentYear.slice(-2)}`);
                                } else {
                                    degreeInfo.push(cleanDegree);
                                }
                            }
                        }
                    }
                    
                    if (degreeInfo.length > 0) {
                        return degreeInfo.join(', ');
                    }
                }
                
                // Method 3: Look for full degree names in text
                const fullDegreePatterns = [
                    /(Bachelor|Master|Doctor)\s+of\s+[A-Za-z\s,()&-]+/gi,
                    /\b(MBA|MS|PhD|BA|BS|JD|MD|MA|MEd|MFA|MPH|MSW|MPA|LLM|ScD|EdD)\s*-?\s*[A-Za-z\s,()&-]+/gi
                ];
                
                for (const pattern of fullDegreePatterns) {
                    const matches = fullText.match(pattern);
                    if (matches) {
                        // Return the first reasonable match
                        for (const match of matches) {
                            if (match.length < 100 && !match.includes('Stanford') && !match.includes('Alumni') && !match.includes('Directory')) {
                                return match.trim();
                            }
                        }
                    }
                }
                
                // Method 4: Simple degree patterns as final fallback
                const simpleDegreePatterns = [
                    /\b(MBA|MS|PhD|BA|BS|JD|MD|MA|MEd|MFA|MPH|MSW|MPA|LLM|ScD|EdD)\s*['']?\d{2}\b/gi
                ];
                
                for (const pattern of simpleDegreePatterns) {
                    const matches = fullText.match(pattern);
                    if (matches) {
                        return matches[0].trim();
                    }
                }
                
                return 'N/A';
            }).catch(() => 'N/A');

            // Extract location - look for patterns like "City, State" or "City, Country"
            const location = await page.evaluate(() => {
                const fullText = document.body.textContent;
                
                // Look for location patterns - typically after name/degree
                const locationPatterns = [
                    /([A-Za-z\s]+),\s+([A-Za-z\s]+)(?=\s|$)/g,
                    /([A-Za-z\s]{3,25}),\s+([A-Za-z\s]{2,25})/g
                ];
                
                for (const pattern of locationPatterns) {
                    const matches = [...fullText.matchAll(pattern)];
                    for (const match of matches) {
                        const location = match[0].trim();
                        // Filter out obvious non-locations
                        if (location.length > 5 && location.length < 50 &&
                            !location.includes('Stanford') &&
                            !location.includes('Alumni') &&
                            !location.includes('Directory') &&
                            !location.includes('My Account') &&
                            !location.includes('Skip to') &&
                            !location.includes('Industries') &&
                            !location.includes('Funds') &&
                            !location.match(/\d{4}/) && // No years
                            !location.includes('@') && // No emails
                            !location.includes('CEO') &&
                            !location.includes('Director') &&
                            !location.includes('Manager')) {
                            return location;
                        }
                    }
                }
                
                return 'N/A';
            }).catch(() => 'N/A');
            
            // Extract company/position more precisely
            const company = await page.evaluate(() => {
                const fullText = document.body.textContent;
                
                // Look for job title patterns that are more specific to the visible content
                const jobPatterns = [
                    // Match "CEO, FEXI / EXI Funds" pattern
                    /(CEO|CTO|CFO|COO|President|Founder|Owner|Director|Manager|VP|Vice President)[,\s]+([^.\n]{5,80})/gi,
                    // Match "Title, Company" pattern
                    /([A-Za-z\s]+(?:Director|Manager|Officer|CEO|President|Founder|Owner|Partner|Consultant|Analyst|Engineer))[,\s]+([^.\n]{5,80})/gi,
                    // Match "Business Development Director, Oracle Corporation" pattern
                    /([A-Za-z\s]+Director)[,\s]+([A-Za-z\s]+(?:Corporation|Company|Inc|LLC|Group|Fund|Capital|Equity))/gi
                ];
                
                for (const pattern of jobPatterns) {
                    const matches = [...fullText.matchAll(pattern)];
                    for (const match of matches) {
                        const fullMatch = match[0].trim();
                        
                        // Filter out navigation and unwanted text
                        if (fullMatch.length > 10 && fullMatch.length < 150 &&
                            !fullMatch.includes('Stanford') &&
                            !fullMatch.includes('Alumni') &&
                            !fullMatch.includes('Directory') &&
                            !fullMatch.includes('My Account') &&
                            !fullMatch.includes('Skip to') &&
                            !fullMatch.includes('Back to') &&
                            !fullMatch.includes('external link') &&
                            !fullMatch.includes('More about') &&
                            !fullMatch.includes('Skills &')) {
                            return fullMatch;
                        }
                    }
                }
                
                // Look for "Industries:" pattern which often follows job titles
                const industriesMatch = fullText.match(/Industries:\s*([^.\n]{5,80})/i);
                if (industriesMatch) {
                    // Try to find the job title that comes before "Industries:"
                    const beforeIndustries = fullText.substring(0, fullText.indexOf(industriesMatch[0]));
                    const jobTitleMatch = beforeIndustries.match(/(CEO|CTO|CFO|COO|President|Founder|Owner|Director|Manager|VP|Vice President)[^.\n]{0,50}$/i);
                    if (jobTitleMatch) {
                        const jobTitle = jobTitleMatch[0].trim();
                        const industries = industriesMatch[1].trim();
                        return `${jobTitle}, Industries: ${industries}`;
                    }
                }
                
                // Look for lines that contain job titles
                const lines = fullText.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();
                    
                    // Skip navigation and common elements
                    if (line.includes('Skip to main') || 
                        line.includes('My Account') ||
                        line.includes('Alumni Directory') ||
                        line.includes('external link') ||
                        line.includes('Back to Directory') ||
                        line.includes('More about me') ||
                        line.includes('Skills & specialties') ||
                        line.includes('Stanford') ||
                        line.length < 8 ||
                        line.length > 120) {
                        continue;
                    }
                    
                    // Look for lines that contain clear job titles
                    if (line.match(/\b(CEO|CTO|CFO|COO|President|Founder|Owner|Director|Manager|VP|Vice President)\b/i) &&
                        (line.includes(',') || line.includes('/') || line.match(/\b(Fund|Capital|Equity|Corporation|Company|Inc|LLC|Group)\b/i))) {
                        return line;
                    }
                }
                
                return 'N/A';
            }).catch(() => 'N/A');
            
            // Extract emails and URLs from the full profile page
            let emails = [];
            let urls = [];
            let phones = [];
            try {
                console.log(`📧 Extracting emails, URLs, and phone numbers from full profile for ${name}...`);
                
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
                
                // Extract phone numbers with enhanced methods
                console.log(`📞 Extracting phone numbers...`);
                try {
                    // Method 1: Look for phone numbers in professional contact section
                    const professionalContactText = await page.evaluate(() => {
                        // Look for "Professional contact information" section
                        const fullText = document.body.textContent;
                        const contactIndex = fullText.indexOf('Professional contact information');
                        if (contactIndex !== -1) {
                            return fullText.substring(contactIndex, contactIndex + 300);
                        }
                        return '';
                    });
                    
                    if (professionalContactText) {
                        const phonePatterns = [
                            /\+1\s*\(\d{3}\)\s*\d{3}-\d{4}/g,  // +1 (650) 924-7485
                            /\+1\s*\d{3}\s*\d{3}\s*\d{4}/g,    // +1 650 924 7485
                            /\(\d{3}\)\s*\d{3}-\d{4}/g,        // (650) 924-7485
                            /\d{3}-\d{3}-\d{4}/g,              // 650-924-7485
                            /\d{3}\.\d{3}\.\d{4}/g             // 650.924.7485
                        ];
                        
                        for (const pattern of phonePatterns) {
                            const matches = professionalContactText.match(pattern);
                            if (matches) {
                                matches.forEach(phone => {
                                    const cleanPhone = phone.trim();
                                    if (!phones.includes(cleanPhone)) {
                                        phones.push(cleanPhone);
                                        console.log(`Found phone from professional contact: ${cleanPhone}`);
                                    }
                                });
                            }
                        }
                    }
                    
                    // Method 2: Look for phone numbers in personal information section
                    const phoneSelectors = [
                        '[data-test="profile-personal-information"]',
                        '[data-test="profile-professional-contact"]',
                        'section:has(h3:contains("contact")) span',
                        'section:has(h3:contains("phone")) span'
                    ];
                    
                    for (const selector of phoneSelectors) {
                        try {
                            const phoneElements = await page.$$(selector);
                            for (const phoneEl of phoneElements) {
                                const phoneText = await phoneEl.textContent();
                                if (phoneText && phoneText.match(/\+?\d{1,3}[\s\-\(\)]*\d{3,4}[\s\-\(\)]*\d{3,4}[\s\-]*\d{3,4}/)) {
                                    const phoneMatches = phoneText.match(/\+1\s*\(\d{3}\)\s*\d{3}-\d{4}|\+1\s*\d{3}\s*\d{3}\s*\d{4}|\(\d{3}\)\s*\d{3}-\d{4}|\d{3}-\d{3}-\d{4}|\d{3}\.\d{3}\.\d{4}/g);
                                    if (phoneMatches) {
                                        phoneMatches.forEach(phone => {
                                            const cleanPhone = phone.trim();
                                            if (!phones.includes(cleanPhone)) {
                                                phones.push(cleanPhone);
                                                console.log(`Found phone from element: ${cleanPhone}`);
                                            }
                                        });
                                    }
                                }
                            }
                        } catch (e) {
                            // Try next selector
                        }
                    }
                    
                    // Method 3: Fallback - search entire page text for phone patterns
                    if (phones.length === 0) {
                        const pageText = await page.evaluate(() => document.body.textContent);
                        
                        const phonePatterns = [
                            /\+1\s*\(\d{3}\)\s*\d{3}-\d{4}/g,  // +1 (650) 924-7485
                            /\+1\s*\d{3}\s*\d{3}\s*\d{4}/g,    // +1 650 924 7485
                            /\(\d{3}\)\s*\d{3}-\d{4}/g,        // (650) 924-7485
                            /\d{3}-\d{3}-\d{4}/g,              // 650-924-7485
                            /\d{3}\.\d{3}\.\d{4}/g             // 650.924.7485
                        ];
                        
                        for (const pattern of phonePatterns) {
                            const matches = pageText.match(pattern);
                            if (matches) {
                                matches.forEach(phone => {
                                    const cleanPhone = phone.trim();
                                    // Filter out obviously wrong numbers
                                    if (!cleanPhone.includes('000-000-0000') && 
                                        !cleanPhone.includes('123-456-7890') &&
                                        !phones.includes(cleanPhone)) {
                                        phones.push(cleanPhone);
                                        console.log(`Found phone from page text: ${cleanPhone}`);
                                    }
                                });
                            }
                        }
                    }
                    
                } catch (e) {
                    console.log(`Phone extraction failed: ${e.message}`);
                }
                
                // Extract emails using multiple robust methods
                const emailSelectors = [
                    'a[href^="mailto:"]',
                    'ul[data-test="profile-summary-email-items"] a',
                    'ul[data-test="profile-summary-email-items"]',
                    '[href*="@stanford.edu"]',
                    '[href*="@alumni.stanford.edu"]',
                    'a[href*="mailto"]'
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
                                } else if (href && href.includes('@')) {
                                    // Handle direct email links
                                    emails.push(href);
                                    console.log(`Found direct email link: ${href}`);
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
                phones = [...new Set(phones)];
                
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
                
                if (phones.length > 0) {
                    console.log(`✅ Found ${phones.length} phone numbers for ${name}: ${phones.join(', ')}`);
                } else {
                    console.log(`ℹ️ No phone numbers found for ${name}`);
                }
                
            } catch (error) {
                console.warn(`Email/URL extraction failed for ${name}:`, error.message);
            }
            
            // Extract career support information
            let careerSupport = 'No';
            try {
                console.log(`🤝 Checking career support availability for ${name}...`);
                
                const hasCareerSupport = await page.evaluate(() => {
                    const fullText = document.body.textContent;
                    
                    // Look for career support indicators
                    const careerSupportIndicators = [
                        'Willing to offer career support',
                        'Provide career advice',
                        'Career mentoring',
                        'Career guidance',
                        'Willing to mentor',
                        'Open to mentoring',
                        'Career coaching',
                        'Professional mentoring'
                    ];
                    
                    for (const indicator of careerSupportIndicators) {
                        if (fullText.includes(indicator)) {
                            return true;
                        }
                    }
                    
                    return false;
                });
                
                if (hasCareerSupport) {
                    careerSupport = 'Yes';
                    console.log(`✅ ${name} offers career support`);
                } else {
                    console.log(`ℹ️ ${name} does not offer career support`);
                }
                
            } catch (error) {
                console.warn(`Career support check failed for ${name}:`, error.message);
            }

            // Extract professional contact information availability
            let professionalContact = 'No';
            try {
                console.log(`📞 Checking professional contact availability for ${name}...`);
                
                const hasProfessionalContact = await page.evaluate(() => {
                    const fullText = document.body.textContent;
                    
                    // Look for professional contact indicators
                    const professionalContactIndicators = [
                        'Professional contact information',
                        'Professional contact',
                        'Business contact',
                        'Work contact',
                        'Office contact'
                    ];
                    
                    for (const indicator of professionalContactIndicators) {
                        if (fullText.includes(indicator)) {
                            return true;
                        }
                    }
                    
                    // Also check if there's a professional phone number or work email
                    if (fullText.includes('(Preferred phone)') || 
                        fullText.includes('Work phone') ||
                        fullText.includes('Office phone') ||
                        fullText.includes('Business phone')) {
                        return true;
                    }
                    
                    return false;
                });
                
                if (hasProfessionalContact) {
                    professionalContact = 'Yes';
                    console.log(`✅ ${name} provides professional contact information`);
                } else {
                    console.log(`ℹ️ ${name} does not provide professional contact information`);
                }
                
            } catch (error) {
                console.warn(`Professional contact check failed for ${name}:`, error.message);
            }
            
            // Extract skills before navigating back
            let skills = [];
            try {
                console.log(`🎯 Extracting skills for ${name}...`);
                
                // Look for skills in the "Skills & specialties" section
                const skillsSection = await page.evaluate(() => {
                    // Look for the Skills & specialties section
                    const skillsHeadings = document.querySelectorAll('h3, h2, h4');
                    for (const heading of skillsHeadings) {
                        const headingText = heading.textContent.trim().toLowerCase();
                        if (headingText.includes('skills') && headingText.includes('specialties')) {
                            // Found the skills section, get the content after it
                            let nextElement = heading.nextElementSibling;
                            let skillsContent = [];
                            
                            // Collect content until we hit another section or run out of siblings
                            while (nextElement && !nextElement.tagName.match(/^H[1-6]$/)) {
                                const text = nextElement.textContent.trim();
                                if (text && text.length > 2 && text.length < 100) {
                                    // Each line/element is likely a separate skill
                                    skillsContent.push(text);
                                }
                                nextElement = nextElement.nextElementSibling;
                            }
                            
                            return skillsContent.join(', ');
                        }
                    }
                    
                    // Alternative approach: look for text patterns after "Skills & specialties"
                    const fullText = document.body.textContent;
                    const skillsIndex = fullText.indexOf('Skills & specialties');
                    if (skillsIndex !== -1) {
                        // Get text after "Skills & specialties"
                        const afterSkills = fullText.substring(skillsIndex + 'Skills & specialties'.length);
                        
                        // Look for the next section to know where to stop
                        const nextSectionMatch = afterSkills.match(/\n\s*[A-Z][a-z]+\s*(?:\n|$)/);
                        const skillsText = nextSectionMatch ? 
                            afterSkills.substring(0, nextSectionMatch.index) : 
                            afterSkills.substring(0, 300); // Limit to 300 chars
                        
                        // Clean up the skills text
                        const cleanSkills = skillsText
                            .replace(/\n+/g, ', ')
                            .replace(/\s+/g, ' ')
                            .trim();
                        
                        if (cleanSkills && cleanSkills.length > 5) {
                            return cleanSkills;
                        }
                    }
                    
                    return '';
                });
                
                if (skillsSection && skillsSection.trim()) {
                    skills.push(skillsSection.trim());
                    console.log(`Found skills: ${skillsSection.trim()}`);
                } else {
                    console.log(`No skills section found for ${name}`);
                }
                
                // If no skills found in structured section, try text patterns
                if (skills.length === 0) {
                    const pageText = await page.evaluate(() => document.body.textContent);
                    
                    // Look for common skill patterns in the text
                    const skillPatterns = [
                        /Skills?\s*[:\-]\s*([^.\n]{10,100})/i,
                        /Specialties?\s*[:\-]\s*([^.\n]{10,100})/i,
                        /Expertise?\s*[:\-]\s*([^.\n]{10,100})/i,
                        /Professional\s+focus\s*[:\-]\s*([^.\n]{10,100})/i
                    ];
                    
                    for (const pattern of skillPatterns) {
                        const match = pageText.match(pattern);
                        if (match && match[1]) {
                            skills.push(match[1].trim());
                            console.log(`Found skills from pattern: ${match[1].trim()}`);
                            break;
                        }
                    }
                }
                
            } catch (error) {
                console.warn(`Skills extraction failed for ${name}:`, error.message);
            }
            
            // Navigate back to the directory
            console.log(`🔙 Navigating back to directory...`);
            await page.goto(currentUrl, { waitUntil: 'networkidle', timeout: 30000 });
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const stanfordEmails = emails.filter(e => e.match(/@(alumni\.|gsb\.|alumni-gsb\.)?stanford\.edu$/i)).join(', ');
            const personalEmails = emails.filter(e => !e.match(/@(alumni\.|gsb\.|alumni-gsb\.)?stanford\.edu$/i)).join(', ');
            const allUrls = urls.join(', ');
            const allPhones = phones.join(', ');
            const allSkills = skills.join(', ');
            
            return {
                name,
                classYear: 'N/A',
                degree,
                location,
                company,
                stanfordEmail: stanfordEmails || 'N/A',
                personalEmail: personalEmails || 'N/A',
                urls: allUrls || 'N/A',
                phone: allPhones || 'N/A',
                skills: allSkills || 'N/A',
                careerSupport: careerSupport,
                professionalContact: professionalContact,
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
                { id: 'phone', title: 'Phone' },
                { id: 'skills', title: 'Skills' },
                { id: 'careerSupport', title: 'Career Support' },
                { id: 'professionalContact', title: 'Professional Contact' },
                { id: 'extractedAt', title: 'Extracted At' }
            ]
        });
        
        await csvWriter.writeRecords(dataToSave);
        console.log(`✅ Data saved to ${path.join(this.config.outputDir, this.config.csvFilename)}`);
    }

    async saveIncrementalCSV(newRecord) {
        if (!newRecord) {
            console.log('⚠️ No record to save');
            return;
        }
        
        const csvFilePath = path.join(this.config.outputDir, this.config.csvFilename);
        
        // Check if file exists to determine if we need to write headers
        const fileExists = fs.existsSync(csvFilePath);
        
        const csvWriter = createCsvWriter({
            path: csvFilePath,
            header: [
                { id: 'name', title: 'Name' },
                { id: 'classYear', title: 'Class Year' },
                { id: 'degree', title: 'Degree' },
                { id: 'location', title: 'Location' },
                { id: 'company', title: 'Company' },
                { id: 'stanfordEmail', title: 'Stanford Email' },
                { id: 'personalEmail', title: 'Personal Email' },
                { id: 'urls', title: 'URLs' },
                { id: 'phone', title: 'Phone' },
                { id: 'skills', title: 'Skills' },
                { id: 'careerSupport', title: 'Career Support' },
                { id: 'professionalContact', title: 'Professional Contact' },
                { id: 'extractedAt', title: 'Extracted At' }
            ],
            append: fileExists // Append if file exists, otherwise create new
        });
        
        await csvWriter.writeRecords([newRecord]);
        console.log(`💾 Saved to CSV: ${newRecord.name}`);
    }

    async getExistingNames() {
        const csvFilePath = path.join(this.config.outputDir, this.config.csvFilename);
        
        if (!fs.existsSync(csvFilePath)) {
            return new Set();
        }
        
        try {
            const csvContent = fs.readFileSync(csvFilePath, 'utf8');
            const lines = csvContent.split('\n');
            const existingNames = new Set();
            
            // Skip header line and process data lines
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line) {
                    // Extract name from first column (handle CSV escaping)
                    const firstComma = line.indexOf(',');
                    if (firstComma > 0) {
                        let name = line.substring(0, firstComma);
                        // Remove quotes if present
                        if (name.startsWith('"') && name.endsWith('"')) {
                            name = name.slice(1, -1);
                        }
                        existingNames.add(name);
                    }
                }
            }
            
            console.log(`📋 Found ${existingNames.size} existing names in CSV`);
            return existingNames;
        } catch (error) {
            console.warn('⚠️ Error reading existing CSV:', error.message);
            return new Set();
        }
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
            
            let allAlumniData = [];
            const targetProfiles = 10000; // Set very high to crawl until no more profiles available
            
            console.log(`🎯 Target: ${targetProfiles} profiles (will crawl until no more profiles available)`);
            console.log('🔍 Using multiple search strategies to access the full 320,000+ alumni database...\n');
            
            // Strategy 1: Default search (no filters)
            console.log('📋 Strategy 1: Crawling default results...');
            const defaultResults = await this.crawlSearchResults(page, 'default', null);
            allAlumniData = allAlumniData.concat(defaultResults);
            console.log(`✅ Default search completed: ${defaultResults.length} profiles`);
            
            if (allAlumniData.length >= targetProfiles) {
                console.log(`🎉 Reached target with default search!`);
            } else {
                // Strategy 2: Search by graduation decades
                const decades = ['1960', '1970', '1980', '1990', '2000', '2010', '2020'];
                for (const decade of decades) {
                    if (allAlumniData.length >= targetProfiles) break;
                    
                    console.log(`\n📋 Strategy 2: Searching alumni from ${decade}s...`);
                    await this.performSearch(page, decade);
                    const decadeResults = await this.crawlSearchResults(page, `${decade}s`, null);
                    allAlumniData = allAlumniData.concat(decadeResults);
                    console.log(`✅ ${decade}s search completed: ${decadeResults.length} profiles`);
                }
                
                // Strategy 3: Search by schools
                const schools = ['Business', 'Engineering', 'Medicine', 'Law', 'Education', 'Humanities', 'Sciences'];
                for (const school of schools) {
                    if (allAlumniData.length >= targetProfiles) break;
                    
                    console.log(`\n📋 Strategy 3: Searching ${school} school alumni...`);
                    await this.performSearch(page, school);
                    const schoolResults = await this.crawlSearchResults(page, school, null);
                    allAlumniData = allAlumniData.concat(schoolResults);
                    console.log(`✅ ${school} search completed: ${schoolResults.length} profiles`);
                }
                
                // Strategy 4: Search by common names
                const commonNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'];
                for (const name of commonNames) {
                    if (allAlumniData.length >= targetProfiles) break;
                    
                    console.log(`\n📋 Strategy 4: Searching surname "${name}"...`);
                    await this.performSearch(page, name);
                    const nameResults = await this.crawlSearchResults(page, `surname-${name}`, null);
                    allAlumniData = allAlumniData.concat(nameResults);
                    console.log(`✅ Surname "${name}" search completed: ${nameResults.length} profiles`);
                }
            }
            
            // Count total unique profiles collected (duplicates were already filtered during extraction)
            const totalUniqueProfiles = allAlumniData.length;
            
            console.log(`\n📊 Final Results: Collected ${totalUniqueProfiles} unique profiles across all search strategies`);
            console.log(`💾 All data has been saved incrementally to: ${path.join(this.config.outputDir, this.config.csvFilename)}`);
            
            if (totalUniqueProfiles === 0) {
                console.log('❌ No alumni data collected');
            } else {
                console.log('✅ Crawling completed successfully!');
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
    
    async performSearch(page, searchTerm) {
        try {
            console.log(`🔍 Performing search for: "${searchTerm}"`);
            
            // Navigate back to main directory page
            await page.goto('https://alumnidirectory.stanford.edu/', {
                waitUntil: 'networkidle',
                timeout: 30000
            });
            
            // Wait for page to settle
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Try multiple search box selectors
            const searchSelectors = [
                'input[placeholder*="Search"]',
                'input[type="search"]', 
                'input[name*="search"]',
                'input[id*="search"]',
                'input[class*="search"]',
                '.search-input',
                '[data-test*="search"]'
            ];
            
            let searchBox = null;
            for (const selector of searchSelectors) {
                try {
                    await page.waitForSelector(selector, { timeout: 3000 });
                    searchBox = await page.$(selector);
                    if (searchBox) {
                        console.log(`📦 Found search box with selector: ${selector}`);
                        break;
                    }
                } catch (e) {
                    // Try next selector
                }
            }
            
            if (searchBox) {
                await searchBox.clear();
                await searchBox.type(searchTerm);
                
                // Press Enter or click search button
                await searchBox.press('Enter');
                
                // Wait for results to load
                await new Promise(resolve => setTimeout(resolve, 3000));
                console.log(`✅ Search completed for: "${searchTerm}"`);
            } else {
                console.log(`⚠️ Could not find search box for: "${searchTerm}" - continuing with existing results`);
            }
            
        } catch (error) {
            console.warn(`⚠️ Search failed for "${searchTerm}":`, error.message, '- continuing with existing results');
        }
    }
    
    async crawlSearchResults(page, searchType, searchTerm) {
        const results = [];
        
        try {
            // Get existing names to avoid duplicates
            const existingNames = await this.getExistingNames();
            
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
                    await page.waitForSelector(selector, { timeout: 5000 });
                    alumniCards = await page.$$(selector);
                    if (alumniCards.length > 0) {
                        foundSelector = selector;
                        console.log(`✅ Found ${alumniCards.length} cards with selector: ${selector}`);
                        break;
                    }
                } catch (e) {
                    // Try next selector
                }
            }
            
            if (alumniCards.length === 0) {
                console.log(`⚠️ No alumni cards found for ${searchType} search`);
                return results;
            }
            
            let currentPage = 1;
            let totalSavedCount = existingNames.size;
            
            while (results.length < 1000) { // Limit per search to 1000 to avoid infinite loops
                console.log(`📄 Processing ${searchType} page ${currentPage}...`);
                
                // Scroll to load more content on current page
                await this.scrollToLoadContent(page);
                
                // Re-get alumni cards after scrolling
                alumniCards = await page.$$(foundSelector);
                console.log(`📋 Found ${alumniCards.length} alumni cards on page ${currentPage}`);
                
                // Extract data from each card
                let processedCount = 0;
                while (processedCount < alumniCards.length && results.length < 1000) {
                    // Re-fetch alumni cards to avoid stale elements
                    const currentAlumniCards = await page.$$(foundSelector);
                    
                    if (processedCount >= currentAlumniCards.length) {
                        break;
                    }
                    
                    const alumniData = await this.extractAlumniFromElement(currentAlumniCards[processedCount], page);
                    if (alumniData) {
                        // Filter out Stanford website content and other non-alumni entries
                        const isValidAlumni = !alumniData.name.includes('Stanford') && 
                                            !alumniData.name.includes('University') && 
                                            !alumniData.name.includes('Alumni Directory') &&
                                            !alumniData.name.includes('(link is external)') &&
                                            alumniData.name.length < 200 && // Reasonable name length
                                            !alumniData.name.includes('Maps & Directions') &&
                                            !alumniData.name.includes('Terms of Use');
                        
                        if (isValidAlumni) {
                            // Check if we already have this person
                            if (!existingNames.has(alumniData.name)) {
                                results.push(alumniData);
                                existingNames.add(alumniData.name);
                                totalSavedCount++;
                                
                                // Save incrementally to CSV
                                await this.saveIncrementalCSV(alumniData);
                                
                                console.log(`✅ Extracted ${results.length}: ${alumniData.name} (${searchType} - Page ${currentPage}) [Total saved: ${totalSavedCount}]`);
                            } else {
                                console.log(`⏭️ Skipping duplicate: ${alumniData.name}`);
                            }
                        } else {
                            console.log(`🚫 Filtered out non-alumni content: ${alumniData.name.substring(0, 50)}...`);
                        }
                    }
                    
                    processedCount++;
                    
                    // Small delay between extractions
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
                
                // Try to navigate to next page
                const hasNextPage = await this.goToNextPage(page);
                if (!hasNextPage) {
                    console.log(`📄 No more pages for ${searchType} search`);
                    break;
                }
                
                currentPage++;
                
                // Wait for new page to load
                try {
                    await page.waitForSelector(foundSelector, { timeout: 15000 });
                } catch (e) {
                    console.log('⚠️ Timeout waiting for new page content');
                    break;
                }
            }
            
        } catch (error) {
            console.warn(`⚠️ Error crawling ${searchType} results:`, error.message);
        }
        
        return results;
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