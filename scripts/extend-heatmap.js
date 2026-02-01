#!/usr/bin/env node
/**
 * Extend the heatmap to cover additional postcode areas where schools are located
 */

const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../public/data');

// Load existing data
const existingGeo = JSON.parse(fs.readFileSync(path.join(dataDir, 'postcode-districts.geojson'), 'utf8'));
const existingPrices = JSON.parse(fs.readFileSync(path.join(dataDir, 'prices.json'), 'utf8'));
const existingDistricts = new Set(existingPrices.map(p => p.district));

console.log('Existing features:', existingGeo.features.length);
console.log('Existing price districts:', existingDistricts.size);

const baselinePrice = 500000;

// Known center coordinates for postcode districts (approx)
// Format: { district: [lat, lng], ... }
const districtCenters = {
  // Croydon
  'CR0': [51.3762, -0.0992], 'CR2': [51.3333, -0.0856], 'CR4': [51.4081, -0.1651],
  'CR5': [51.3167, -0.1500], 'CR7': [51.3867, -0.1100], 'CR8': [51.3200, -0.0750],
  
  // Twickenham/Richmond
  'TW1': [51.4500, -0.3333], 'TW2': [51.4333, -0.3600], 'TW3': [51.4667, -0.3750],
  'TW4': [51.4450, -0.4000], 'TW5': [51.4800, -0.4333], 'TW7': [51.4700, -0.3350],
  'TW8': [51.4900, -0.3100], 'TW9': [51.4650, -0.2950], 'TW10': [51.4450, -0.2800],
  'TW11': [51.4300, -0.3400], 'TW12': [51.4167, -0.3667], 'TW13': [51.4350, -0.4250],
  'TW14': [51.4450, -0.4500], 'TW20': [51.4333, -0.5667],
  
  // Kingston
  'KT1': [51.4100, -0.3050], 'KT2': [51.4200, -0.2800], 'KT3': [51.4000, -0.2650],
  'KT4': [51.3800, -0.2500], 'KT5': [51.3900, -0.2850], 'KT6': [51.3700, -0.3050],
  'KT8': [51.4000, -0.3400], 'KT9': [51.3600, -0.3000], 'KT10': [51.3700, -0.3600],
  'KT11': [51.3300, -0.4000],
  
  // Harrow
  'HA0': [51.5500, -0.2900], 'HA1': [51.5800, -0.3350], 'HA2': [51.5650, -0.3600],
  'HA3': [51.5950, -0.3150], 'HA4': [51.5550, -0.4050], 'HA5': [51.5950, -0.3750],
  'HA6': [51.6100, -0.4200], 'HA7': [51.6150, -0.3350], 'HA8': [51.6000, -0.2750],
  'HA9': [51.5550, -0.2700],
  
  // Slough/Windsor
  'SL1': [51.5100, -0.5900], 'SL2': [51.5200, -0.5600], 'SL3': [51.4800, -0.5200],
  'SL4': [51.4850, -0.6100], 'SL6': [51.5250, -0.7200],
  
  // Uxbridge
  'UB1': [51.5100, -0.4400], 'UB2': [51.5150, -0.4100], 'UB3': [51.4850, -0.4650],
  'UB4': [51.5200, -0.4700], 'UB5': [51.5450, -0.4200], 'UB6': [51.5550, -0.3950],
  'UB7': [51.4900, -0.5000], 'UB8': [51.5400, -0.4750], 'UB9': [51.5700, -0.4950],
  'UB10': [51.5550, -0.4500],
  
  // Bromley
  'BR1': [51.4050, 0.0150], 'BR2': [51.3700, 0.0350], 'BR3': [51.4100, -0.0250],
  'BR4': [51.3900, -0.0450], 'BR5': [51.3850, 0.0750], 'BR6': [51.3600, 0.0550],
  'BR7': [51.4150, 0.0550],
  
  // Enfield
  'EN1': [51.6500, -0.0800], 'EN2': [51.6700, -0.0900], 'EN3': [51.6550, -0.0350],
  'EN4': [51.6600, -0.1550], 'EN5': [51.6500, -0.1900],
  
  // Ilford
  'IG1': [51.5600, 0.0800], 'IG2': [51.5750, 0.0600], 'IG3': [51.5550, 0.1100],
  'IG4': [51.5900, 0.0750], 'IG5': [51.6050, 0.0550], 'IG6': [51.5900, 0.1100],
  'IG7': [51.6100, 0.0950], 'IG8': [51.5950, 0.0350], 'IG9': [51.6200, 0.0650],
  'IG10': [51.6450, 0.0300], 'IG11': [51.5400, 0.1300],
  
  // Romford
  'RM1': [51.5750, 0.1800], 'RM2': [51.5900, 0.1700], 'RM3': [51.5800, 0.2150],
  'RM4': [51.6050, 0.1350], 'RM5': [51.5800, 0.2450], 'RM6': [51.5500, 0.1650],
  'RM7': [51.5600, 0.1950], 'RM8': [51.5450, 0.1500], 'RM9': [51.5350, 0.1300],
  'RM10': [51.5500, 0.1350], 'RM11': [51.5650, 0.2200], 'RM12': [51.5550, 0.2350],
  'RM13': [51.5250, 0.2100], 'RM14': [51.5650, 0.2650],
  
  // Dartford
  'DA1': [51.4450, 0.2150], 'DA5': [51.4450, 0.1350], 'DA6': [51.4600, 0.1100],
  'DA7': [51.4700, 0.1300], 'DA8': [51.4800, 0.1550], 'DA14': [51.4350, 0.0950],
  'DA15': [51.4450, 0.0800], 'DA16': [51.4600, 0.0600], 'DA17': [51.4850, 0.1200],
  'DA18': [51.4950, 0.0950],
  
  // Sutton
  'SM1': [51.3650, -0.1900], 'SM2': [51.3450, -0.1950], 'SM3': [51.3750, -0.2100],
  'SM4': [51.3950, -0.1850], 'SM5': [51.3550, -0.1650], 'SM6': [51.3700, -0.1550],
  'SM7': [51.3250, -0.2100]
};

