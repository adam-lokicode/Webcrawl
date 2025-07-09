const fs = require('fs');
const path = require('path');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

async function cleanCSV() {
    const csvFilePath = './output/stanford_alumni_data.csv';
    
    if (!fs.existsSync(csvFilePath)) {
        console.log('❌ CSV file not found');
        return;
    }
    
    console.log('🧹 Cleaning CSV file...');
    
    // Read the CSV content
    const csvContent = fs.readFileSync(csvFilePath, 'utf8');
    const lines = csvContent.split('\n');
    
    const header = lines[0];
    const dataLines = lines.slice(1);
    
    console.log(`📊 Original file has ${dataLines.length} data lines`);
    
    // Filter out bad entries
    const cleanedLines = dataLines.filter(line => {
        if (!line.trim()) return false;
        
        // Extract name from first column (handle CSV escaping)
        const firstComma = line.indexOf(',');
        if (firstComma <= 0) return false;
        
        let name = line.substring(0, firstComma);
        // Remove quotes if present
        if (name.startsWith('"') && name.endsWith('"')) {
            name = name.slice(1, -1);
        }
        
        // Filter out Stanford website content and other non-alumni entries
        const isValidAlumni = !name.includes('Stanford') && 
                            !name.includes('University') && 
                            !name.includes('Alumni Directory') &&
                            !name.includes('(link is external)') &&
                            name.length < 200 && // Reasonable name length
                            !name.includes('Maps & Directions') &&
                            !name.includes('Terms of Use') &&
                            !name.includes('Emergency Info') &&
                            !name.includes('Copyright') &&
                            !name.includes('Privacy') &&
                            !name.includes('Trademarks');
        
        if (!isValidAlumni) {
            console.log(`🚫 Removing: ${name.substring(0, 50)}...`);
        }
        
        return isValidAlumni;
    });
    
    console.log(`✅ Cleaned file will have ${cleanedLines.length} data lines`);
    console.log(`🗑️ Removed ${dataLines.length - cleanedLines.length} invalid entries`);
    
    // Write cleaned CSV
    const cleanedContent = [header, ...cleanedLines].join('\n');
    fs.writeFileSync(csvFilePath, cleanedContent);
    
    console.log(`💾 Cleaned CSV saved to ${csvFilePath}`);
}

cleanCSV().catch(console.error); 