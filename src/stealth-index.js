const StealthStanfordAlumniCrawler = require('./stealth-crawler');

async function main() {
    const crawler = new StealthStanfordAlumniCrawler();
    
    try {
        console.log('🛡️ Starting Stanford Alumni Directory Stealth Crawler...');
        console.log('⏱️ This version uses longer delays to avoid detection');
        console.log('📊 Limited to 50 profiles per session for safety\n');
        
        await crawler.initialize();
        await crawler.crawlAlumni();
        
    } catch (error) {
        console.error('❌ Stealth crawler failed:', error.message);
    } finally {
        await crawler.close();
    }
}

main().catch(console.error); 