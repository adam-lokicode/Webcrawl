const StanfordAlumniCrawler = require('./crawler');
const fs = require('fs');
const path = require('path');

class StealthStanfordAlumniCrawler extends StanfordAlumniCrawler {
    constructor() {
        super();
        
        // Stealth configuration - much slower but less detectable
        this.stealthConfig = {
            delayBetweenProfiles: 10000, // 10 seconds between profiles
            delayBetweenPages: 30000,    // 30 seconds between pages
            delayBetweenSearches: 60000, // 1 minute between search strategies
            maxProfilesPerSession: 50,   // Limit profiles per session
            humanTypingDelay: 200,       // Slower typing
            randomDelayVariance: 5000    // Add random variance to delays
        };
    }

    // Add random delay to simulate human behavior
    async randomDelay(baseDelay) {
        const variance = Math.random() * this.stealthConfig.randomDelayVariance;
        const totalDelay = baseDelay + variance;
        console.log(`⏱️ Waiting ${Math.round(totalDelay/1000)}s (stealth mode)...`);
        await new Promise(resolve => setTimeout(resolve, totalDelay));
    }

    // Override the crawlSearchResults method to add stealth delays
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
            let profilesThisSession = 0;
            
            while (results.length < 1000 && profilesThisSession < this.stealthConfig.maxProfilesPerSession) {
                console.log(`📄 Processing ${searchType} page ${currentPage} (stealth mode)...`);
                
                // Gentle scroll to load more content
                await this.gentleScrollToLoadContent(page);
                
                // Re-get alumni cards after scrolling
                alumniCards = await page.$$(foundSelector);
                console.log(`📋 Found ${alumniCards.length} alumni cards on page ${currentPage}`);
                
                // Extract data from each card with stealth delays
                let processedCount = 0;
                while (processedCount < alumniCards.length && results.length < 1000 && profilesThisSession < this.stealthConfig.maxProfilesPerSession) {
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
                                profilesThisSession++;
                                
                                // Save incrementally to CSV
                                await this.saveIncrementalCSV(alumniData);
                                
                                console.log(`✅ Extracted ${results.length}: ${alumniData.name} (${searchType} - Page ${currentPage}) [Total saved: ${totalSavedCount}] [Session: ${profilesThisSession}/${this.stealthConfig.maxProfilesPerSession}]`);
                                
                                // Stealth delay between profiles
                                await this.randomDelay(this.stealthConfig.delayBetweenProfiles);
                            } else {
                                console.log(`⏭️ Skipping duplicate: ${alumniData.name}`);
                            }
                        } else {
                            console.log(`🚫 Filtered out non-alumni content: ${alumniData.name.substring(0, 50)}...`);
                        }
                    }
                    
                    processedCount++;
                }
                
                // Check if we've hit session limit
                if (profilesThisSession >= this.stealthConfig.maxProfilesPerSession) {
                    console.log(`🛑 Reached session limit of ${this.stealthConfig.maxProfilesPerSession} profiles to avoid detection`);
                    console.log(`💡 Recommendation: Wait a few hours and restart the crawler to continue`);
                    break;
                }
                
                // Try to navigate to next page with stealth delay
                console.log(`⏱️ Waiting before checking for next page (stealth mode)...`);
                await this.randomDelay(this.stealthConfig.delayBetweenPages);
                
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

    // Gentle scrolling to avoid detection
    async gentleScrollToLoadContent(page) {
        console.log('📜 Gently scrolling to load content (stealth mode)...');
        
        // Slow, human-like scrolling
        await page.evaluate(async () => {
            const scrollHeight = document.body.scrollHeight;
            const viewportHeight = window.innerHeight;
            const scrollSteps = 5;
            const stepSize = scrollHeight / scrollSteps;
            
            for (let i = 0; i < scrollSteps; i++) {
                window.scrollTo(0, stepSize * i);
                await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second between scroll steps
            }
            
            // Scroll back to top slowly
            for (let i = scrollSteps; i >= 0; i--) {
                window.scrollTo(0, stepSize * i);
                await new Promise(resolve => setTimeout(resolve, 500)); // 0.5 seconds between scroll steps
            }
        });
        
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Override crawlAlumni to add stealth delays between search strategies
    async crawlAlumni() {
        // Initialize browser and context if not already done
        if (!this.browser) {
            await this.initialize();
        }

        const page = await this.browser.newContext({
            storageState: fs.existsSync(this.config.sessionFile) ? this.config.sessionFile : undefined
        }).then(context => context.newPage());

        try {
            console.log('🔍 Navigating to Stanford Alumni Directory (stealth mode)...');
            await page.goto('https://alumnidirectory.stanford.edu/', {
                waitUntil: 'networkidle',
                timeout: 60000
            });

            console.log('⏳ Waiting for page to fully load...');
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
                console.log('4. Then run the stealth crawler again');
                
                throw new Error('Session expired. Please run "npm run save-session" to create a new session.');
            }

            let allAlumniData = [];
            const targetProfiles = 1000; // Lower target for stealth mode
            
            console.log(`🎯 Target: ${targetProfiles} profiles (stealth mode - slower but safer)`);
            console.log('🔍 Using stealth approach to avoid detection...\n');
            
            // Strategy 1: Default search (no filters) - stealth mode
            console.log('📋 Strategy 1: Crawling default results (stealth mode)...');
            const defaultResults = await this.crawlSearchResults(page, 'default', null);
            allAlumniData = allAlumniData.concat(defaultResults);
            console.log(`✅ Default search completed: ${defaultResults.length} profiles`);
            
            // Add delay between search strategies
            if (allAlumniData.length < targetProfiles) {
                console.log(`⏱️ Waiting between search strategies (stealth mode)...`);
                await this.randomDelay(this.stealthConfig.delayBetweenSearches);
            }

            // Count total unique profiles collected
            const totalUniqueProfiles = allAlumniData.length;
            
            console.log(`\n📊 Stealth Session Results: Collected ${totalUniqueProfiles} unique profiles`);
            console.log(`💾 All data has been saved incrementally to: ${path.join(this.config.outputDir, this.config.csvFilename)}`);
            console.log(`🛡️ Stealth mode completed - recommend waiting a few hours before next session`);
            
            if (totalUniqueProfiles === 0) {
                console.log('❌ No alumni data collected');
            } else {
                console.log('✅ Stealth crawling session completed successfully!');
            }

            console.log('\n⏸️ Browser will stay open indefinitely for inspection.');
            console.log('📝 You can manually navigate, inspect the data, or close when ready.');
            console.log('Press Enter to close the browser...');

            // Wait indefinitely until user presses Enter
            await new Promise(resolve => {
                process.stdin.once('data', resolve);
            });

        } catch (error) {
            console.error('❌ Error during stealth crawling:', error.message);
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
}

module.exports = StealthStanfordAlumniCrawler; 