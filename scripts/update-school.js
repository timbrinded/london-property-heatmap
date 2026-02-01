const https = require('https');
const os = require('os');
const path = require('path');
const fs = require('fs');

// Get API key
let NOTION_API_KEY = process.env.NOTION_API_KEY;
if (!NOTION_API_KEY) {
  const keyPath = path.join(os.homedir(), '.config/notion/api_key');
  if (fs.existsSync(keyPath)) {
    NOTION_API_KEY = fs.readFileSync(keyPath, 'utf8').trim();
  }
}

if (!NOTION_API_KEY) {
  console.error('No NOTION_API_KEY found');
  process.exit(1);
}

const DATABASE_ID = '2fa8cb56-61db-81d3-89bb-dd8a3cbddbe9';

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

async function findSchoolPage(schoolName) {
  const response = await notionRequest(`/v1/databases/${DATABASE_ID}/query`, {
    body: {
      filter: {
        property: 'Name',
        title: { equals: schoolName }
      }
    }
  });
  
  if (response.results && response.results.length > 0) {
    return response.results[0].id;
  }
  return null;
}

async function updateSchool(schoolName, updates) {
  const pageId = await findSchoolPage(schoolName);
  if (!pageId) {
    console.error(`❌ School not found: ${schoolName}`);
    return false;
  }
  
  const properties = {};
  
  if (updates.website) {
    properties.Website = { url: updates.website };
  }
  if (updates.image) {
    properties.Image = { url: updates.image };
  }
  if (updates.founded) {
    properties.Founded = { number: updates.founded };
  }
  if (updates.highlights) {
    properties.Highlights = { 
      rich_text: [{ text: { content: updates.highlights } }]
    };
  }
  if (updates.aLevel !== undefined) {
    properties['A Level %A*-A'] = { number: updates.aLevel };
  }
  if (updates.gcse !== undefined) {
    properties['GCSE %9-7'] = { number: updates.gcse };
  }
  if (updates.fee !== undefined) {
    properties['Annual Fee'] = { number: updates.fee };
  }
  
  const response = await notionRequest(`/v1/pages/${pageId}`, {
    method: 'PATCH',
    body: { properties }
  });
  
  if (response.object === 'error') {
    console.error(`❌ Failed to update ${schoolName}:`, response.message);
    return false;
  }
  
  console.log(`✅ Updated ${schoolName}`);
  return true;
}

// Usage: bun run scripts/update-school.js "School Name" '{"website":"url","founded":1850,...}'
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: bun run scripts/update-school.js "School Name" \'{"website":"...","founded":1850,...}\'');
  process.exit(1);
}

const schoolName = args[0];
const updates = JSON.parse(args[1]);

updateSchool(schoolName, updates).then(success => {
  process.exit(success ? 0 : 1);
});
