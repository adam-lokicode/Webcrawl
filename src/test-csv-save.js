const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const path = require('path');

// Test data based on what we've seen in the crawler output
const testData = [
    {
        name: 'Bill Reese',
        classYear: 'N/A',
        degree: 'N/A',
        location: 'N/A',
        company: 'N/A',
        stanfordEmail: 'N/A',
        personalEmail: 'w.reese@iyfnet.org',
        urls: 'N/A',
        extractedAt: new Date().toISOString()
    },
    {
        name: 'Jeff Mendelssohn',
        classYear: 'N/A',
        degree: 'N/A',
        location: 'N/A',
        company: 'N/A',
        stanfordEmail: 'N/A',
        personalEmail: 'jeffreymendelssohn@gmail.com',
        urls: 'N/A',
        extractedAt: new Date().toISOString()
    },
    {
        name: 'Emma Passmore',
        classYear: 'N/A',
        degree: 'N/A',
        location: 'N/A',
        company: 'N/A',
        stanfordEmail: 'emma.passmore@alumni.stanford.edu',
        personalEmail: 'N/A',
        urls: 'N/A',
        extractedAt: new Date().toISOString()
    }
];

async function saveTestData() {
    const csvWriter = createCsvWriter({
        path: path.join(__dirname, '../output/stanford_alumni_data.csv'),
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

    await csvWriter.writeRecords(testData);
    console.log('✅ Test CSV file created with extracted emails!');
}

saveTestData().catch(console.error); 