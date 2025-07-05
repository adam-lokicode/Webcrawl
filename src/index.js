#!/usr/bin/env node

const { Command } = require('commander');
const StanfordAlumniCrawler = require('./crawler');

const program = new Command();

program
    .name('stanford-alumni-crawler')
    .description('Webcrawler for Stanford Alumni Directory')
    .version('1.0.0');

program
    .command('crawl')
    .description('Crawl the Stanford Alumni Directory')
    .option('-n, --name <name>', 'Search by name')
    .option('-y, --year <year>', 'Search by class year')
    .option('-d, --degree <degree>', 'Search by degree')
    .option('--headless', 'Run in headless mode')
    .option('--slow-mo <ms>', 'Slow down operations by specified milliseconds', '1000')
    .action(async (options) => {
        try {
            console.log('🎓 Stanford Alumni Directory Crawler');
            console.log('=====================================\n');
            
            // Override environment variables with command line options
            if (options.headless) {
                process.env.HEADLESS = 'true';
            }
            if (options.slowMo) {
                process.env.SLOW_MO = options.slowMo;
            }
            
            const crawler = new StanfordAlumniCrawler();
            
            const searchCriteria = {};
            if (options.name) searchCriteria.name = options.name;
            if (options.year) searchCriteria.classYear = options.year;
            if (options.degree) searchCriteria.degree = options.degree;
            
            await crawler.crawl(searchCriteria);
            
            console.log('\n🎉 Crawling completed successfully!');
            
        } catch (error) {
            console.error('\n❌ Crawling failed:', error.message);
            process.exit(1);
        }
    });

program
    .command('test-login')
    .description('Test login functionality without crawling')
    .action(async () => {
        try {
            console.log('🔐 Testing login functionality...\n');
            
            const crawler = new StanfordAlumniCrawler();
            await crawler.initialize();
            await crawler.login();
            
            console.log('\n✅ Login test successful!');
            await crawler.close();
            
        } catch (error) {
            console.error('\n❌ Login test failed:', error.message);
            process.exit(1);
        }
    });

program
    .command('setup')
    .description('Setup the crawler environment')
    .action(async () => {
        console.log('🔧 Setting up Stanford Alumni Crawler...\n');
        
        console.log('1. Install dependencies:');
        console.log('   npm install\n');
        
        console.log('2. Install Playwright browsers:');
        console.log('   npm run install-browsers\n');
        
        console.log('3. Create .env file:');
        console.log('   cp env.example .env\n');
        
        console.log('4. Edit .env file with your credentials:');
        console.log('   STANFORD_USERNAME=your_username');
        console.log('   STANFORD_PASSWORD=your_password\n');
        
        console.log('5. Run the crawler:');
        console.log('   npm run crawl\n');
        
        console.log('✅ Setup instructions completed!');
    });

// If no command is provided, show help
if (!process.argv.slice(2).length) {
    program.outputHelp();
}

program.parse(); 