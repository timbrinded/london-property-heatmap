#!/usr/bin/env node
/**
 * Fix A-Level percentages in Notion based on verification report
 */

const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');

// Get API key
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

// Schools to update with correct 2024 values
const UPDATES = [
  { name: "Alleyn's School", correct: 76 },
  { name: "Blackheath High School", correct: 53 },
  { name: "Bromley High School", correct: 56 },
  { name: "City of London School", correct: 78 },
  { name: "Croydon High School", correct: 43 },
  { name: "Dulwich College", correct: 63 },
  { name: "Forest School", correct: 57 },
  { name: "Ibstock Place School", correct: 57 },
  { name: "Lady Eleanor Holles", correct: 78 },
  { name: "Latymer Upper School", correct: 80 },
  { name: "Notting Hill & Ealing High", correct: 68 },
  { name: "Putney High School", correct: 75 },
  { name: "St Helen's Northwood", correct: 64 },
  { name: "St Dunstan's College", correct: 61 },
  { name: "University College School", correct: 72 },
  { name: "Whitgift School", correct: 59 },
  { name: "Francis Holland Sloane Sq", correct: 67 }
];

function notionRequest(urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, 'https://api.notion.com');
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

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
  
  console.log(`Found ${allResults.length} schools in database`);
  
  // Build lookup by name
  const schoolPages = {};
  for (const page of allResults) {
    const nameProp = page.properties.Name;
    const name = nameProp?.title?.[0]?.plain_text || '';
    if (name) schoolPages[name] = page.id;
  }
  
  // Process updates
  let updated = 0;
  let failed = 0;
  
  for (const update of UPDATES) {
    const pageId = schoolPages[update.name];
    if (!pageId) {
      console.log(`⚠️  Not found: ${update.name}`);
      failed++;
      continue;
    }
    
    console.log(`Updating ${update.name}: → ${update.correct}%`);
    
    const result = await notionRequest(`/v1/pages/${pageId}`, {
      method: 'PATCH',
      body: {
        properties: {
          'A Level %A*-A': {
            number: update.correct
          }
        }
      }
    });
    
    if (result.object === 'error') {
      console.log(`❌ Failed: ${update.name} - ${result.message}`);
      failed++;
    } else {
      console.log(`✅ Updated: ${update.name}`);
      updated++;
    }
    
    // Rate limit
    await sleep(350);
  }
  
  console.log(`\n📊 Summary: ${updated} updated, ${failed} failed`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