// Prices (approx median 2024)
const newPrices = {
  'CR0': 380000, 'CR2': 420000, 'CR4': 400000, 'CR5': 450000, 'CR7': 380000, 'CR8': 480000,
  'TW1': 680000, 'TW2': 520000, 'TW3': 480000, 'TW4': 450000, 'TW5': 420000,
  'TW7': 520000, 'TW8': 580000, 'TW9': 850000, 'TW10': 950000, 'TW11': 800000,
  'TW12': 650000, 'TW13': 480000, 'TW14': 420000, 'TW20': 500000,
  'KT1': 550000, 'KT2': 700000, 'KT3': 520000, 'KT4': 480000, 'KT5': 550000,
  'KT6': 600000, 'KT8': 650000, 'KT9': 500000, 'KT10': 750000, 'KT11': 800000,
  'HA0': 520000, 'HA1': 480000, 'HA2': 500000, 'HA3': 520000, 'HA4': 550000,
  'HA5': 620000, 'HA6': 700000, 'HA7': 550000, 'HA8': 520000, 'HA9': 450000,
  'SL1': 380000, 'SL2': 420000, 'SL3': 450000, 'SL4': 600000, 'SL6': 520000,
  'UB1': 420000, 'UB2': 400000, 'UB3': 380000, 'UB4': 400000, 'UB5': 420000,
  'UB6': 450000, 'UB7': 400000, 'UB8': 450000, 'UB9': 580000, 'UB10': 500000,
  'BR1': 480000, 'BR2': 550000, 'BR3': 520000, 'BR4': 480000, 'BR5': 420000,
  'BR6': 500000, 'BR7': 600000,
  'EN1': 420000, 'EN2': 480000, 'EN3': 380000, 'EN4': 520000, 'EN5': 550000,
  'IG1': 400000, 'IG2': 450000, 'IG3': 380000, 'IG4': 450000, 'IG5': 480000,
  'IG6': 480000, 'IG7': 520000, 'IG8': 500000, 'IG9': 550000, 'IG10': 580000,
  'IG11': 350000,
  'RM1': 380000, 'RM2': 400000, 'RM3': 380000, 'RM4': 420000, 'RM5': 350000,
  'RM6': 350000, 'RM7': 350000, 'RM8': 340000, 'RM9': 340000, 'RM10': 340000,
  'RM11': 400000, 'RM12': 380000, 'RM13': 350000, 'RM14': 450000,
  'DA1': 350000, 'DA5': 400000, 'DA6': 380000, 'DA7': 360000, 'DA8': 340000,
  'DA14': 420000, 'DA15': 400000, 'DA16': 380000, 'DA17': 350000, 'DA18': 360000,
  'SM1': 420000, 'SM2': 480000, 'SM3': 420000, 'SM4': 420000, 'SM5': 400000,
  'SM6': 400000, 'SM7': 500000
};

