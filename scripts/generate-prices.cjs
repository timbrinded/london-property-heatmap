#!/usr/bin/env node
/**
 * Generate prices.json from matched PPD↔EPC data.
 * Reads cache/matched-data.json and outputs public/data/prices.json
 */

const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '../cache');
const DATA_DIR = path.join(__dirname, '../public/data');
const INPUT_FILE = path.join(CACHE_DIR, 'matched-data.json');
const OUTPUT_FILE = path.join(DATA_DIR, 'prices.json');

const BASELINE_DISTRICT = 'E14';

function calculateMedian(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? Math.round(sorted[mid])
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function main() {
  console.log('=== Generate prices.json ===\n');

  if (!fs.existsSync(INPUT_FILE)) {
    throw new Error(`Input not found: ${INPUT_FILE}. Run match-and-calculate.cjs first.`);
  }

  const data = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
  const { byDistrict, totalPPD, totalMatched } = data;

  console.log(`Total PPD: ${totalPPD}, Matched: ${totalMatched}`);

  // Calculate per-district stats
  const districts = [];
  for (const [district, d] of Object.entries(byDistrict)) {
    if (d.allPricesPerSqft.length < 5) continue; // Skip tiny samples

    districts.push({
      district,
      medianPricePerSqft: calculateMedian(d.allPricesPerSqft),
      medianHousesPricePerSqft: d.housesPricesPerSqft.length >= 3 ? calculateMedian(d.housesPricesPerSqft) : null,
      medianFlatsPricePerSqft: d.flatsPricesPerSqft.length >= 3 ? calculateMedian(d.flatsPricesPerSqft) : null,
      sampleSize: d.allPricesPerSqft.length,
      housesSampleSize: d.housesPricesPerSqft.length,
      flatsSampleSize: d.flatsPricesPerSqft.length,
      medianFloorArea: calculateMedian(d.floorAreas),
    });
  }

  // Get baseline
  const baseline = districts.find(d => d.district === BASELINE_DISTRICT);
  if (!baseline) {
    throw new Error(`Baseline district ${BASELINE_DISTRICT} not found!`);
  }

  const baseAll = baseline.medianPricePerSqft;
  const baseHouses = baseline.medianHousesPricePerSqft || baseAll;
  const baseFlats = baseline.medianFlatsPricePerSqft || baseAll;

  console.log(`\nBaseline (${BASELINE_DISTRICT}):`);
  console.log(`  All: £${baseAll}/sqft`);
  console.log(`  Houses: £${baseHouses}/sqft`);
  console.log(`  Flats: £${baseFlats}/sqft`);

  // Calculate percent diffs
  for (const d of districts) {
    d.percentDiff = Math.round(((d.medianPricePerSqft - baseAll) / baseAll) * 1000) / 10;
    d.percentDiffHouses = d.medianHousesPricePerSqft
      ? Math.round(((d.medianHousesPricePerSqft - baseHouses) / baseHouses) * 1000) / 10
      : null;
    d.percentDiffFlats = d.medianFlatsPricePerSqft
      ? Math.round(((d.medianFlatsPricePerSqft - baseFlats) / baseFlats) * 1000) / 10
      : null;
    d.matchRate = Math.round((d.sampleSize / totalPPD) * 10000) / 100; // per-district not meaningful as rate, skip
  }

  // Sort
  districts.sort((a, b) => a.district.localeCompare(b.district));

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(districts, null, 2));

  console.log(`\n✓ Generated ${OUTPUT_FILE}`);
  console.log(`  Districts: ${districts.length}`);

  // Sample
  console.log('\nSample:');
  for (const d of ['E14', 'SW3', 'NW3', 'SE1', 'W1', 'BR1', 'CR0']) {
    const entry = districts.find(e => e.district === d);
    if (entry) {
      console.log(`  ${d}: £${entry.medianPricePerSqft}/sqft (${entry.percentDiff > 0 ? '+' : ''}${entry.percentDiff}%) n=${entry.sampleSize}`);
    }
  }
}

main();
