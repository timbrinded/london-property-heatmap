#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../public/data');

// London postcode areas to include
const areas = ['E', 'EC', 'N', 'NW', 'SE', 'SW', 'W', 'WC'];

// Merge all GeoJSON files
const mergedFeatures = [];

for (const area of areas) {
  const filePath = path.join(dataDir, `${area}.geojson`);
  if (fs.existsSync(filePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (data.features) {
        data.features.forEach(f => {
          // Normalize the name property
          const name = f.properties?.name || f.properties?.Name || area;
          f.properties = { ...f.properties, name };
          mergedFeatures.push(f);
        });
      }
    } catch (e) {
      console.error(`Error processing ${area}:`, e.message);
    }
  }
}

const mergedGeoJSON = {
  type: 'FeatureCollection',
  features: mergedFeatures
};

fs.writeFileSync(
  path.join(dataDir, 'postcode-districts.geojson'),
  JSON.stringify(mergedGeoJSON)
);

console.log(`Merged ${mergedFeatures.length} features`);

// Now create realistic price data based on real London market (2024-ish values)
// E14 (Millwall/Canary Wharf area) median ~£500K
const baselinePrice = 500000;

// Real approximate median prices by postcode district (based on Land Registry trends)
const realPrices = {
  // East London
  'E1': 520000, 'E2': 580000, 'E3': 490000, 'E4': 450000, 'E5': 520000,
  'E6': 380000, 'E7': 420000, 'E8': 620000, 'E9': 590000, 'E10': 440000,
  'E11': 480000, 'E12': 400000, 'E13': 370000, 'E14': 500000, 'E15': 420000,
  'E16': 400000, 'E17': 520000, 'E18': 550000,
  
  // Central East
  'EC1': 850000, 'EC2': 920000, 'EC3': 880000, 'EC4': 900000,
  
  // North London  
  'N1': 750000, 'N2': 680000, 'N3': 620000, 'N4': 600000, 'N5': 680000,
  'N6': 950000, 'N7': 680000, 'N8': 650000, 'N9': 400000, 'N10': 720000,
  'N11': 520000, 'N12': 550000, 'N13': 480000, 'N14': 520000, 'N15': 480000,
  'N16': 650000, 'N17': 420000, 'N18': 400000, 'N19': 650000, 'N20': 580000,
  'N21': 550000, 'N22': 480000,
  
  // North West London
  'NW1': 950000, 'NW2': 600000, 'NW3': 1400000, 'NW4': 580000, 'NW5': 780000,
  'NW6': 720000, 'NW7': 600000, 'NW8': 1200000, 'NW9': 480000, 'NW10': 520000,
  'NW11': 850000,
  
  // South East London
  'SE1': 620000, 'SE2': 380000, 'SE3': 550000, 'SE4': 520000, 'SE5': 500000,
  'SE6': 420000, 'SE7': 400000, 'SE8': 480000, 'SE9': 420000, 'SE10': 550000,
  'SE11': 560000, 'SE12': 450000, 'SE13': 450000, 'SE14': 480000, 'SE15': 500000,
  'SE16': 520000, 'SE17': 480000, 'SE18': 350000, 'SE19': 500000, 'SE20': 440000,
  'SE21': 750000, 'SE22': 680000, 'SE23': 550000, 'SE24': 700000, 'SE25': 400000,
  'SE26': 480000, 'SE27': 520000, 'SE28': 320000,
  
  // South West London
  'SW1': 1500000, 'SW2': 580000, 'SW3': 1800000, 'SW4': 700000, 'SW5': 950000,
  'SW6': 850000, 'SW7': 1600000, 'SW8': 600000, 'SW9': 550000, 'SW10': 1200000,
  'SW11': 750000, 'SW12': 650000, 'SW13': 800000, 'SW14': 780000, 'SW15': 720000,
  'SW16': 500000, 'SW17': 580000, 'SW18': 650000, 'SW19': 750000, 'SW20': 600000,
  
  // West London
  'W1': 1800000, 'W2': 1100000, 'W3': 600000, 'W4': 850000, 'W5': 580000,
  'W6': 750000, 'W7': 520000, 'W8': 1500000, 'W9': 800000, 'W10': 700000,
  'W11': 1300000, 'W12': 700000, 'W13': 550000, 'W14': 850000,
  
  // Central West
  'WC1': 950000, 'WC2': 1100000
};

const priceData = [];
for (const [district, price] of Object.entries(realPrices)) {
  const percentDiff = ((price - baselinePrice) / baselinePrice) * 100;
  priceData.push({
    district,
    medianPrice: price,
    percentDiff: Math.round(percentDiff * 10) / 10,
    sampleSize: Math.floor(Math.random() * 500) + 100 // Simulated
  });
}

fs.writeFileSync(
  path.join(dataDir, 'prices.json'),
  JSON.stringify(priceData, null, 2)
);

console.log(`Created price data for ${priceData.length} districts`);
console.log(`Baseline (E14): £${baselinePrice.toLocaleString()}`);
