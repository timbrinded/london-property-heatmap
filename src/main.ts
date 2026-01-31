import mapboxgl from 'mapbox-gl';

// You'll need to add your own Mapbox token
mapboxgl.accessToken = 'pk.eyJ1IjoidGltYnJpbmRlZCIsImEiOiJjbTFpcnoyeXUwNDlnMmpvb3g1Ynp0dWFxIn0.THaQaolzVZvhxs3tpKCEmA';

interface PostcodeData {
  district: string;
  medianPrice: number;
  percentDiff: number;
  sampleSize: number;
}

// E14 (Millwall/Isle of Dogs) baseline - will be calculated from data
const BASELINE_DISTRICT = 'E14';
let baselinePrice = 0;

// Color scale: green (cheaper) -> blue (baseline) -> red (more expensive)
function getColor(percentDiff: number): string {
  if (percentDiff <= -40) return '#1b5e20';
  if (percentDiff <= -20) return '#388e3c';
  if (percentDiff <= -5) return '#66bb6a';
  if (percentDiff <= 5) return '#64b5f6';
  if (percentDiff <= 30) return '#ff9800';
  if (percentDiff <= 70) return '#f44336';
  return '#b71c1c';
}

function formatPrice(price: number): string {
  if (price >= 1000000) {
    return `£${(price / 1000000).toFixed(2)}M`;
  }
  return `£${(price / 1000).toFixed(0)}K`;
}

function formatDiff(diff: number): string {
  const sign = diff >= 0 ? '+' : '';
  return `${sign}${diff.toFixed(0)}% vs E14`;
}

async function loadData(): Promise<PostcodeData[]> {
  const response = await fetch('/data/prices.json');
  return response.json();
}

async function loadGeoJSON(): Promise<GeoJSON.FeatureCollection> {
  const response = await fetch('/data/postcode-districts.geojson');
  return response.json();
}

async function init() {
  const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [-0.05, 51.5], // London, slightly east to center on E14
    zoom: 10.5,
    minZoom: 9,
    maxZoom: 14
  });

  map.addControl(new mapboxgl.NavigationControl(), 'top-right');

  // Load data
  const [priceData, geoData] = await Promise.all([
    loadData(),
    loadGeoJSON()
  ]);

  // Create price lookup
  const priceLookup = new Map<string, PostcodeData>();
  priceData.forEach(d => priceLookup.set(d.district, d));

  // Get baseline price
  const baseline = priceLookup.get(BASELINE_DISTRICT);
  if (baseline) {
    baselinePrice = baseline.medianPrice;
    document.getElementById('baseline-price')!.textContent = 
      `Median: ${formatPrice(baselinePrice)}`;
  }

  // Merge price data into GeoJSON
  geoData.features = geoData.features.map(feature => {
    const district = feature.properties?.name || feature.properties?.POSTCODE;
    const data = priceLookup.get(district);
    
    return {
      ...feature,
      properties: {
        ...feature.properties,
        medianPrice: data?.medianPrice || 0,
        percentDiff: data?.percentDiff || 0,
        sampleSize: data?.sampleSize || 0,
        color: data ? getColor(data.percentDiff) : '#333'
      }
    };
  }).filter(f => f.properties.medianPrice > 0);

  map.on('load', () => {
    // Add source
    map.addSource('postcodes', {
      type: 'geojson',
      data: geoData
    });

    // Add fill layer
    map.addLayer({
      id: 'postcodes-fill',
      type: 'fill',
      source: 'postcodes',
      paint: {
        'fill-color': ['get', 'color'],
        'fill-opacity': 0.75
      }
    });

    // Add outline layer
    map.addLayer({
      id: 'postcodes-outline',
      type: 'line',
      source: 'postcodes',
      paint: {
        'line-color': '#fff',
        'line-width': 0.5,
        'line-opacity': 0.3
      }
    });

    // Highlight E14 (baseline)
    map.addLayer({
      id: 'baseline-highlight',
      type: 'line',
      source: 'postcodes',
      filter: ['==', ['get', 'name'], BASELINE_DISTRICT],
      paint: {
        'line-color': '#64b5f6',
        'line-width': 3,
        'line-opacity': 1
      }
    });

    // Hover effects
    const popup = document.getElementById('popup')!;
    const popupDistrict = document.getElementById('popup-district')!;
    const popupPrice = document.getElementById('popup-price')!;
    const popupDiff = document.getElementById('popup-diff')!;

    map.on('mousemove', 'postcodes-fill', (e) => {
      if (e.features && e.features.length > 0) {
        const feature = e.features[0];
        const props = feature.properties as Record<string, any>;
        if (!props) return;
        
        map.getCanvas().style.cursor = 'pointer';
        
        popupDistrict.textContent = props.name || props.POSTCODE || 'Unknown';
        popupPrice.textContent = formatPrice(props.medianPrice || 0);
        popupPrice.style.color = props.color || '#fff';
        
        const diff = props.percentDiff || 0;
        popupDiff.textContent = formatDiff(diff);
        popupDiff.className = 'diff ' + (
          Math.abs(diff) < 5 ? 'baseline' : 
          diff < 0 ? 'cheaper' : 'expensive'
        );
        
        popup.style.display = 'block';
        popup.style.left = e.point.x + 15 + 'px';
        popup.style.top = e.point.y + 15 + 'px';
      }
    });

    map.on('mouseleave', 'postcodes-fill', () => {
      map.getCanvas().style.cursor = '';
      popup.style.display = 'none';
    });
  });
}

init().catch(console.error);
