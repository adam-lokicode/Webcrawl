const fs = require('fs');
const path = require('path');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const outputDir = './output';
const csvFilename = 'stanford_alumni_data.csv';

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const csvWriter = createCsvWriter({
  path: path.join(outputDir, csvFilename),
  header: [
    { id: 'name', title: 'Name' },
    { id: 'classYear', title: 'Class Year' },
    { id: 'degree', title: 'Degree' },
    { id: 'location', title: 'Location' },
    { id: 'company', title: 'Company' },
    { id: 'extractedAt', title: 'Extracted At' }
  ]
});

const testData = [
  {
    name: 'Test User',
    classYear: '2024',
    degree: 'Test Degree',
    location: 'Test Location',
    company: 'Test Company',
    extractedAt: new Date().toISOString()
  }
];

csvWriter.writeRecords(testData).then(() => {
  console.log('✅ Test CSV file written to', path.join(outputDir, csvFilename));
}); 