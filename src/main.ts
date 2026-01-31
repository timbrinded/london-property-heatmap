import mapboxgl from 'mapbox-gl';

// Mapbox access token
mapboxgl.accessToken = 'pk.eyJ1IjoidGltLXNiIiwiYSI6ImNta3lnbTI1czA3ZXAzZ3Iwa3IzZmhqZTYifQ.DQh_zL9rtf4xhfkAYa3xzQ';

interface PostcodeData {
  district: string;
  medianPrice: number;
  percentDiff: number;
  sampleSize: number;
}

interface School {
  name: string;
  type: 'boys' | 'girls' | 'co-ed';
  founded: number;
  ranking: number;
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

// School marker colors by type  
const SCHOOL_COLORS: Record<string, string> = {
  boys: '#4FC3F7',
  girls: '#F48FB1',
  'co-ed': '#AED581'
};

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

async function loadTransport(): Promise<GeoJSON.FeatureCollection> {
  const response = await fetch('/data/transport-lines.json');
  return response.json();
}

async function loadSchools(): Promise<GeoJSON.FeatureCollection> {
  const response = await fetch('/data/schools.json');
  return response.json();
}

function setupToggle(id: string, callback: (checked: boolean) => void) {
  const toggle = document.getElementById(id) as HTMLInputElement;
  if (toggle) {
    toggle.addEventListener('change', () => callback(toggle.checked));
  }
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

  // Load all data
  const [priceData, geoData, transportData, schoolsData] = await Promise.all([
    loadData(),
    loadGeoJSON(),
    loadTransport(),
    loadSchools()
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
    // === POSTCODE HEATMAP LAYERS ===
    map.addSource('postcodes', {
      type: 'geojson',
      data: geoData
    });

    map.addLayer({
      id: 'postcodes-fill',
      type: 'fill',
      source: 'postcodes',
      paint: {
        'fill-color': ['get', 'color'],
        'fill-opacity': 0.75
      }
    });

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

    // === TRANSPORT LAYERS ===
    map.addSource('transport', {
      type: 'geojson',
      data: transportData
    });

    // Transport lines - wider glow
    map.addLayer({
      id: 'transport-glow',
      type: 'line',
      source: 'transport',
      layout: {
        'visibility': 'none',
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 8,
        'line-opacity': 0.3,
        'line-blur': 4
      }
    });

    // Transport lines - core
    map.addLayer({
      id: 'transport-lines',
      type: 'line',
      source: 'transport',
      layout: {
        'visibility': 'none',
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 3,
        'line-opacity': 0.9
      }
    });

    // === SCHOOLS LAYERS ===
    map.addSource('schools', {
      type: 'geojson',
      data: schoolsData
    });

    // School markers - glow
    map.addLayer({
      id: 'schools-glow',
      type: 'circle',
      source: 'schools',
      layout: { 'visibility': 'none' },
      paint: {
        'circle-radius': 18,
        'circle-color': [
          'match', ['get', 'type'],
          'boys', SCHOOL_COLORS.boys,
          'girls', SCHOOL_COLORS.girls,
          SCHOOL_COLORS['co-ed']
        ],
        'circle-opacity': 0.25,
        'circle-blur': 1
      }
    });

    // School markers - main
    map.addLayer({
      id: 'schools-markers',
      type: 'circle',
      source: 'schools',
      layout: { 'visibility': 'none' },
      paint: {
        'circle-radius': 10,
        'circle-color': [
          'match', ['get', 'type'],
          'boys', SCHOOL_COLORS.boys,
          'girls', SCHOOL_COLORS.girls,
          SCHOOL_COLORS['co-ed']
        ],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff'
      }
    });

    // School labels
    map.addLayer({
      id: 'schools-labels',
      type: 'symbol',
      source: 'schools',
      layout: {
        'visibility': 'none',
        'text-field': ['get', 'name'],
        'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
        'text-size': 11,
        'text-offset': [0, 1.8],
        'text-anchor': 'top',
        'text-max-width': 10
      },
      paint: {
        'text-color': '#ffffff',
        'text-halo-color': 'rgba(0, 0, 0, 0.8)',
        'text-halo-width': 1.5
      }
    });

    // === HOVER EFFECTS ===
    const popup = document.getElementById('popup')!;
    const popupDistrict = document.getElementById('popup-district')!;
    const popupPrice = document.getElementById('popup-price')!;
    const popupDiff = document.getElementById('popup-diff')!;

    // Postcode hover
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

    // Transport hover
    map.on('mouseenter', 'transport-lines', () => {
      map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', 'transport-lines', () => {
      map.getCanvas().style.cursor = '';
    });

    // School hover - show tooltip with details
    const schoolTooltip = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      className: 'school-popup'
    });

    map.on('mouseenter', 'schools-markers', (e) => {
      map.getCanvas().style.cursor = 'pointer';
      
      if (e.features && e.features.length > 0) {
        const feature = e.features[0];
        const props = feature.properties as School;
        const coords = (feature.geometry as GeoJSON.Point).coordinates;
        
        const typeLabel = props.type === 'co-ed' ? 'Co-educational' : 
                         props.type === 'boys' ? "Boys' school" : "Girls' school";
        
        schoolTooltip
          .setLngLat(coords as [number, number])
          .setHTML(`
            <strong>${props.name}</strong><br>
            <span style="color: ${SCHOOL_COLORS[props.type]}">${typeLabel}</span><br>
            <span style="opacity: 0.7">Founded ${props.founded}</span>
          `)
          .addTo(map);
      }
    });

    map.on('mouseleave', 'schools-markers', () => {
      map.getCanvas().style.cursor = '';
      schoolTooltip.remove();
    });

    // === TOGGLE HANDLERS ===
    setupToggle('toggle-transport', (checked) => {
      const visibility = checked ? 'visible' : 'none';
      map.setLayoutProperty('transport-glow', 'visibility', visibility);
      map.setLayoutProperty('transport-lines', 'visibility', visibility);
    });

    setupToggle('toggle-schools', (checked) => {
      const visibility = checked ? 'visible' : 'none';
      map.setLayoutProperty('schools-glow', 'visibility', visibility);
      map.setLayoutProperty('schools-markers', 'visibility', visibility);
      map.setLayoutProperty('schools-labels', 'visibility', visibility);
    });
  });
}

init().catch(console.error);
