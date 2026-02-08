#!/usr/bin/env node
/**
 * Match Land Registry PPD transactions with EPC records to calculate £/sqft.
 * 
 * Strategy:
 * 1. Group both datasets by postcode
 * 2. Normalise addresses and match PPD PAON+Street ↔ EPC address
 * 3. Calculate price_per_sqft = price / (floor_area_m2 * 10.7639)
 * 4. Filter outliers
 * 
 * Output: cache/matched-data.json
 */

const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '../cache');
const EPC_FILE = path.join(CACHE_DIR, 'epc-london.csv');
const OUTPUT_FILE = path.join(CACHE_DIR, 'matched-data.json');

const SQM_TO_SQFT = 10.7639;

const LONDON_AREAS = [
  'E', 'EC', 'N', 'NW', 'SE', 'SW', 'W', 'WC',
  'BR', 'CR', 'DA', 'EN', 'HA', 'IG', 'KT', 'RM', 'SM', 'TW', 'UB', 'WD',
];

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
    else { current += ch; }
  }
  result.push(current);
  return result;
}

function extractDistrict(postcode) {
  if (!postcode) return null;
  const match = postcode.match(/^([A-Z]+\d+)/);
  return match ? match[1] : null;
}

function isLondonPostcode(postcode) {
  if (!postcode) return false;
  return LONDON_AREAS.some(area => postcode.startsWith(area));
}

