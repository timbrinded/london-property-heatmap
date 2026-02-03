#!/usr/bin/env bun
/**
 * Updates Notion with age ranges from age-ranges-data.json
 */

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

// Load age ranges data
const ageData = require('./age-ranges-data.json');
const AGE_RANGES = ageData.ageRanges;

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

async function updateAgeRanges() {
  console.log('📚 Fetching schools from Notion...');
  
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
  
  console.log(`  Found ${allResults.length} schools\n`);
  
  let updated = 0;
  let notFound = [];
  
  for (const page of allResults) {
    const props = page.properties;
    const name = props.Name?.title?.[0]?.plain_text || '';
    
    if (!name) continue;
    
    const ageRange = AGE_RANGES[name];
    
    if (ageRange) {
      console.log(`  ✓ ${name} → ${ageRange}`);
      
      await notionRequest(`/v1/pages/${page.id}`, {
        method: 'PATCH',
        body: {
          properties: {
            'Age Range': {
              rich_text: [{ text: { content: ageRange } }]
            }
          }
        }
      });
      
      updated++;
      await new Promise(r => setTimeout(r, 350));
    } else {
      notFound.push(name);
    }
  }
  
  console.log(`\n✅ Updated ${updated} schools with age ranges`);
  
  if (notFound.length > 0) {
    console.log(`\n⚠️  No age range data for ${notFound.length} schools:`);
    notFound.forEach(n => console.log(`   - ${n}`));
  }
}

updateAgeRanges().catch(err => {
  console.error('❌ Failed:', err.message);
  process.exit(1);
});
