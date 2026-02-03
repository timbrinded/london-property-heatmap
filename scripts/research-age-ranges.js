#!/usr/bin/env bun
/**
 * Researches age ranges for schools by fetching their websites.
 * Updates Notion with findings. Marks as "Unknown" if not found.
 * 
 * Run: bun run scripts/research-age-ranges.js
 */

const fs = require('fs');
const https = require('https');
const http = require('http');
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

// Known age ranges for schools (fallback/override data)
const KNOWN_AGE_RANGES = {
  // Senior schools (typically 11-18)
  "Westminster School": "13-18",
  "Eton College": "13-18",
  "Harrow School": "13-18",
  "St Paul's School": "13-18",
  "King's College School": "7-18",
  
  // Girls' schools
  "St Paul's Girls' School": "11-18",
  "North London Collegiate": "4-18",
  "City of London School for Girls": "7-18",
  "Godolphin & Latymer": "11-18",
  "South Hampstead High": "4-18",
  
  // Prep schools
  "Thomas's Battersea": "4-13",
  "Thomas's Kensington": "4-11",
  "Wetherby School": "4-8",
  "Sussex House School": "8-13",
  "Garden House School": "3-11",
  "Falkner House": "4-11",
  "Pembridge Hall": "4-11",
  "Glendower Prep": "4-11",
  "Hill House School": "4-13",
  "Eaton House Schools": "4-13",
  "Cameron House School": "4-11",
  
  // Sixth form colleges
  "DLD College London": "14-19",
  "MPW London": "14-19",
  "Ashbourne College": "14-19",
  "Chelsea Independent College": "14-19",
  "Collingham College": "14-19",
  "Lansdowne College": "14-19",
  "David Game College": "14-19",
  "Cardiff Sixth Form College": "14-19",
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

async function fetchWebsite(url, maxRedirects = 3) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), 10000);
    
    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SchoolResearchBot/1.0)',
        'Accept': 'text/html',
      },
      timeout: 8000,
    }, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && maxRedirects > 0) {
        clearTimeout(timeout);
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http')) {
          const base = new URL(url);
          redirectUrl = base.origin + redirectUrl;
        }
        resolve(fetchWebsite(redirectUrl, maxRedirects - 1));
        return;
      }
      
      if (res.statusCode !== 200) {
        clearTimeout(timeout);
        resolve(null);
        return;
      }
      
      let data = '';
      res.on('data', chunk => {
        data += chunk;
        // Limit to first 200KB
        if (data.length > 200000) {
          res.destroy();
        }
      });
      res.on('end', () => {
        clearTimeout(timeout);
        resolve(data);
      });
      res.on('error', () => {
        clearTimeout(timeout);
        resolve(null);
      });
    });
    
    req.on('error', () => {
      clearTimeout(timeout);
      resolve(null);
    });
    
    req.on('timeout', () => {
      req.destroy();
      clearTimeout(timeout);
      resolve(null);
    });
  });
}

function extractAgeRange(html, schoolName) {
  if (!html) return null;
  
  // Clean HTML - remove scripts, styles, etc.
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
  
  // Age range patterns (ordered by specificity)
  const patterns = [
    // "ages 4-18", "ages 4 to 18", "aged 4-18"
    /ages?\s*(\d{1,2})\s*[-–to]+\s*(\d{1,2})/i,
    // "4-18 years", "4 to 18 years"
    /(\d{1,2})\s*[-–to]+\s*(\d{1,2})\s*years?\s*(old)?/i,
    // "for pupils aged 4-18", "students aged 11-18"
    /(pupils?|students?|children|boys|girls)\s*(aged?|from)?\s*(\d{1,2})\s*[-–to]+\s*(\d{1,2})/i,
    // "from age 4 to 18", "from 4 to 18"
    /from\s*(age)?\s*(\d{1,2})\s*(to|[-–])\s*(\d{1,2})/i,
    // "nursery through sixth form" patterns with numbers
    /(\d{1,2})\s*months?\s*[-–to]+\s*(\d{1,2})\s*years?/i,
    // Years group patterns "reception to year 13"
    /reception.*year\s*(\d{1,2})/i,
    /year\s*(\d{1,2}).*year\s*(\d{1,2})/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      // Extract the two numbers from the match
      const numbers = match.slice(1).filter(n => n && /^\d+$/.test(n)).map(Number);
      if (numbers.length >= 2) {
        const [start, end] = [Math.min(...numbers), Math.max(...numbers)];
        if (start >= 2 && start <= 16 && end >= 8 && end <= 19 && end > start) {
          return `${start}-${end}`;
        }
      }
    }
  }
  
  // Check for school type keywords
  if (text.includes('sixth form college') || text.includes('tutorial college')) {
    return '14-19';
  }
  if (text.includes('prep school') || text.includes('preparatory school')) {
    // Check for specific ages
    const prepMatch = text.match(/(\d{1,2})\s*[-–to]+\s*(\d{1,2})/);
    if (prepMatch) {
      const start = parseInt(prepMatch[1]);
      const end = parseInt(prepMatch[2]);
      if (start >= 3 && end <= 14) return `${start}-${end}`;
    }
    return '4-13'; // Default prep age range
  }
  if (text.includes('senior school') && !text.includes('prep')) {
    return '11-18';
  }
  
  return null;
}

async function researchSchools() {
  console.log('📚 Fetching schools from Notion...\n');
  
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
  
  console.log(`Found ${allResults.length} schools to research\n`);
  
  let found = 0;
  let notFound = 0;
  let skipped = 0;
  
  for (const page of allResults) {
    const props = page.properties;
    const name = props.Name?.title?.[0]?.plain_text || '';
    const website = props.Website?.url || '';
    const existingAgeRange = props['Age Range']?.rich_text?.[0]?.plain_text || '';
    
    if (!name) continue;
    
    // Skip if already has age range
    if (existingAgeRange && existingAgeRange !== 'Unknown') {
      console.log(`⏭️  ${name}: already has "${existingAgeRange}"`);
      skipped++;
      continue;
    }
    
    let ageRange = null;
    
    // Check known data first
    if (KNOWN_AGE_RANGES[name]) {
      ageRange = KNOWN_AGE_RANGES[name];
      console.log(`📋 ${name}: ${ageRange} (from known data)`);
    } else if (website) {
      // Fetch and parse website
      process.stdout.write(`🔍 ${name}... `);
      const html = await fetchWebsite(website);
      
      if (html) {
        ageRange = extractAgeRange(html, name);
        if (ageRange) {
          console.log(`✓ ${ageRange}`);
        } else {
          console.log(`✗ not found on website`);
        }
      } else {
        console.log(`✗ website fetch failed`);
      }
    }
    
    // Update Notion
    const finalValue = ageRange || 'Unknown';
    
    await notionRequest(`/v1/pages/${page.id}`, {
      method: 'PATCH',
      body: {
        properties: {
          'Age Range': {
            rich_text: [{ text: { content: finalValue } }]
          }
        }
      }
    });
    
    if (ageRange) {
      found++;
    } else {
      notFound++;
    }
    
    // Rate limit
    await new Promise(r => setTimeout(r, 400));
  }
  
  console.log(`\n✅ Complete!`);
  console.log(`   Found: ${found}`);
  console.log(`   Unknown: ${notFound}`);
  console.log(`   Skipped: ${skipped}`);
}

researchSchools().catch(err => {
  console.error('❌ Failed:', err.message);
  process.exit(1);
});
