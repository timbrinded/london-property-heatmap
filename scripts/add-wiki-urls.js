// Add Wikipedia URLs to schools in Notion
// This script:
// 1. Adds a Wikipedia URL column if it doesn't exist
// 2. Populates it with likely Wikipedia article URLs based on school names

const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');

let NOTION_API_KEY = process.env.NOTION_API_KEY;
if (!NOTION_API_KEY) {
  const keyPath = path.join(os.homedir(), '.config/notion/api_key');
  if (fs.existsSync(keyPath)) {
    NOTION_API_KEY = fs.readFileSync(keyPath, 'utf8').trim();
  }
}

if (!NOTION_API_KEY) {
  console.error('❌ No Notion API key found');
  process.exit(1);
}

const DATABASE_ID = '2fa8cb56-61db-81d3-89bb-dd8a3cbddbe9';

function notionRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, 'https://api.notion.com');
    const req = https.request(url, {
      method: options.method || 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_API_KEY}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Parse error: ${data}`));
        }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

// Convert school name to likely Wikipedia article title
function schoolNameToWikiTitle(name) {
  // Clean up common patterns
  let title = name
    .replace(/'/g, "'")  // Normalize apostrophes
    .replace(/\s+/g, '_')  // Spaces to underscores
    .replace(/['']/g, "'");  // More apostrophe normalization
  
  // Handle common abbreviations
  const expansions = {
    "St_": "St_",
    "St._": "Saint_",
  };
  
  return title;
}

// Check if Wikipedia article exists
async function checkWikiExists(title) {
  return new Promise((resolve) => {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    https.get(url, { headers: { 'User-Agent': 'SchoolDataUpdater/1.0' } }, (res) => {
      resolve(res.statusCode === 200);
    }).on('error', () => resolve(false));
  });
}

async function main() {
  console.log('📚 Fetching schools from Notion...');
  
  // Get all pages
  let allResults = [];
  let hasMore = true;
  let startCursor = undefined;
  
  while (hasMore) {
    const body = startCursor ? { start_cursor: startCursor } : {};
    const response = await notionRequest(`/v1/databases/${DATABASE_ID}/query`, { body });
    if (response.object === 'error') {
      console.error('❌ Notion error:', response.message);
      process.exit(1);
    }
    allResults = allResults.concat(response.results);
    hasMore = response.has_more;
    startCursor = response.next_cursor;
  }
  
  console.log(`Found ${allResults.length} schools`);
  
  // Process each school
  let updated = 0;
  let skipped = 0;
  let notFound = 0;
  
  for (const page of allResults) {
    const name = page.properties.Name?.title?.[0]?.plain_text;
    if (!name) continue;
    
    // Check if Wikipedia URL already exists
    const existingWiki = page.properties.Wikipedia?.url;
    if (existingWiki) {
      skipped++;
      continue;
    }
    
    // Generate likely Wikipedia URL
    const wikiTitle = schoolNameToWikiTitle(name);
    const wikiUrl = `https://en.wikipedia.org/wiki/${wikiTitle}`;
    
    // Verify it exists
    const exists = await checkWikiExists(wikiTitle);
    
    if (exists) {
      // Update the page
      try {
        await notionRequest(`/v1/pages/${page.id}`, {
          method: 'PATCH',
          body: {
            properties: {
              Wikipedia: {
                url: wikiUrl
              }
            }
          }
        });
        console.log(`✅ ${name} → ${wikiUrl}`);
        updated++;
      } catch (err) {
        console.log(`❌ Failed to update ${name}: ${err.message}`);
      }
    } else {
      console.log(`⚠️  ${name} → No Wikipedia article found for "${wikiTitle}"`);
      notFound++;
    }
    
    // Rate limit
    await new Promise(r => setTimeout(r, 100));
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped (already had URL): ${skipped}`);
  console.log(`  Not found on Wikipedia: ${notFound}`);
}

main().catch(console.error);
