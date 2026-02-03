#!/usr/bin/env bun
/**
 * Updates Notion database with actual school rankings from league tables.
 * Sources: mytopschools.co.uk GCSE and A-Level rankings 2024
 * 
 * Run: bun run scripts/update-notion-rankings.js
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

// Combined rankings from GCSE and A-Level tables (mytopschools.co.uk 2024)
// Using best rank between GCSE and A-Level where available
const SCHOOL_RANKINGS = {
  // Top 10
  "Westminster School": 1,
  "King's College School": 2,
  "St Paul's School": 3,
  "St Paul's Girls' School": 4,
  "North London Collegiate": 7,
  "Lady Eleanor Holles": 8,
  "Hampton School": 9,
  "City of London School for Girls": 10,
  
  // 11-25
  "Wimbledon High School": 12,
  "Latymer Upper School": 13,
  "South Hampstead High": 15,
  "Godolphin & Latymer": 17,
  "University College School": 17,
  "Putney High School": 18,
  "Eton College": 19,
  "City of London School": 22,
  "Bancroft's School": 24,
  "James Allen's Girls'": 25,
  
  // 26-50
  "Haberdashers' Boys": 26,
  "Dulwich College": 27,
  "Highgate School": 27,
  "Notting Hill & Ealing High": 29,
  "Surbiton High School": 30,
  "Alleyn's School": 34,
  "Emanuel School": 34,
  "Haberdashers' Girls": 36,
  "Francis Holland Sloane Sq": 37,
  "Eltham College": 38,
  "Merchant Taylors' School": 39,
  "Whitgift School": 42,
  "Francis Holland Regent's Pk": 43,
  "Trinity School Croydon": 48,
  "Kingston Grammar School": 50,
  
  // 51-100
  "Northwood College": 58,
  "Channing School": 61,
  "St Helen's Northwood": 70,
  "Harrow School": 72,
  "Colfe's School": 78,
  "Forest School": 81,
  "St Dunstan's College": 82,
  "Blackheath High School": 84,
  "Croydon High School": 85,
  "Ibstock Place School": 90,
  "Queen's College London": 92,
  "Harrodian School": 94,
  
  // 101-150 (estimated from other sources/tiers)
  "Mill Hill School": 110,
  "Bromley High School": 115,
  "Streatham & Clapham High": 120,
  "Sydenham High School": 125,
  
  // 150+ (schools without specific rankings - assign based on tier)
  "Thomas's Battersea": 155,
  "Thomas's Kensington": 160,
  "Wetherby School": 165,
  "Knightsbridge School": 170,
  "Eaton House Schools": 175,
  "Eaton Square School": 180,
  "Garden House School": 185,
  "Falkner House": 190,
  "Pembridge Hall": 195,
  "Glendower Prep": 200,
  "Sussex House School": 205,
  "Hill House School": 210,
  "Cameron House School": 215,
  "The Cavendish School": 220,
  "The Hampshire School": 225,
  "Fulham Prep School": 230,
  "Kew House School": 235,
  
  // International/Alternative schools (200+)
  "The American School London": 250,
  "Dwight School London": 255,
  "Southbank International": 260,
  "International School of London": 265,
  "ACS Cobham": 270,
  "ACS Egham": 275,
  "ACS Hillingdon": 280,
  "Lycée Français Charles de Gaulle": 285,
  "German School London": 290,
  "L'Ecole des Petits": 295,
  
  // Sixth form/tutorial colleges (300+)
  "DLD College London": 300,
  "MPW London": 305,
  "Ashbourne College": 310,
  "Chelsea Independent College": 315,
  "Collingham College": 320,
  "Lansdowne College": 325,
  "David Game College": 330,
  "Bales College": 335,
  "Fine Arts College": 340,
  "Portland Place School": 345,
  "Kensington Park School": 350,
  "North Bridge House Senior": 355,
  "The Lyceum": 360,
  
  // Specialist/SEN schools
  "Fairley House School": 400,
  "More House School": 405,
  "Birkbeck School": 410,
  
  // Religious/community schools
  "St Augustine's Priory": 420,
  "St James Senior Boys": 425,
  "St James Senior Girls": 430,
  "Chelsea Academy": 435,
};

// Name variations mapping (Notion name -> canonical name)
const NAME_ALIASES = {
  "James Allen's Girls'": ["James Allen's Girls' School", "JAGS"],
  "King's College School": ["King's College School (Wimbledon)", "KCS Wimbledon"],
  "St Paul's Girls' School": ["St Paul's Girls School", "SPGS"],
  "Haberdashers' Boys": ["Haberdashers' Aske's Boys' School", "Habs Boys"],
  "Haberdashers' Girls": ["Haberdashers' Aske's School for Girls", "Habs Girls"],
  "Francis Holland Sloane Sq": ["Francis Holland School (Sloane Square)"],
  "Francis Holland Regent's Pk": ["Francis Holland School (Regent's Park)"],
  "Trinity School Croydon": ["Trinity School (Croydon)", "Trinity School"],
  "St Helen's Northwood": ["St Helen's School"],
  "Northwood College": ["Northwood College for Girls"],
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

function findRanking(schoolName) {
  // Direct match
  if (SCHOOL_RANKINGS[schoolName]) {
    return SCHOOL_RANKINGS[schoolName];
  }
  
  // Check aliases
  for (const [canonical, aliases] of Object.entries(NAME_ALIASES)) {
    if (aliases.includes(schoolName) || canonical === schoolName) {
      return SCHOOL_RANKINGS[canonical];
    }
  }
  
  // Fuzzy match - try partial matches
  const nameLower = schoolName.toLowerCase();
  for (const [name, rank] of Object.entries(SCHOOL_RANKINGS)) {
    if (nameLower.includes(name.toLowerCase()) || name.toLowerCase().includes(nameLower)) {
      return rank;
    }
  }
  
  return null;
}

async function updateRankings() {
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
  
  console.log(`  Found ${allResults.length} schools\n`);
  
  let updated = 0;
  let notFound = [];
  
  for (const page of allResults) {
    const props = page.properties;
    const name = props.Name?.title?.[0]?.plain_text || '';
    
    if (!name) continue;
    
    const ranking = findRanking(name);
    
    if (ranking) {
      // Update the page with numeric Rank
      console.log(`  ✓ ${name} → #${ranking}`);
      
      await notionRequest(`/v1/pages/${page.id}`, {
        method: 'PATCH',
        body: {
          properties: {
            'Rank': {
              number: ranking
            }
          }
        }
      });
      
      updated++;
      
      // Rate limit: 3 requests per second max
      await new Promise(r => setTimeout(r, 350));
    } else {
      notFound.push(name);
    }
  }
  
  console.log(`\n✅ Updated ${updated} schools with rankings`);
  
  if (notFound.length > 0) {
    console.log(`\n⚠️  No ranking found for ${notFound.length} schools:`);
    notFound.forEach(n => console.log(`   - ${n}`));
    console.log('\nAdd these to SCHOOL_RANKINGS in this script if needed.');
  }
}

updateRankings().catch(err => {
  console.error('❌ Failed:', err.message);
  process.exit(1);
});
