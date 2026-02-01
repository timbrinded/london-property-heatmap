import mapboxgl from 'mapbox-gl';

// Mapbox access token
mapboxgl.accessToken = 'pk.eyJ1IjoidGltLXNiIiwiYSI6ImNta3lnbTI1czA3ZXAzZ3Iwa3IzZmhqZTYifQ.DQh_zL9rtf4xhfkAYa3xzQ';

interface PostcodeData {
  district: string;
  medianPrice: number;
  percentDiff: number;
  sampleSize: number;
}

interface SchoolProperties {
  name: string;
  type: 'boys' | 'girls' | 'co-ed';
  founded: number;
  ranking: number;
  feesPerYear?: number;
  feesEstimated?: boolean;
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

function formatFees(fees: number): string {
  return `£${(fees / 1000).toFixed(0)}k/year`;
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
  // Try to load schools with fees first, fall back to regular schools
  try {
    const response = await fetch('/data/schools-with-fees.json');
    if (response.ok) {
      return response.json();
    }
  } catch (e) {
    // Fall back to original schools.json
  }
  const response = await fetch('/data/schools.json');
  return response.json();
}

// Transport filter state
interface TransportFilters {
  underground: boolean;
  elizabeth: boolean;
  dlr: boolean;
  overground: boolean;
}

// School filter state
interface SchoolFilters {
  top25: boolean;
  top100: boolean;
  top250: boolean;
  fees15k: boolean;
  fees25k: boolean;
  fees35k: boolean;
  fees50k: boolean;
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

  // Filter state
  const transportFilters: TransportFilters = {
    underground: true,
    elizabeth: true,
    dlr: true,
    overground: true
  };

  const schoolFilters: SchoolFilters = {
    top25: true,
    top100: true,
    top250: true,
    fees15k: true,
    fees25k: true,
    fees35k: true,
    fees50k: true
  };

  // Helper to update transport layer visibility
  function updateTransportLayers() {
    if (!map.getLayer('transport-lines')) return;
    
    // Build filter expression for transport
    const typeFilters: any[] = ['any'];
    
    if (transportFilters.underground) {
      typeFilters.push(['==', ['get', 'type'], 'tube']);
    }
    if (transportFilters.elizabeth) {
      typeFilters.push(['==', ['get', 'type'], 'elizabeth']);
    }
    if (transportFilters.dlr) {
      typeFilters.push(['==', ['get', 'type'], 'dlr']);
    }
    if (transportFilters.overground) {
      typeFilters.push(['any', 
        ['==', ['get', 'type'], 'overground'],
        ['==', ['get', 'type'], 'national']
      ]);
    }
    
    // If no filters selected, hide all
    const anySelected = Object.values(transportFilters).some(v => v);
    if (!anySelected) {
      map.setLayoutProperty('transport-glow', 'visibility', 'none');
      map.setLayoutProperty('transport-lines', 'visibility', 'none');
    } else {
      map.setLayoutProperty('transport-glow', 'visibility', 'visible');
      map.setLayoutProperty('transport-lines', 'visibility', 'visible');
      map.setFilter('transport-glow', typeFilters);
      map.setFilter('transport-lines', typeFilters);
    }
  }

