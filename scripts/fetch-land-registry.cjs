#!/usr/bin/env node
/**
 * Fetch Land Registry Price Paid Data and calculate medians by postcode district
 * Data source: https://www.gov.uk/government/statistical-data-sets/price-paid-data-downloads
 * 
 * Contains HM Land Registry data © Crown copyright and database right 2021.
 * Licensed under the Open Government Licence v3.0.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const DATA_DIR = path.join(__dirname, '../public/data');
const CACHE_DIR = path.join(__dirname, '../cache');

// London postcode areas (inner + outer London)
const LONDON_AREAS = [
  // Inner London
  'E', 'EC', 'N', 'NW', 'SE', 'SW', 'W', 'WC',
  // Outer London boroughs
  'BR',   // Bromley
  'CR',   // Croydon
  'DA',   // Dartford (parts in London)
  'EN',   // Enfield
  'HA',   // Harrow
  'IG',   // Ilford/Redbridge/Barking
  'KT',   // Kingston
  'RM',   // Romford/Havering
  'SM',   // Sutton
  'TW',   // Twickenham/Richmond
  'UB',   // Uxbridge/Hillingdon
  'WD',   // Watford (parts in London - Harrow border)
];

// Property type codes
const PROPERTY_TYPES = {
  'D': 'detached',
  'S': 'semi-detached',
  'T': 'terraced',
  'F': 'flat'
};

// CSV columns (Land Registry format)
// 0: Transaction ID
// 1: Price
// 2: Date of Transfer
// 3: Postcode
// 4: Property Type (D/S/T/F/O)
// 5: Old/New (Y/N)
// 6: Duration (F=freehold, L=leasehold)
// 7: PAON
// 8: SAON
// 9: Street
// 10: Locality
// 11: Town/City
// 12: District
// 13: County
// 14: PPD Category (A=standard, B=additional)
// 15: Record Status (A=addition, C=change, D=delete)

async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading: ${url}`);
    
    const file = fs.createWriteStream(destPath);
    const protocol = url.startsWith('https') ? https : http;
    
    protocol.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlinkSync(destPath);
        return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
      }
      
      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      
      const totalBytes = parseInt(response.headers['content-length'], 10);
      let downloadedBytes = 0;
      
      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        if (totalBytes) {
          const percent = ((downloadedBytes / totalBytes) * 100).toFixed(1);
          process.stdout.write(`\rProgress: ${percent}% (${(downloadedBytes / 1024 / 1024).toFixed(1)} MB)`);
        }
      });
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log('\nDownload complete');
        resolve();
      });
    }).on('error', (err) => {
      file.close();
      fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

function parseCSVLine(line) {
  // Handle quoted fields with commas
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function extractDistrict(postcode) {
  if (!postcode) return null;
  // E14 8JX -> E14, SW1A 1AA -> SW1, EC1A 1BB -> EC1
  const match = postcode.match(/^([A-Z]+\d+)/);
  return match ? match[1] : null;
}

function isLondonPostcode(postcode) {
  if (!postcode) return false;
  return LONDON_AREAS.some(area => postcode.startsWith(area));
}

function calculateMedian(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

async function processYearFile(year) {
  const url = `http://prod.publicdata.landregistry.gov.uk.s3-website-eu-west-1.amazonaws.com/pp-${year}.csv`;
  const cacheFile = path.join(CACHE_DIR, `pp-${year}.csv`);
  
  // Ensure cache directory exists
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
  
  // Download if not cached
  if (!fs.existsSync(cacheFile)) {
    await downloadFile(url, cacheFile);
  } else {
    console.log(`Using cached: ${cacheFile}`);
  }
  
  // Process the file
  const content = fs.readFileSync(cacheFile, 'utf8');
  const lines = content.split('\n');
  
  // Data structure: { district: { all: [], houses: [], flats: [] } }
  const data = {};
  let processed = 0;
  let londonCount = 0;
  
  for (const line of lines) {
    if (!line.trim()) continue;
    
    const fields = parseCSVLine(line);
    const price = parseInt(fields[1], 10);
    const postcode = fields[3]?.replace(/"/g, '');
    const propertyType = fields[4]?.replace(/"/g, '');
    
    if (!price || price <= 0 || !postcode) continue;
    processed++;
    
    if (!isLondonPostcode(postcode)) continue;
    londonCount++;
    
    const district = extractDistrict(postcode);
    if (!district) continue;
    
    if (!data[district]) {
      data[district] = { all: [], houses: [], flats: [] };
    }
    
    data[district].all.push(price);
    
    // Houses = D, S, T (detached, semi, terraced)
    // Flats = F
    if (['D', 'S', 'T'].includes(propertyType)) {
      data[district].houses.push(price);
    } else if (propertyType === 'F') {
      data[district].flats.push(price);
    }
  }
  
  console.log(`Year ${year}: ${processed} total transactions, ${londonCount} in London`);
  return data;
}

async function main() {
  console.log('Fetching Land Registry Price Paid Data for London...\n');
  
  // Process last 2 years for recent data
  const years = [2024, 2025];
  const combinedData = {};
  
  for (const year of years) {
    try {
      const yearData = await processYearFile(year);
      
      // Merge into combined data
      for (const [district, prices] of Object.entries(yearData)) {
        if (!combinedData[district]) {
          combinedData[district] = { all: [], houses: [], flats: [] };
        }
        combinedData[district].all.push(...prices.all);
        combinedData[district].houses.push(...prices.houses);
        combinedData[district].flats.push(...prices.flats);
      }
    } catch (err) {
      console.error(`Error processing ${year}:`, err.message);
    }
  }
  
  // Calculate medians and format output
  const BASELINE_DISTRICT = 'E14';
  const baselineData = combinedData[BASELINE_DISTRICT];
  const baselineAllPrice = baselineData ? calculateMedian(baselineData.all) : 500000;
  const baselineHousesPrice = baselineData ? calculateMedian(baselineData.houses) : 600000;
  
  const priceData = [];
  
  for (const [district, prices] of Object.entries(combinedData)) {
    const medianAll = calculateMedian(prices.all);
    const medianHouses = calculateMedian(prices.houses);
    const medianFlats = calculateMedian(prices.flats);
    
    const percentDiffAll = ((medianAll - baselineAllPrice) / baselineAllPrice) * 100;
    const percentDiffHouses = medianHouses > 0 
      ? ((medianHouses - baselineHousesPrice) / baselineHousesPrice) * 100 
      : null;
    
    priceData.push({
      district,
      medianPrice: medianAll,
      medianHousesPrice: medianHouses || null,
      medianFlatsPrice: medianFlats || null,
      percentDiff: Math.round(percentDiffAll * 10) / 10,
      percentDiffHouses: percentDiffHouses !== null ? Math.round(percentDiffHouses * 10) / 10 : null,
      sampleSize: prices.all.length,
      housesSampleSize: prices.houses.length,
      flatsSampleSize: prices.flats.length
    });
  }
  
  // Sort by district
  priceData.sort((a, b) => a.district.localeCompare(b.district));
  
  // Write output
  const outputPath = path.join(DATA_DIR, 'prices.json');
  fs.writeFileSync(outputPath, JSON.stringify(priceData, null, 2));
  
  console.log(`\n✓ Generated ${outputPath}`);
  console.log(`  Districts: ${priceData.length}`);
  console.log(`  Baseline (E14 all): £${baselineAllPrice.toLocaleString()}`);
  console.log(`  Baseline (E14 houses): £${baselineHousesPrice.toLocaleString()}`);
  
  // Show some stats
  console.log('\nSample output:');
  const samples = ['E14', 'SW3', 'NW3', 'SE28'];
  for (const d of samples) {
    const entry = priceData.find(p => p.district === d);
    if (entry) {
      console.log(`  ${d}: All £${entry.medianPrice?.toLocaleString() || 'N/A'} | Houses £${entry.medianHousesPrice?.toLocaleString() || 'N/A'} | Flats £${entry.medianFlatsPrice?.toLocaleString() || 'N/A'} (n=${entry.sampleSize})`);
    }
  }
}

main().catch(console.error);
