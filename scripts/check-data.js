const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../public/data');

const prices = JSON.parse(fs.readFileSync(path.join(dataDir, 'prices.json'), 'utf8'));
const geo = JSON.parse(fs.readFileSync(path.join(dataDir, 'postcode-districts.geojson'), 'utf8'));

const priceDistricts = new Set(prices.map(p => p.district));
const geoNames = geo.features.map(f => f.properties.name || f.properties.Name || 'UNKNOWN');
const geoDistricts = new Set(geoNames);

console.log('Price data districts:', priceDistricts.size);
console.log('GeoJSON features:', geo.features.length);
console.log('Unique GeoJSON names:', geoDistricts.size);

// Sample of GeoJSON names
console.log('\nSample GeoJSON names:', geoNames.slice(0, 20));

// Find mismatches
const inPriceNotGeo = [...priceDistricts].filter(d => !geoDistricts.has(d));
const inGeoNotPrice = [...geoDistricts].filter(d => !priceDistricts.has(d));

console.log('\nIn prices but NOT in GeoJSON:', inPriceNotGeo);
console.log('\nIn GeoJSON but NOT in prices:', inGeoNotPrice.slice(0, 30));
