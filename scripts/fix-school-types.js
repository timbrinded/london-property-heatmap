// Fix school types in Notion based on Wikipedia verification
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

// Manual overrides for known schools (verified from Wikipedia/websites)
const VERIFIED_TYPES = {
  // Girls' schools
  'Blackheath High School': 'girls',
  'North London Collegiate': 'girls',
  'Wimbledon High School': 'girls',
  'Croydon High School': 'girls',
  'Channing School': 'girls',
  'Putney High School': 'girls',
  'St Augustine\'s Priory': 'girls',
  'Northwood College': 'girls',
  'City of London School for Girls': 'girls',
  'South Hampstead High': 'girls',
  'Bromley High School': 'girls',
  'Sydenham High School': 'girls',
  'Streatham & Clapham High': 'girls',
  'Notting Hill & Ealing High': 'girls',
  'Lady Eleanor Holles': 'girls',
  'Francis Holland Sloane Sq': 'girls',
  'Francis Holland Regent\'s Pk': 'girls',
  "Queen's College London": 'girls',
  'St Helen\'s Northwood': 'girls',
  'Haberdashers\' Girls': 'girls',
  'James Allen\'s Girls\'': 'girls',
  'Godolphin & Latymer': 'girls',
  'St Paul\'s Girls\' School': 'girls',
  'More House School': 'girls',
  'Pembridge Hall': 'girls',
  'Glendower Prep': 'girls',
  'Falkner House': 'girls',
  'The Cavendish School': 'girls',
  'St James Senior Girls': 'girls',
  'Surbiton High School': 'girls',
  
  // Boys' schools  
  'Eton College': 'boys',
  'Dulwich College': 'boys',
  'Harrow School': 'boys',
  'Wetherby School': 'boys',
  'City of London School': 'boys',
  'St Paul\'s School': 'boys',
  'Hampton School': 'boys',
  'Whitgift School': 'boys',
  'Merchant Taylors\' School': 'boys',
  'Haberdashers\' Boys': 'boys',
  'Eaton House Schools': 'boys',
  'Sussex House School': 'boys',
  'St James Senior Boys': 'boys',
  
  // Co-ed schools (verified)
  'King\'s College School': 'co-ed',
  'Westminster School': 'co-ed',
  'Latymer Upper School': 'co-ed',
  'Alleyn\'s School': 'co-ed',  // Actually co-ed, Wikipedia was misleading
  'Highgate School': 'co-ed',
  'University College School': 'co-ed',
  'Kingston Grammar School': 'co-ed',  // Actually co-ed since 1978
  'Trinity School Croydon': 'co-ed',
  'Emanuel School': 'co-ed',
  'Bancroft\'s School': 'co-ed',
  'Eltham College': 'co-ed',
  'Colfe\'s School': 'co-ed',
  'St Dunstan\'s College': 'co-ed',
  'Ibstock Place School': 'co-ed',
  'Forest School': 'co-ed',
  'Mill Hill School': 'co-ed',
  'Hill House School': 'co-ed',  // Actually co-ed prep school
  'Knightsbridge School': 'co-ed',  // Actually co-ed
};

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

async function main() {
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
  
  console.log(`Found ${allResults.length} schools\n`);
  
  let updated = 0;
  let skipped = 0;
  
  for (const page of allResults) {
    const name = page.properties.Name?.title?.[0]?.plain_text;
    if (!name) continue;
    
    const currentType = page.properties.Gender?.select?.name || 'co-ed';
    const verifiedType = VERIFIED_TYPES[name];
    
    if (!verifiedType) {
      skipped++;
      continue;
    }
    
    if (currentType === verifiedType) {
      console.log(`✓ ${name} - already correct (${currentType})`);
      continue;
    }
    
    // Update the type
    try {
      await notionRequest(`/v1/pages/${page.id}`, {
        method: 'PATCH',
        body: {
          properties: {
            Gender: {
              select: { name: verifiedType }
            }
          }
        }
      });
      console.log(`✅ ${name}: ${currentType} → ${verifiedType}`);
      updated++;
    } catch (err) {
      console.log(`❌ Failed to update ${name}: ${err.message}`);
    }
    
    await new Promise(r => setTimeout(r, 100));
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Already correct: ${allResults.length - updated - skipped}`);
  console.log(`  Not in verified list: ${skipped}`);
}

main().catch(console.error);
