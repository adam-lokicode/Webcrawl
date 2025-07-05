# Stanford Alumni Directory Crawler

A webcrawler built with Playwright to extract data from the Stanford Alumni Directory. This tool handles authentication and provides a flexible framework for crawling alumni information.

## Features

- 🔐 **Authentication Support**: Handles login to Stanford Alumni Directory
- 🎯 **Flexible Search**: Search by name, class year, degree, and more
- 📊 **Data Extraction**: Extracts alumni information including name, class year, degree, location, and company
- 💾 **CSV Export**: Saves extracted data to CSV format
- ⚙️ **Configurable**: Customizable timeouts, delays, and output settings
- 🖥️ **Headless Mode**: Can run with or without browser UI

## Prerequisites

- Node.js (v14 or higher)
- Valid Stanford Alumni Directory credentials
- npm or yarn package manager

## Installation

1. **Clone the repository:**

   ```bash
   git clone <repository-url>
   cd stanford-alumni-crawler
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Install Playwright browsers:**

   ```bash
   npm run install-browsers
   ```

4. **Set up environment variables:**

   ```bash
   cp env.example .env
   ```

5. **Edit the `.env` file with your credentials:**
   ```env
   STANFORD_USERNAME=your_username_here
   STANFORD_PASSWORD=your_password_here
   ```

## Configuration

The crawler can be configured through environment variables in the `.env` file:

| Variable            | Description                         | Default                    |
| ------------------- | ----------------------------------- | -------------------------- |
| `STANFORD_USERNAME` | Your Stanford username/email        | Required                   |
| `STANFORD_PASSWORD` | Your Stanford password              | Required                   |
| `HEADLESS`          | Run browser in headless mode        | `false`                    |
| `SLOW_MO`           | Slow down operations (milliseconds) | `1000`                     |
| `TIMEOUT`           | Page load timeout (milliseconds)    | `30000`                    |
| `MAX_RETRIES`       | Maximum retry attempts              | `3`                        |
| `OUTPUT_DIR`        | Directory for output files          | `./output`                 |
| `CSV_FILENAME`      | Name of the CSV output file         | `stanford_alumni_data.csv` |

## Usage

### Basic Crawling

```bash
# Run the crawler with default settings
npm run crawl

# Or use the CLI directly
node src/index.js crawl
```

### Advanced Search Options

```bash
# Search by name
npm run crawl -- --name "John Doe"

# Search by class year
npm run crawl -- --year "2020"

# Search by degree
npm run crawl -- --degree "Computer Science"

# Combine multiple criteria
npm run crawl -- --name "John" --year "2020" --degree "Engineering"

# Run in headless mode
npm run crawl -- --headless

# Adjust operation speed
npm run crawl -- --slow-mo 2000
```

### Testing Login

```bash
# Test login functionality without crawling
npm run crawl -- test-login
```

### Setup Instructions

```bash
# Get setup instructions
npm run crawl -- setup
```

## Output

The crawler saves extracted data to a CSV file in the `output` directory. The CSV includes the following columns:

- **Name**: Alumni name
- **Class Year**: Graduation year
- **Degree**: Degree obtained
- **Location**: Current location
- **Company**: Current employer/organization
- **Extracted At**: Timestamp of data extraction

## File Structure

```
stanford-alumni-crawler/
├── src/
│   ├── crawler.js      # Main crawler logic
│   └── index.js        # CLI entry point
├── output/             # Generated CSV files
├── package.json        # Dependencies and scripts
├── env.example         # Environment variables template
└── README.md          # This file
```

## Customization

### Modifying Data Extraction

The crawler uses CSS selectors to extract data from the website. You may need to update the selectors in `src/crawler.js` based on the actual structure of the Stanford Alumni Directory:

```javascript
// In extractAlumniFromElement method
const name = await element.$eval(".name, .alumni-name, h3, h4", (el) =>
  el.textContent.trim()
);
const classYear = await element.$eval(
  ".class-year, .year, .graduation-year",
  (el) => el.textContent.trim()
);
// ... add more selectors as needed
```

### Adding New Search Criteria

To add new search criteria, modify the `searchAlumni` method in `src/crawler.js`:

```javascript
async searchAlumni(searchCriteria = {}) {
    // ... existing code ...

    if (searchCriteria.newField) {
        const newField = await this.page.$('input[name="newField"]');
        if (newField) {
            await newField.fill(searchCriteria.newField);
        }
    }

    // ... rest of the method
}
```

## Troubleshooting

### Common Issues

1. **Login Failed**:

   - Verify your credentials in the `.env` file
   - Check if your Stanford account has access to the alumni directory
   - Try running with `HEADLESS=false` to see what's happening

2. **No Data Extracted**:

   - The website structure may have changed
   - Update the CSS selectors in `extractAlumniFromElement` method
   - Check if the search returned any results

3. **Timeout Errors**:

   - Increase the `TIMEOUT` value in your `.env` file
   - Check your internet connection
   - The website may be slow to respond

4. **Browser Issues**:
   - Reinstall Playwright browsers: `npm run install-browsers`
   - Try running in headless mode: `--headless`

### Debug Mode

To debug issues, run the crawler with visible browser:

```bash
# Set in .env file
HEADLESS=false
SLOW_MO=2000
```

This will show you exactly what the crawler is doing and help identify issues.

## Legal and Ethical Considerations

- **Terms of Service**: Ensure you comply with Stanford's terms of service
- **Rate Limiting**: The crawler includes delays to avoid overwhelming the server
- **Data Usage**: Only use extracted data for legitimate purposes
- **Privacy**: Respect alumni privacy and data protection regulations

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Disclaimer

This tool is for educational and research purposes. Users are responsible for complying with all applicable laws, terms of service, and ethical guidelines when using this crawler.
