#!/usr/bin/env bun
/**
 * Build £/sqft data using SQLite for efficient matching.
 * 
 * 1. Extract EPC data from cached borough zips → SQLite
 * 2. Import Land Registry PPD data → SQLite  
 * 3. Match by postcode + normalised address
 * 4. Calculate £/sqft per postcode district
 * 5. Output prices-sqft.json
 * 
 * Uses bun:sqlite (built-in, no deps needed).
 */

import { Database } from 'bun:sqlite';
import { execSync, spawnSync } from 'child_process';
import { existsSync, statSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';

const SCRIPT_DIR = dirname(import.meta.path);
const ROOT_DIR = join(SCRIPT_DIR, '..');
const CACHE_DIR = join(ROOT_DIR, 'cache');
const EPC_CACHE_DIR = join(CACHE_DIR, 'epc');
const DATA_DIR = join(ROOT_DIR, 'public', 'data');
const DB_PATH = join(CACHE_DIR, 'property-data.sqlite');

const BASELINE_DISTRICT = 'E14';

// London postcode areas
const LONDON_AREAS = ['E', 'EC', 'N', 'NW', 'SE', 'SW', 'W', 'WC', 'BR', 'CR', 'DA', 'EN', 'HA', 'IG', 'KT', 'RM', 'SM', 'TW', 'UB', 'WD'];

const LONDON_BOROUGHS = [
  { code: 'E09000001', name: 'City-of-London' },
  { code: 'E09000002', name: 'Barking-and-Dagenham' },
  { code: 'E09000003', name: 'Barnet' },
  { code: 'E09000004', name: 'Bexley' },
  { code: 'E09000005', name: 'Brent' },
  { code: 'E09000006', name: 'Bromley' },
  { code: 'E09000007', name: 'Camden' },
  { code: 'E09000008', name: 'Croydon' },
  { code: 'E09000009', name: 'Ealing' },
  { code: 'E09000010', name: 'Enfield' },
  { code: 'E09000011', name: 'Greenwich' },
  { code: 'E09000012', name: 'Hackney' },
  { code: 'E09000013', name: 'Hammersmith-and-Fulham' },
  { code: 'E09000014', name: 'Haringey' },
  { code: 'E09000015', name: 'Harrow' },
  { code: 'E09000016', name: 'Havering' },
  { code: 'E09000017', name: 'Hillingdon' },
  { code: 'E09000018', name: 'Hounslow' },
  { code: 'E09000019', name: 'Islington' },
  { code: 'E09000020', name: 'Kensington-and-Chelsea' },
  { code: 'E09000021', name: 'Kingston-upon-Thames' },
  { code: 'E09000022', name: 'Lambeth' },
  { code: 'E09000023', name: 'Lewisham' },
  { code: 'E09000024', name: 'Merton' },
  { code: 'E09000025', name: 'Newham' },
  { code: 'E09000026', name: 'Redbridge' },
  { code: 'E09000027', name: 'Richmond-upon-Thames' },
  { code: 'E09000028', name: 'Southwark' },
  { code: 'E09000029', name: 'Sutton' },
  { code: 'E09000030', name: 'Tower-Hamlets' },
  { code: 'E09000031', name: 'Waltham-Forest' },
  { code: 'E09000032', name: 'Wandsworth' },
  { code: 'E09000033', name: 'Westminster' },
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

function normaliseAddress(addr) {
  return addr
    .toUpperCase()
    .replace(/[.,'"#]/g, '')
    .replace(/\bFLAT\b/g, '')
    .replace(/\bAPARTMENT\b/g, '')
    .replace(/\bAPT\b/g, '')
    .replace(/\bUNIT\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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

function initDB(db) {
  db.exec('PRAGMA journal_mode=WAL');
  db.exec('PRAGMA synchronous=NORMAL');
  db.exec('PRAGMA cache_size=-200000'); // 200MB cache
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS epc (
      postcode TEXT NOT NULL,
      address_norm TEXT NOT NULL,
      total_floor_area REAL NOT NULL,
      property_type TEXT,
      built_form TEXT,
      lodgement_date TEXT,
      uprn TEXT
    );
    
    CREATE TABLE IF NOT EXISTS ppd (
      price INTEGER NOT NULL,
      transaction_date TEXT NOT NULL,
      postcode TEXT NOT NULL,
      property_type TEXT,
      paon TEXT,
      saon TEXT,
      street TEXT,
      address_norm TEXT NOT NULL,
      district TEXT NOT NULL
    );
    
    CREATE TABLE IF NOT EXISTS matched (
      price INTEGER NOT NULL,
      total_floor_area REAL NOT NULL,
      price_per_sqft REAL NOT NULL,
      district TEXT NOT NULL,
      ppd_property_type TEXT,
      epc_property_type TEXT
    );
  `);
}

function importEPC(db) {
  const count = db.query('SELECT COUNT(*) as c FROM epc').get().c;
  if (count > 0) {
    console.log(`EPC table already has ${count.toLocaleString()} records, skipping import`);
    return;
  }

  console.log('\n=== Importing EPC data ===');
  
  const insert = db.prepare(`INSERT INTO epc (postcode, address_norm, total_floor_area, property_type, built_form, lodgement_date, uprn) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  
  let totalRecords = 0;
  
  for (const borough of LONDON_BOROUGHS) {
    const zipPath = join(EPC_CACHE_DIR, `${borough.code}.zip`);
    if (!existsSync(zipPath)) {
      console.log(`  ✗ ${borough.name}: zip not found`);
      continue;
    }
    
    // Extract certificates.csv from zip
    let csv;
    try {
      const result = spawnSync('unzip', ['-p', zipPath, 'certificates.csv'], {
        maxBuffer: 500 * 1024 * 1024,
        encoding: 'utf8',
      });
      csv = result.stdout;
      if (!csv || csv.length < 100) {
        console.log(`  ✗ ${borough.name}: empty extract`);
        continue;
      }
    } catch {
      console.log(`  ✗ ${borough.name}: extract failed`);
      continue;
    }
    
    const lines = csv.split('\n');
    
    // Parse header
    const headers = parseCSVLine(lines[0]);
    const headerMap = {};
    headers.forEach((h, i) => { headerMap[h.trim().toUpperCase().replace(/-/g, '_')] = i; });
    
    const iPostcode = headerMap['POSTCODE'];
    const iAddr1 = headerMap['ADDRESS1'];
    const iAddr2 = headerMap['ADDRESS2'];
    const iAddr3 = headerMap['ADDRESS3'];
    const iFloorArea = headerMap['TOTAL_FLOOR_AREA'];
    const iPropType = headerMap['PROPERTY_TYPE'];
    const iBuiltForm = headerMap['BUILT_FORM'];
    const iLodgementDate = headerMap['LODGEMENT_DATE'];
    const iUprn = headerMap['UPRN'];
    
    if (iPostcode === undefined || iFloorArea === undefined) {
      console.log(`  ✗ ${borough.name}: missing columns`);
      continue;
    }
    
    let boroughCount = 0;
    
    const insertMany = db.transaction(() => {
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        
        const fields = parseCSVLine(line);
        const postcode = (fields[iPostcode] || '').trim();
        const floorArea = parseFloat(fields[iFloorArea]);
        
        if (!postcode || !floorArea || floorArea <= 0 || floorArea > 1000) continue;
        
        const addr = normaliseAddress(
          [fields[iAddr1], fields[iAddr2], fields[iAddr3]]
            .filter(Boolean)
            .map(s => s.trim())
            .join(' ')
        );
        
        if (!addr) continue;
        
        insert.run(
          postcode,
          addr,
          floorArea,
          (fields[iPropType] || '').trim(),
          (fields[iBuiltForm] || '').trim(),
          (fields[iLodgementDate] || '').trim(),
          (fields[iUprn] || '').trim()
        );
        boroughCount++;
      }
    });
    
    insertMany();
    totalRecords += boroughCount;
    console.log(`  ✓ ${borough.name}: ${boroughCount.toLocaleString()} records`);
  }
  
  console.log(`\nTotal EPC records: ${totalRecords.toLocaleString()}`);
  
  // Create indexes
  console.log('Creating EPC indexes...');
  db.exec('CREATE INDEX IF NOT EXISTS idx_epc_postcode ON epc(postcode)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_epc_postcode_addr ON epc(postcode, address_norm)');
  console.log('Done');
}

function importPPD(db) {
  const count = db.query('SELECT COUNT(*) as c FROM ppd').get().c;
  if (count > 0) {
    console.log(`\nPPD table already has ${count.toLocaleString()} records, skipping import`);
    return;
  }

  console.log('\n=== Importing PPD data ===');
  
  const insert = db.prepare(`INSERT INTO ppd (price, transaction_date, postcode, property_type, paon, saon, street, address_norm, district) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  
  const years = [2024, 2025];
  let totalRecords = 0;
  
  for (const year of years) {
    const csvPath = join(CACHE_DIR, `pp-${year}.csv`);
    if (!existsSync(csvPath)) {
      console.log(`  ✗ pp-${year}.csv not found`);
      continue;
    }
    
    const content = readFileSync(csvPath, 'utf8');
    const lines = content.split('\n');
    let yearCount = 0;
    
    const insertMany = db.transaction(() => {
      for (const line of lines) {
        if (!line.trim()) continue;
        
        const fields = parseCSVLine(line);
        const price = parseInt(fields[1], 10);
        const transDate = (fields[2] || '').replace(/"/g, '').trim();
        const postcode = (fields[3] || '').replace(/"/g, '').trim();
        const propType = (fields[4] || '').replace(/"/g, '').trim();
        const paon = (fields[7] || '').replace(/"/g, '').trim();
        const saon = (fields[8] || '').replace(/"/g, '').trim();
        const street = (fields[9] || '').replace(/"/g, '').trim();
        
        if (!price || price <= 0 || !postcode) continue;
        if (!isLondonPostcode(postcode)) continue;
        
        const district = extractDistrict(postcode);
        if (!district) continue;
        
        // Build normalised address from PAON + Street (and SAON if present)
        const addrParts = [saon, paon, street].filter(Boolean).join(' ');
        const addrNorm = normaliseAddress(addrParts);
        
        insert.run(price, transDate, postcode, propType, paon, saon, street, addrNorm, district);
        yearCount++;
      }
    });
    
    insertMany();
    totalRecords += yearCount;
    console.log(`  ✓ ${year}: ${yearCount.toLocaleString()} London transactions`);
  }
  
  console.log(`Total PPD records: ${totalRecords.toLocaleString()}`);
  
  // Create indexes
  console.log('Creating PPD indexes...');
  db.exec('CREATE INDEX IF NOT EXISTS idx_ppd_postcode ON ppd(postcode)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_ppd_district ON ppd(district)');
  console.log('Done');
}

function matchAndCalculate(db) {
  const count = db.query('SELECT COUNT(*) as c FROM matched').get().c;
  if (count > 0) {
    console.log(`\nMatched table already has ${count.toLocaleString()} records, skipping match`);
    return;
  }

  console.log('\n=== Matching PPD ↔ EPC ===');
  
  // Match strategy: same postcode + address_norm contains the PPD address_norm
  // (EPC addresses tend to be more complete than PPD)
  // For each PPD record, find the best EPC match at same postcode
  
  // Simple but effective: exact postcode + address_norm match
  console.log('Running exact postcode + address match...');
  
  db.exec(`
    INSERT INTO matched (price, total_floor_area, price_per_sqft, district, ppd_property_type, epc_property_type)
    SELECT 
      p.price,
      e.total_floor_area,
      CAST(p.price AS REAL) / (e.total_floor_area * 10.7639) AS price_per_sqft,
      p.district,
      p.property_type AS ppd_property_type,
      e.property_type AS epc_property_type
    FROM ppd p
    INNER JOIN (
      SELECT postcode, address_norm, total_floor_area, property_type,
             ROW_NUMBER() OVER (PARTITION BY postcode, address_norm ORDER BY lodgement_date DESC) AS rn
      FROM epc
    ) e ON p.postcode = e.postcode AND p.address_norm = e.address_norm AND e.rn = 1
    WHERE CAST(p.price AS REAL) / (e.total_floor_area * 10.7639) BETWEEN 100 AND 5000
  `);
  
  const matchCount = db.query('SELECT COUNT(*) as c FROM matched').get().c;
  const ppdCount = db.query('SELECT COUNT(*) as c FROM ppd').get().c;
  const matchRate = ((matchCount / ppdCount) * 100).toFixed(1);
  
  console.log(`Matched: ${matchCount.toLocaleString()} / ${ppdCount.toLocaleString()} (${matchRate}%)`);
  
  // If match rate is low, try fuzzy matching (PPD addr contained in EPC addr)
  if (matchCount / ppdCount < 0.3) {
    console.log('Match rate low, trying fuzzy match (PPD addr substring of EPC addr)...');
    
    db.exec(`
      INSERT INTO matched (price, total_floor_area, price_per_sqft, district, ppd_property_type, epc_property_type)
      SELECT 
        p.price,
        e.total_floor_area,
        CAST(p.price AS REAL) / (e.total_floor_area * 10.7639) AS price_per_sqft,
        p.district,
        p.property_type AS ppd_property_type,
        e.property_type AS epc_property_type
      FROM ppd p
      INNER JOIN (
        SELECT postcode, address_norm, total_floor_area, property_type,
               ROW_NUMBER() OVER (PARTITION BY postcode, address_norm ORDER BY lodgement_date DESC) AS rn
        FROM epc
      ) e ON p.postcode = e.postcode AND e.address_norm LIKE '%' || p.address_norm || '%' AND e.rn = 1
      WHERE p.rowid NOT IN (SELECT DISTINCT p2.rowid FROM ppd p2 INNER JOIN epc e2 ON p2.postcode = e2.postcode AND p2.address_norm = e2.address_norm)
      AND CAST(p.price AS REAL) / (e.total_floor_area * 10.7639) BETWEEN 100 AND 5000
    `);
    
    const newCount = db.query('SELECT COUNT(*) as c FROM matched').get().c;
    console.log(`After fuzzy: ${newCount.toLocaleString()} total matches (${((newCount / ppdCount) * 100).toFixed(1)}%)`);
  }
  
  // Create index on matched
  db.exec('CREATE INDEX IF NOT EXISTS idx_matched_district ON matched(district)');
}

function generatePrices(db) {
  console.log('\n=== Generating prices-sqft.json ===');
  
  // Get baseline £/sqft
  const baselineRow = db.query(`
    SELECT 
      district,
      COUNT(*) as sample_size
    FROM matched 
    WHERE district = ?
  `).get(BASELINE_DISTRICT);
  
  if (!baselineRow || baselineRow.sample_size === 0) {
    console.error('No matched data for baseline district ' + BASELINE_DISTRICT);
    process.exit(1);
  }
  
  // SQLite doesn't have a native MEDIAN, so we'll calculate it in JS
  // Get all districts
  const districts = db.query('SELECT DISTINCT district FROM matched ORDER BY district').all();
  
  function getMedian(arr) {
    if (arr.length === 0) return 0;
    const sorted = arr.sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }
  
  // Get all matched data grouped by district
  const results = [];
  
  // PPD property types: D=detached, S=semi, T=terraced → houses; F=flat
  const allQuery = db.prepare('SELECT price_per_sqft FROM matched WHERE district = ?');
  const housesQuery = db.prepare("SELECT price_per_sqft FROM matched WHERE district = ? AND ppd_property_type IN ('D', 'S', 'T')");
  const flatsQuery = db.prepare("SELECT price_per_sqft FROM matched WHERE district = ? AND ppd_property_type = 'F'");
  const floorAreaQuery = db.prepare('SELECT total_floor_area FROM matched WHERE district = ?');
  const ppdCountQuery = db.prepare('SELECT COUNT(*) as c FROM ppd WHERE district = ?');
  
  for (const { district } of districts) {
    const allPrices = allQuery.all(district).map(r => r.price_per_sqft);
    const housesPrices = housesQuery.all(district).map(r => r.price_per_sqft);
    const flatsPrices = flatsQuery.all(district).map(r => r.price_per_sqft);
    const floorAreas = floorAreaQuery.all(district).map(r => r.total_floor_area);
    const ppdTotal = ppdCountQuery.get(district).c;
    
    if (allPrices.length < 5) continue; // Skip districts with too few matches
    
    results.push({
      district,
      medianPricePerSqft: Math.round(getMedian(allPrices)),
      medianHousesPricePerSqft: housesPrices.length >= 3 ? Math.round(getMedian(housesPrices)) : null,
      medianFlatsPricePerSqft: flatsPrices.length >= 3 ? Math.round(getMedian(flatsPrices)) : null,
      sampleSize: allPrices.length,
      housesSampleSize: housesPrices.length,
      flatsSampleSize: flatsPrices.length,
      matchRate: Math.round((allPrices.length / ppdTotal) * 100) / 100,
      medianFloorArea: Math.round(getMedian(floorAreas)),
    });
  }
  
  // Calculate percent diffs relative to baseline
  const baselineEntry = results.find(r => r.district === BASELINE_DISTRICT);
  if (!baselineEntry) {
    console.error('Baseline district not found in results');
    process.exit(1);
  }
  
  const baseAll = baselineEntry.medianPricePerSqft;
  const baseHouses = baselineEntry.medianHousesPricePerSqft;
  const baseFlats = baselineEntry.medianFlatsPricePerSqft;
  
  for (const r of results) {
    r.percentDiff = Math.round(((r.medianPricePerSqft - baseAll) / baseAll) * 1000) / 10;
    r.percentDiffHouses = (r.medianHousesPricePerSqft && baseHouses) 
      ? Math.round(((r.medianHousesPricePerSqft - baseHouses) / baseHouses) * 1000) / 10 
      : null;
    r.percentDiffFlats = (r.medianFlatsPricePerSqft && baseFlats)
      ? Math.round(((r.medianFlatsPricePerSqft - baseFlats) / baseFlats) * 1000) / 10
      : null;
  }
  
  results.sort((a, b) => a.district.localeCompare(b.district));
  
  // Write output
  const outputPath = join(DATA_DIR, 'prices-sqft.json');
  writeFileSync(outputPath, JSON.stringify(results, null, 2));
  
  console.log(`\n✓ Generated ${outputPath}`);
  console.log(`  Districts: ${results.length}`);
  console.log(`  Baseline (${BASELINE_DISTRICT}): £${baseAll}/sqft`);
  
  // Sample output
  console.log('\nSample:');
  for (const d of ['E14', 'SW3', 'NW3', 'SE1', 'W1']) {
    const entry = results.find(r => r.district === d);
    if (entry) {
      console.log(`  ${d}: £${entry.medianPricePerSqft}/sqft (n=${entry.sampleSize}, match=${(entry.matchRate * 100).toFixed(0)}%)`);
    }
  }
  
  // Overall stats
  const totalMatched = results.reduce((s, r) => s + r.sampleSize, 0);
  const avgMatchRate = results.reduce((s, r) => s + r.matchRate, 0) / results.length;
  console.log(`\nTotal matched transactions: ${totalMatched.toLocaleString()}`);
  console.log(`Average match rate: ${(avgMatchRate * 100).toFixed(1)}%`);
}

// Main
console.log('=== London £/sqft Pipeline (SQLite) ===\n');
console.log(`Database: ${DB_PATH}`);

// Delete existing DB if --force flag
if (process.argv.includes('--force') && existsSync(DB_PATH)) {
  console.log('Removing existing database (--force)');
  const { unlinkSync } = await import('fs');
  unlinkSync(DB_PATH);
}

const db = new Database(DB_PATH);
initDB(db);

importEPC(db);
importPPD(db);
matchAndCalculate(db);
generatePrices(db);

db.close();
console.log('\n✅ Pipeline complete');
