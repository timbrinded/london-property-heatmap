// Verify school types (boys/girls/co-ed) against Wikipedia data
// This script checks each school's Wikipedia page and verifies the gender type

const fs = require('fs');
const https = require('https');

const schoolsData = JSON.parse(fs.readFileSync('public/data/schools.json', 'utf8'));

async function getWikipediaSummary(title) {
  return new Promise((resolve) => {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    https.get(url, { headers: { 'User-Agent': 'SchoolVerifier/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

function detectGenderFromText(text) {
  const lower = text.toLowerCase();
  
  // Strong indicators
  if (lower.includes('girls\' school') || lower.includes('girls school') || 
      lower.includes('all-girls') || lower.includes('for girls') ||
      lower.includes('girls only') || lower.includes('female students only')) {
    return 'girls';
  }
  if (lower.includes('boys\' school') || lower.includes('boys school') || 
      lower.includes('all-boys') || lower.includes('for boys') ||
      lower.includes('boys only') || lower.includes('male students only')) {
    return 'boys';
  }
  if (lower.includes('co-educational') || lower.includes('coeducational') ||
      lower.includes('co-ed') || lower.includes('boys and girls')) {
    return 'co-ed';
  }
  
  return null; // Unknown
}

async function main() {
  console.log('🔍 Verifying school types against Wikipedia...\n');
  
  const issues = [];
  const verified = [];
  const noWiki = [];
  
  for (const feature of schoolsData.features) {
    const { name, type, wikiUrl } = feature.properties;
    
    if (!wikiUrl) {
      noWiki.push({ name, currentType: type });
      continue;
    }
    
    // Extract title from wiki URL
    const match = wikiUrl.match(/\/wiki\/([^#?]+)/);
    if (!match) {
      noWiki.push({ name, currentType: type });
      continue;
    }
    
    const title = decodeURIComponent(match[1]);
    const wiki = await getWikipediaSummary(title);
    
    if (!wiki || wiki.type === 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found') {
      noWiki.push({ name, currentType: type, wikiUrl });
      continue;
    }
    
    // Check description and extract
    const fullText = `${wiki.description || ''} ${wiki.extract || ''}`;
    const detectedType = detectGenderFromText(fullText);
    
    if (detectedType && detectedType !== type) {
      issues.push({
        name,
        currentType: type,
        detectedType,
        wikiUrl,
        description: wiki.description || '(no description)',
      });
    } else if (detectedType) {
      verified.push({ name, type });
    } else {
      // Couldn't detect - might need manual check
      noWiki.push({ name, currentType: type, wikiUrl, description: wiki.description });
    }
    
    // Rate limit
    await new Promise(r => setTimeout(r, 100));
  }
  
  console.log('❌ MISMATCHES FOUND:\n');
  for (const issue of issues) {
    console.log(`  ${issue.name}`);
    console.log(`    Current: ${issue.currentType} → Should be: ${issue.detectedType}`);
    console.log(`    Wikipedia: "${issue.description}"`);
    console.log(`    URL: ${issue.wikiUrl}\n`);
  }
  
  console.log(`\n✅ Verified correct: ${verified.length}`);
  console.log(`❌ Mismatches: ${issues.length}`);
  console.log(`⚠️  Could not verify: ${noWiki.length}`);
  
  if (issues.length > 0) {
    // Output JSON for fixing
    fs.writeFileSync('school-type-fixes.json', JSON.stringify(issues, null, 2));
    console.log('\n📝 Fixes saved to school-type-fixes.json');
  }
}

main().catch(console.error);
