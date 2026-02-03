const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');

// Try to get API key from env or local file
let NOTION_API_KEY = process.env.NOTION_API_KEY;
if (!NOTION_API_KEY) {
  const keyPath = path.join(os.homedir(), '.config/notion/api_key');
  if (fs.existsSync(keyPath)) {
    NOTION_API_KEY = fs.readFileSync(keyPath, 'utf8').trim();
  }
}

// If no API key, skip sync (use existing data)
if (!NOTION_API_KEY) {
  console.log('⚠️  No Notion API key found - skipping sync (using existing data)');
  process.exit(0);
}

// Schools database
const DATABASE_ID = '2fa8cb56-61db-81d3-89bb-dd8a3cbddbe9';
const PUBLIC_NOTION_URL = 'https://www.notion.so/2fa8cb5661db81d389bbdd8a3cbddbe9';

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

function getRankingNumber(numericRank, rankingTier) {
  // Prefer the numeric Rank field if available
  if (numericRank !== null && numericRank > 0) {
    return numericRank;
  }
  // Fallback to tier-based ranking for legacy data
  switch (rankingTier) {
    case 'top-100': return 50;
    case 'top-200': return 150;
    case 'top-300': return 250;
    default: return 999;
  }
}

async function syncSchools() {
  console.log('📚 Fetching schools from Notion...');
  
  // Paginate through all results
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
  
  console.log(`  Found ${allResults.length} entries`);
  
  const features = allResults.map(page => {
    const props = page.properties;
    
    const getText = (prop) => {
      if (!prop) return '';
      if (prop.title) return prop.title[0]?.plain_text || '';
      if (prop.rich_text) return prop.rich_text[0]?.plain_text || '';
      return '';
    };
    
    const getSelect = (prop) => prop?.select?.name || '';
    const getNumber = (prop) => prop?.number ?? null;
    const getUrl = (prop) => prop?.url || null;
    
    const name = getText(props.Name);
    const gender = getSelect(props.Gender);
    const numericRank = getNumber(props.Rank);  // New numeric rank field
    const rankingTier = getSelect(props.Ranking);  // Legacy tier field
    const fee = getNumber(props['Annual Fee']);
    const lat = getNumber(props.Lat);
    const lng = getNumber(props.Lng);
    const website = getUrl(props.Website);
    const wikiUrl = getUrl(props.Wikipedia) || getUrl(props.Wiki) || getUrl(props['Wiki URL']);
    const founded = getNumber(props.Founded);
    const highlights = getText(props.Highlights);
    const aLevelPercent = getNumber(props['A Level %A*-A']);
    const gcsePercent = getNumber(props['GCSE %9-7']);
    
    if (!name || lat === null || lng === null) return null;
    
    // Infer gender from name if not set
    let schoolType = gender || 'co-ed';
    if (!gender) {
      const nameLower = name.toLowerCase();
      if (nameLower.includes("girls'") || nameLower.includes("girls'") || nameLower.includes(' girls')) {
        schoolType = 'girls';
      } else if (nameLower.includes("boys'") || nameLower.includes("boys'") || nameLower.includes(' boys')) {
        schoolType = 'boys';
      }
    }
    
    return {
      type: 'Feature',
      properties: {
        name,
        type: schoolType,
        ranking: getRankingNumber(numericRank, rankingTier),
        feesPerYear: fee,
        website,
        wikiUrl,
        founded,
        highlights,
        aLevelPercent,
        gcsePercent
      },
      geometry: {
        type: 'Point',
        coordinates: [lng, lat]
      }
    };
  }).filter(Boolean);
  
  // Output GeoJSON format
  const geojson = {
    type: 'FeatureCollection',
    features,
    _meta: {
      source: 'notion',
      database: DATABASE_ID,
      syncedAt: new Date().toISOString(),
      publicUrl: PUBLIC_NOTION_URL
    }
  };
  
  // Write to public folder
  fs.mkdirSync('public/data', { recursive: true });
  fs.writeFileSync('public/data/schools.json', JSON.stringify(geojson, null, 2));
  
  console.log(`✅ Synced ${features.length} schools to public/data/schools.json`);
  
  // Stats
  const byType = {};
  const byRanking = {};
  features.forEach(f => {
    byType[f.properties.type] = (byType[f.properties.type] || 0) + 1;
    const tier = f.properties.ranking <= 100 ? 'top-100' : 
                 f.properties.ranking <= 200 ? 'top-200' : 
                 f.properties.ranking <= 300 ? 'top-300' : 'other';
    byRanking[tier] = (byRanking[tier] || 0) + 1;
  });
  console.log('Types:', byType);
  console.log('Rankings:', byRanking);
  console.log(`\n📎 Public Notion link: ${PUBLIC_NOTION_URL}`);
}

syncSchools().catch(err => {
  console.error('❌ Sync failed:', err.message);
  process.exit(1);
});