function normaliseAddress(addr) {
  return addr
    .toUpperCase()
    .replace(/\bAPARTMENT\b/g, 'FLAT')
    .replace(/\bAPT\b/g, 'FLAT')
    .replace(/\bFLOOR\b/g, '')
    .replace(/\bGROUND\b/g, 'GND')
    .replace(/[.,'"#;:()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildPPDKey(paon, street) {
  // Build a matchable key from PPD PAON + Street
  const parts = [paon, street].filter(Boolean).map(s => s.trim());
  return normaliseAddress(parts.join(' '));
}

function buildEPCKey(address) {
  return normaliseAddress(address);
}

// Check if two address strings are a reasonable match
function addressMatch(ppdKey, epcKey) {
  if (ppdKey === epcKey) return 1.0; // Exact
  // Check if PPD key is contained in EPC address (EPC often has more detail)
  if (epcKey.includes(ppdKey) && ppdKey.length > 5) return 0.9;
  if (ppdKey.includes(epcKey) && epcKey.length > 5) return 0.9;
  return 0;
}

function loadPPD() {
  console.log('Loading PPD data...');
  const records = [];
  
  for (const year of [2024, 2025]) {
    const filePath = path.join(CACHE_DIR, `pp-${year}.csv`);
    if (!fs.existsSync(filePath)) {
      console.log(`  ⚠ Missing ${filePath}`);
      continue;
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    let count = 0;
    
    for (const line of lines) {
      if (!line.trim()) continue;
      const fields = parseCSVLine(line);
      const price = parseInt(fields[1], 10);
      const date = (fields[2] || '').replace(/"/g, '').trim();
      const postcode = (fields[3] || '').replace(/"/g, '').trim();
      const propertyType = (fields[4] || '').replace(/"/g, '').trim();
      const paon = (fields[7] || '').replace(/"/g, '').trim();
      const saon = (fields[8] || '').replace(/"/g, '').trim();
      const street = (fields[9] || '').replace(/"/g, '').trim();
      
      if (!price || price <= 0 || !postcode || !isLondonPostcode(postcode)) continue;
      
      // Build full address for matching - include SAON (secondary addressable object, e.g. flat number)
      const fullPaon = saon ? `${saon} ${paon}` : paon;
      
      records.push({
        price,
        date,
        postcode,
        propertyType, // D/S/T/F/O
        paon: fullPaon,
        street,
        key: buildPPDKey(fullPaon, street),
      });
      count++;
    }
    console.log(`  ${year}: ${count.toLocaleString()} London transactions`);
  }
  
  return records;
}

function loadEPC() {
  console.log('Loading EPC data...');
  
  if (!fs.existsSync(EPC_FILE)) {
    throw new Error(`EPC file not found: ${EPC_FILE}. Run fetch-epc.cjs first.`);
  }
  
  const content = fs.readFileSync(EPC_FILE, 'utf8');
  const lines = content.split('\n');
  const records = [];
  
  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    const fields = parseCSVLine(line);
    const postcode = (fields[0] || '').replace(/"/g, '').trim();
    const address = (fields[1] || '').replace(/"/g, '').trim();
    const floorArea = parseFloat(fields[2]);
    const propertyType = (fields[3] || '').replace(/"/g, '').trim();
    const lodgementDate = (fields[5] || '').replace(/"/g, '').trim();
    const uprn = (fields[6] || '').replace(/"/g, '').trim();
    
    if (!postcode || !floorArea || floorArea <= 0) continue;
    
    records.push({
      postcode,
      address,
      floorArea,
      propertyType,
      lodgementDate,
      uprn,
      key: buildEPCKey(address),
    });
  }
  
  console.log(`  Loaded ${records.length.toLocaleString()} EPC records`);
  return records;
}

function matchRecords(ppdRecords, epcRecords) {
  console.log('\nMatching PPD ↔ EPC records...');
  
  // Group EPC by postcode
  const epcByPostcode = new Map();
  for (const rec of epcRecords) {
    if (!epcByPostcode.has(rec.postcode)) {
      epcByPostcode.set(rec.postcode, []);
    }
    epcByPostcode.get(rec.postcode).push(rec);
  }
  
  const matched = [];
  let noEpcForPostcode = 0;
  let noAddressMatch = 0;
  let totalPPD = ppdRecords.length;
  
  for (const ppd of ppdRecords) {
    const epcList = epcByPostcode.get(ppd.postcode);
    if (!epcList) {
      noEpcForPostcode++;
      continue;
    }
    
    // Find best matching EPC record
    let bestMatch = null;
    let bestScore = 0;
    
    for (const epc of epcList) {
      const score = addressMatch(ppd.key, epc.key);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = epc;
      }
    }
    
    if (!bestMatch || bestScore < 0.9) {
      noAddressMatch++;
      continue;
    }
    
    const floorAreaSqft = bestMatch.floorArea * SQM_TO_SQFT;
    const pricePerSqft = ppd.price / floorAreaSqft;
    
    // Filter outliers
    if (pricePerSqft < 100 || pricePerSqft > 5000) continue;
    
    matched.push({
      district: extractDistrict(ppd.postcode),
      price: ppd.price,
      pricePerSqft: Math.round(pricePerSqft * 100) / 100,
      floorAreaM2: bestMatch.floorArea,
      propertyType: ppd.propertyType,
      date: ppd.date,
    });
  }
  
  console.log(`  Total PPD: ${totalPPD.toLocaleString()}`);
  console.log(`  No EPC for postcode: ${noEpcForPostcode.toLocaleString()}`);
  console.log(`  No address match: ${noAddressMatch.toLocaleString()}`);
  console.log(`  Matched (after outlier filter): ${matched.length.toLocaleString()}`);
  console.log(`  Match rate: ${(matched.length / totalPPD * 100).toFixed(1)}%`);
  
  return { matched, totalPPD };
}

function main() {
  console.log('=== PPD ↔ EPC Matching ===\n');
  
  const ppdRecords = loadPPD();
  const epcRecords = loadEPC();
  const { matched, totalPPD } = matchRecords(ppdRecords, epcRecords);
  
  // Group by district and calculate stats
  const byDistrict = new Map();
  for (const m of matched) {
    if (!m.district) continue;
    if (!byDistrict.has(m.district)) {
      byDistrict.set(m.district, { all: [], houses: [], flats: [], floorAreas: [] });
    }
    const d = byDistrict.get(m.district);
    d.all.push(m.pricePerSqft);
    d.floorAreas.push(m.floorAreaM2);
    
    if (['D', 'S', 'T'].includes(m.propertyType)) {
      d.houses.push(m.pricePerSqft);
    } else if (m.propertyType === 'F') {
      d.flats.push(m.pricePerSqft);
    }
  }
  
  // Count PPD per district for match rate
  const ppdByDistrict = new Map();
  // Re-count from matched source by re-extracting
  // Actually let's just save the matched data and let generate-prices handle stats
  
  const output = {
    totalPPD,
    totalMatched: matched.length,
    matchRate: matched.length / totalPPD,
    byDistrict: {},
  };
  
  for (const [district, data] of byDistrict) {
    output.byDistrict[district] = {
      allPricesPerSqft: data.all,
      housesPricesPerSqft: data.houses,
      flatsPricesPerSqft: data.flats,
      floorAreas: data.floorAreas,
    };
  }
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output));
  console.log(`\n✓ Written to ${OUTPUT_FILE}`);
  console.log(`  Size: ${(fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(1)}MB`);
  
  // Sample output
  console.log('\nSample districts:');
  for (const d of ['E14', 'SW3', 'NW3', 'SE1', 'W1']) {
    const data = byDistrict.get(d);
    if (data) {
      const median = calculateMedian(data.all);
      console.log(`  ${d}: median £${median}/sqft (n=${data.all.length})`);
    }
  }
}

function calculateMedian(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? Math.round(sorted[mid]) : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

main();