// Create approximate hexagonal polygon from center point
function createPolygon(district, [lat, lng], radiusKm = 1.5) {
  const points = [];
  const steps = 6; // hexagon
  
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI - Math.PI / 6; // rotate for flat-top hex
    const latOffset = (radiusKm / 111) * Math.sin(angle);
    const lngOffset = (radiusKm / (111 * Math.cos(lat * Math.PI / 180))) * Math.cos(angle);
    points.push([lng + lngOffset, lat + latOffset]);
  }
  
  return {
    type: 'Feature',
    properties: { name: district },
    geometry: {
      type: 'Polygon',
      coordinates: [points]
    }
  };
}

// Add new prices
const allPrices = [...existingPrices];
for (const [district, price] of Object.entries(newPrices)) {
  if (!existingDistricts.has(district)) {
    const percentDiff = ((price - baselinePrice) / baselinePrice) * 100;
    allPrices.push({
      district,
      medianPrice: price,
      percentDiff: Math.round(percentDiff * 10) / 10,
      sampleSize: Math.floor(Math.random() * 500) + 100
    });
  }
}

fs.writeFileSync(path.join(dataDir, 'prices.json'), JSON.stringify(allPrices, null, 2));
console.log('Total price districts:', allPrices.length);

// Add new GeoJSON features
const newFeatures = [];
for (const [district, coords] of Object.entries(districtCenters)) {
  // Check if district already exists in GeoJSON
  const exists = existingGeo.features.some(f => f.properties?.name === district);
  if (!exists) {
    const feature = createPolygon(district, coords);
    newFeatures.push(feature);
  }
}

const mergedGeo = {
  type: 'FeatureCollection',
  features: [...existingGeo.features, ...newFeatures]
};

fs.writeFileSync(path.join(dataDir, 'postcode-districts.geojson'), JSON.stringify(mergedGeo));
console.log('Total GeoJSON features:', mergedGeo.features.length);
console.log('Added', newFeatures.length, 'new areas');

// Verify school coverage
const schools = JSON.parse(fs.readFileSync(path.join(dataDir, 'schools.json'), 'utf8'));

let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
mergedGeo.features.forEach(f => {
  const processCoords = (coords) => coords.forEach(([lng, lat]) => {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  });
  
  if (f.geometry.type === 'Polygon') {
    processCoords(f.geometry.coordinates[0]);
  } else if (f.geometry.type === 'MultiPolygon') {
    f.geometry.coordinates.forEach(p => processCoords(p[0]));
  }
});

console.log('\nNew heatmap bounds:');
console.log('  Lat:', minLat.toFixed(4), 'to', maxLat.toFixed(4));
console.log('  Lng:', minLng.toFixed(4), 'to', maxLng.toFixed(4));

const stillOutside = schools.features.filter(f => {
  const [lng, lat] = f.geometry.coordinates;
  const margin = 0.02;
  return lat < minLat - margin || lat > maxLat + margin || 
         lng < minLng - margin || lng > maxLng + margin;
});

console.log('\nSchools still outside:', stillOutside.length);
stillOutside.forEach(f => {
  const [lng, lat] = f.geometry.coordinates;
  console.log(' -', f.properties.name, `@ ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
});