  // Helper to update school layer visibility based on filters
  function updateSchoolLayers() {
    if (!map.getLayer('schools-markers')) return;
    
    const anyRankingSelected = schoolFilters.top25 || schoolFilters.top100 || schoolFilters.top250;
    const anyFeesSelected = schoolFilters.fees15k || schoolFilters.fees25k || schoolFilters.fees35k || schoolFilters.fees50k;
    
    // If no filters selected, hide all
    if (!anyRankingSelected && !anyFeesSelected) {
      map.setLayoutProperty('schools-glow', 'visibility', 'none');
      map.setLayoutProperty('schools-markers', 'visibility', 'none');
      map.setLayoutProperty('schools-labels', 'visibility', 'none');
      return;
    }
    
    // Build ranking conditions
    const rankingConditions: any[] = ['any'];
    if (schoolFilters.top25) {
      rankingConditions.push(['<=', ['get', 'ranking'], 25]);
    }
    if (schoolFilters.top100) {
      rankingConditions.push(['all', 
        ['>', ['get', 'ranking'], 25],
        ['<=', ['get', 'ranking'], 100]
      ]);
    }
    if (schoolFilters.top250) {
      rankingConditions.push(['all', 
        ['>', ['get', 'ranking'], 100],
        ['<=', ['get', 'ranking'], 250]
      ]);
    }
    
    // Build fee conditions - find the LOWEST enabled threshold
    // (if >50k is on, we only want >50k; if >15k is on, we want >15k)
    let minFeeThreshold = 0;
    if (schoolFilters.fees50k) minFeeThreshold = 50000;
    else if (schoolFilters.fees35k) minFeeThreshold = 35000;
    else if (schoolFilters.fees25k) minFeeThreshold = 25000;
    else if (schoolFilters.fees15k) minFeeThreshold = 15000;
    
    const feeCondition: any = minFeeThreshold > 0 
      ? ['all', ['has', 'feesPerYear'], ['>=', ['get', 'feesPerYear'], minFeeThreshold]]
      : ['literal', true];
    
    // Build final filter based on which types are active
    let finalFilter: any;
    
    if (anyRankingSelected && anyFeesSelected) {
      // BOTH active: must match ranking AND fees
      finalFilter = ['all', rankingConditions, feeCondition];
    } else if (anyRankingSelected) {
      // Only ranking: use ranking conditions
      finalFilter = rankingConditions;
    } else {
      // Only fees: use fee condition
      finalFilter = feeCondition;
    }
    
    map.setLayoutProperty('schools-glow', 'visibility', 'visible');
    map.setLayoutProperty('schools-markers', 'visibility', 'visible');
    map.setLayoutProperty('schools-labels', 'visibility', 'visible');
    map.setFilter('schools-glow', finalFilter);
    map.setFilter('schools-markers', finalFilter);
    map.setFilter('schools-labels', finalFilter);
  }

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
        'visibility': 'visible',
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
        'visibility': 'visible',
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
      layout: { 'visibility': 'visible' },
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
      layout: { 'visibility': 'visible' },
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
        'visibility': 'visible',
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

    // Apply initial filters (all on by default)
    updateTransportLayers();
    updateSchoolLayers();

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
        const props = feature.properties as SchoolProperties;
        const coords = (feature.geometry as GeoJSON.Point).coordinates;
        
        const typeLabel = props.type === 'co-ed' ? 'Co-educational' : 
                         props.type === 'boys' ? "Boys' school" : "Girls' school";
        
        let feesHtml = '';
        if (props.feesPerYear) {
          const estimated = props.feesEstimated ? ' (est.)' : '';
          feesHtml = `<br><span style="color: #4caf50">💰 ${formatFees(props.feesPerYear)}${estimated}</span>`;
        }
        
        schoolTooltip
          .setLngLat(coords as [number, number])
          .setHTML(`
            <strong>${props.name}</strong><br>
            <span style="color: ${SCHOOL_COLORS[props.type]}">${typeLabel}</span><br>
            <span style="opacity: 0.7">Rank #${props.ranking} • Founded ${props.founded}</span>
            ${feesHtml}
          `)
          .addTo(map);
      }
    });

    map.on('mouseleave', 'schools-markers', () => {
      map.getCanvas().style.cursor = '';
      schoolTooltip.remove();
    });

    // === TOGGLE HANDLERS ===
    
    // Transport toggles
    const transportToggleIds: Array<{id: string; key: keyof TransportFilters}> = [
      { id: 'toggle-underground', key: 'underground' },
      { id: 'toggle-elizabeth', key: 'elizabeth' },
      { id: 'toggle-dlr', key: 'dlr' },
      { id: 'toggle-overground', key: 'overground' }
    ];
    
    transportToggleIds.forEach(({ id, key }) => {
      const toggle = document.getElementById(id) as HTMLInputElement;
      if (toggle) {
        toggle.addEventListener('change', () => {
          transportFilters[key] = toggle.checked;
          updateTransportLayers();
        });
      }
    });
    
    // School toggles
    const schoolToggleIds: Array<{id: string; key: keyof SchoolFilters}> = [
      { id: 'toggle-schools-top25', key: 'top25' },
      { id: 'toggle-schools-top100', key: 'top100' },
      { id: 'toggle-schools-top250', key: 'top250' },
      { id: 'toggle-fees-15k', key: 'fees15k' },
      { id: 'toggle-fees-25k', key: 'fees25k' },
      { id: 'toggle-fees-35k', key: 'fees35k' },
      { id: 'toggle-fees-50k', key: 'fees50k' }
    ];
    
    schoolToggleIds.forEach(({ id, key }) => {
      const toggle = document.getElementById(id) as HTMLInputElement;
      if (toggle) {
        toggle.addEventListener('change', () => {
          schoolFilters[key] = toggle.checked;
          updateSchoolLayers();
        });
      }
    });
  });
}

init().catch(console.error);
