#!/usr/bin/env node
/**
 * Download EPC data for London local authorities and extract to a single CSV.
 * Uses per-authority zip downloads from the EPC Open Data API.
 * 
 * Output: cache/epc-london.csv
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CACHE_DIR = path.join(__dirname, '../cache');
const EPC_CACHE_DIR = path.join(CACHE_DIR, 'epc');
const OUTPUT_FILE = path.join(CACHE_DIR, 'epc-london.csv');

// London boroughs (E09 codes) - all 33
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

function getEpcToken() {
  try {
    return execSync('doppler secrets get EPC_AUTH_TOKEN --project clawd --config dev_personal --plain', { encoding: 'utf8' }).trim();
  } catch {
    throw new Error('Failed to get EPC_AUTH_TOKEN from Doppler');
  }
}

function downloadBorough(token, code, name, destZip) {
  const url = `https://epc.opendatacommunities.org/api/v1/files/domestic-${code}-${name}.zip`;
  console.log(`  Downloading ${name}...`);
  try {
    execSync(`curl -s --http1.1 -L -H "Authorization: Basic ${token}" -o "${destZip}" "${url}"`, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stats = fs.statSync(destZip);
    if (stats.size < 1000) {
      console.log(`  ⚠ ${name}: file too small (${stats.size}b), skipping`);
      fs.unlinkSync(destZip);
      return false;
    }
    console.log(`  ✓ ${name}: ${(stats.size / 1024 / 1024).toFixed(1)}MB`);
    return true;
  } catch (err) {
    console.log(`  ✗ ${name}: download failed`);
    return false;
  }
}

function extractCertificates(zipPath) {
  try {
    const csv = execSync(`unzip -p "${zipPath}" certificates.csv`, {
      encoding: 'utf8',
      maxBuffer: 500 * 1024 * 1024, // 500MB
    });
    return csv;
  } catch {
    console.log('  ✗ Failed to extract certificates.csv');
    return null;
  }
}

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

function processCSV(csvText, headerMap) {
  const lines = csvText.split('\n');
  const records = [];
  
  // First line is header if headerMap is null
  let startIdx = 0;
  if (!headerMap) {
    const headerLine = lines[0];
    const headers = parseCSVLine(headerLine);
    headerMap = {};
    headers.forEach((h, i) => { headerMap[h.trim().toUpperCase()] = i; });
    startIdx = 1;
  }
  
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
    console.log('  ✗ Missing required columns');
    return { records: [], headerMap };
  }
  
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    const fields = parseCSVLine(line);
    const postcode = (fields[iPostcode] || '').trim();
    const floorArea = parseFloat(fields[iFloorArea]);
    
    if (!postcode || !floorArea || floorArea <= 0) continue;
    
    // Normalise address: combine addr1+addr2+addr3, uppercase, strip punctuation
    const addr = [fields[iAddr1], fields[iAddr2], fields[iAddr3]]
      .filter(Boolean)
      .map(s => s.trim())
      .join(', ')
      .toUpperCase()
      .replace(/[.,'"]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    records.push({
      postcode,
      address: addr,
      total_floor_area: floorArea,
      property_type: (fields[iPropType] || '').trim(),
      built_form: (fields[iBuiltForm] || '').trim(),
      lodgement_date: (fields[iLodgementDate] || '').trim(),
      uprn: (fields[iUprn] || '').trim(),
    });
  }
  
  return { records, headerMap };
}

async function main() {
  console.log('=== EPC Data Fetch for London ===\n');
  
  // Check if output already exists
  if (fs.existsSync(OUTPUT_FILE)) {
    const stats = fs.statSync(OUTPUT_FILE);
    const ageDays = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);
    if (ageDays < 30) {
      console.log(`Output exists and is ${ageDays.toFixed(0)} days old. Use --force to re-download.`);
      if (!process.argv.includes('--force')) {
        const lineCount = execSync(`wc -l < "${OUTPUT_FILE}"`, { encoding: 'utf8' }).trim();
        console.log(`Records: ${lineCount}`);
        return;
      }
    }
  }
  
  const token = getEpcToken();
  fs.mkdirSync(EPC_CACHE_DIR, { recursive: true });
  
  let allRecords = [];
  let successCount = 0;
  
  for (const borough of LONDON_BOROUGHS) {
    const zipPath = path.join(EPC_CACHE_DIR, `${borough.code}.zip`);
    
    // Download if not cached
    if (!fs.existsSync(zipPath)) {
      if (!downloadBorough(token, borough.code, borough.name, zipPath)) continue;
    } else {
      console.log(`  Cached: ${borough.name}`);
    }
    
    // Extract and process
    const csv = extractCertificates(zipPath);
    if (!csv) continue;
    
    const { records } = processCSV(csv, null);
    console.log(`    → ${records.length.toLocaleString()} records`);
    allRecords.push(...records);
    successCount++;
  }
  
  console.log(`\nProcessed ${successCount}/${LONDON_BOROUGHS.length} boroughs`);
  console.log(`Total records: ${allRecords.length.toLocaleString()}`);
  
  // Write output CSV
  const header = 'postcode,address,total_floor_area,property_type,built_form,lodgement_date,uprn';
  const lines = [header];
  for (const r of allRecords) {
    lines.push(`"${r.postcode}","${r.address.replace(/"/g, '""')}",${r.total_floor_area},"${r.property_type}","${r.built_form}","${r.lodgement_date}","${r.uprn}"`);
  }
  
  fs.writeFileSync(OUTPUT_FILE, lines.join('\n'));
  console.log(`\n✓ Written to ${OUTPUT_FILE}`);
  console.log(`  Size: ${(fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(1)}MB`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
