import mapboxgl from 'mapbox-gl';

// Mapbox access token
mapboxgl.accessToken = 'pk.eyJ1IjoidGltLXNiIiwiYSI6ImNta3lnbTI1czA3ZXAzZ3Iwa3IzZmhqZTYifQ.DQh_zL9rtf4xhfkAYa3xzQ';

interface PostcodeData {
  district: string;
  medianPrice: number;
  medianHousesPrice: number;
  medianFlatsPrice: number;
  percentDiff: number;
  percentDiffHouses: number;
  percentDiffFlats?: number;
  sampleSize: number;
  housesSampleSize: number;
  flatsSampleSize: number;
}

interface SchoolProperties {
  name: string;
  type: 'boys' | 'girls' | 'co-ed';
  founded?: number;
  ranking: number;
  feesPerYear?: number;
  website?: string;
  wikiUrl?: string;
  image?: string;
  highlights?: string;
  aLevelPercent?: number;
  gcsePercent?: number;
}

// E14 (Millwall/Isle of Dogs) baseline - will be calculated from data
const BASELINE_DISTRICT = 'E14';
let baselinePrice = 0;
let baselineHousesPrice = 0;
let baselineFlatsPrice = 0;

// Property type filter
type PropertyType = 'all' | 'houses' | 'flats';

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
  const response = await fetch('./data/prices.json');
  return response.json();
}

async function loadGeoJSON(): Promise<GeoJSON.FeatureCollection> {
  const response = await fetch('./data/postcode-districts.geojson');
  return response.json();
}

async function loadTransport(): Promise<GeoJSON.FeatureCollection> {
  const response = await fetch('./data/transport-lines.json');
  return response.json();
}

async function loadSchools(): Promise<GeoJSON.FeatureCollection> {
  // Load from Notion-synced schools.json (has rich metadata: images, highlights, website, stats)
  const response = await fetch('./data/schools.json');
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
  feeBand: 'all' | 'under25k' | '25k-35k' | '35k-50k' | 'over50k';
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

  // Get baseline prices for all property types
  const baseline = priceLookup.get(BASELINE_DISTRICT);
  if (baseline) {
    baselinePrice = baseline.medianPrice;
    baselineHousesPrice = baseline.medianHousesPrice;
    baselineFlatsPrice = baseline.medianFlatsPrice;
    document.getElementById('baseline-price')!.textContent = 
      `Median: ${formatPrice(baselinePrice)}`;
  }

  // Helper to calculate percent diff for flats (not in source data)
  function calcFlatsPercentDiff(flatsPrice: number): number {
    if (!flatsPrice || !baselineFlatsPrice) return 0;
    return ((flatsPrice - baselineFlatsPrice) / baselineFlatsPrice) * 100;
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
        medianHousesPrice: data?.medianHousesPrice || 0,
        medianFlatsPrice: data?.medianFlatsPrice || 0,
        percentDiff: data?.percentDiff || 0,
        percentDiffHouses: data?.percentDiffHouses || 0,
        percentDiffFlats: data ? calcFlatsPercentDiff(data.medianFlatsPrice) : 0,
        sampleSize: data?.sampleSize || 0,
        housesSampleSize: data?.housesSampleSize || 0,
        flatsSampleSize: data?.flatsSampleSize || 0,
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
    feeBand: 'all'
  };

  // Property type filter
  let propertyType: PropertyType = 'all';

  // Helper to update postcode layer colors based on property type
  function updatePostcodeColors() {
    if (!map.getLayer('postcodes-fill')) return;
    
    // Determine which diff field to use for coloring
    const diffField = propertyType === 'houses' ? 'percentDiffHouses' : 
                      propertyType === 'flats' ? 'percentDiffFlats' : 'percentDiff';
    
    // Update baseline display
    const basePrice = propertyType === 'houses' ? baselineHousesPrice : 
                      propertyType === 'flats' ? baselineFlatsPrice : baselinePrice;
    const typeLabel = propertyType === 'houses' ? ' (Houses)' : 
                      propertyType === 'flats' ? ' (Flats)' : '';
    document.getElementById('baseline-price')!.textContent = 
      `Median${typeLabel}: ${formatPrice(basePrice)}`;
    
    // Dynamically compute color based on selected property type's percent diff
    map.setPaintProperty('postcodes-fill', 'fill-color', [
      'case',
      ['<=', ['get', diffField], -40], '#1b5e20',
      ['<=', ['get', diffField], -20], '#388e3c',
      ['<=', ['get', diffField], -5], '#66bb6a',
      ['<=', ['get', diffField], 5], '#64b5f6',
      ['<=', ['get', diffField], 30], '#ff9800',
      ['<=', ['get', diffField], 70], '#f44336',
      '#b71c1c'
    ]);
  }

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
    
    // If no ranking filters selected, hide all
    if (!anyRankingSelected) {
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
    
    // Build fee band condition (single-select)
    let feeCondition: any = ['literal', true]; // 'all' means no fee filter
    
    switch (schoolFilters.feeBand) {
      case 'under25k':
        feeCondition = ['all', 
          ['has', 'feesPerYear'],
          ['>', ['get', 'feesPerYear'], 0],
          ['<', ['get', 'feesPerYear'], 25000]
        ];
        break;
      case '25k-35k':
        feeCondition = ['all', 
          ['has', 'feesPerYear'],
          ['>=', ['get', 'feesPerYear'], 25000],
          ['<', ['get', 'feesPerYear'], 35000]
        ];
        break;
      case '35k-50k':
        feeCondition = ['all', 
          ['has', 'feesPerYear'],
          ['>=', ['get', 'feesPerYear'], 35000],
          ['<', ['get', 'feesPerYear'], 50000]
        ];
        break;
      case 'over50k':
        feeCondition = ['all', 
          ['has', 'feesPerYear'],
          ['>=', ['get', 'feesPerYear'], 50000]
        ];
        break;
      // 'all' uses the default ['literal', true]
    }
    
    // Combine ranking and fee conditions
    const finalFilter: any = ['all', rankingConditions, feeCondition];
    
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
        
        // Get price and diff based on current property type filter
        const price = propertyType === 'houses' ? props.medianHousesPrice : 
                      propertyType === 'flats' ? props.medianFlatsPrice : props.medianPrice;
        const diff = propertyType === 'houses' ? props.percentDiffHouses : 
                     propertyType === 'flats' ? props.percentDiffFlats : props.percentDiff;
        
        popupDistrict.textContent = props.name || props.POSTCODE || 'Unknown';
        popupPrice.textContent = formatPrice(price || 0);
        popupPrice.style.color = getColor(diff || 0);
        
        popupDiff.textContent = formatDiff(diff || 0);
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
          feesHtml = `<br><span style="color: #4caf50">💰 ${formatFees(props.feesPerYear)}</span>`;
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

    // School click - show detailed popup
    const schoolDetailPopup = new mapboxgl.Popup({
      closeButton: true,
      closeOnClick: true,
      className: 'school-detail-popup',
      maxWidth: '320px'
    });

    map.on('click', 'schools-markers', async (e) => {
      if (e.features && e.features.length > 0) {
        const feature = e.features[0];
        const props = feature.properties as SchoolProperties;
        const coords = (feature.geometry as GeoJSON.Point).coordinates;
        
        const typeLabel = props.type === 'co-ed' ? 'Co-educational' : 
                         props.type === 'boys' ? "Boys' school" : "Girls' school";
        const typeColor = SCHOOL_COLORS[props.type] || SCHOOL_COLORS['co-ed'];
        
        // Generate unique ID for this popup's image
        const popupId = `school-img-${Date.now()}`;
        
        // Show loading placeholder if we have a wiki URL to fetch
        let imageHtml = '';
        if (props.wikiUrl) {
          imageHtml = `<div id="${popupId}" class="school-popup-image-container">
            <div class="school-popup-image-loading">Loading image...</div>
          </div>`;
        }
        
        let statsHtml = '';
        if (props.aLevelPercent || props.gcsePercent) {
          statsHtml = '<div style="display:flex;gap:12px;margin:8px 0;">';
          if (props.aLevelPercent) {
            statsHtml += `<div style="flex:1;background:rgba(255,255,255,0.1);padding:8px;border-radius:6px;text-align:center;">
              <div style="font-size:18px;font-weight:bold;color:#4caf50">${props.aLevelPercent}%</div>
              <div style="font-size:10px;opacity:0.7">A Level A*-A</div>
            </div>`;
          }
          if (props.gcsePercent) {
            statsHtml += `<div style="flex:1;background:rgba(255,255,255,0.1);padding:8px;border-radius:6px;text-align:center;">
              <div style="font-size:18px;font-weight:bold;color:#64b5f6">${props.gcsePercent}%</div>
              <div style="font-size:10px;opacity:0.7">GCSE 9-7</div>
            </div>`;
          }
          statsHtml += '</div>';
        }
        
        let feesHtml = '';
        if (props.feesPerYear) {
          feesHtml = `<div style="margin:8px 0;"><span style="opacity:0.7">💰 Fees:</span> <strong>£${(props.feesPerYear / 1000).toFixed(0)}k/year</strong></div>`;
        }
        
        let highlightsHtml = '';
        if (props.highlights) {
          highlightsHtml = `<div style="margin:10px 0;padding:10px;background:rgba(255,255,255,0.05);border-radius:6px;font-size:12px;line-height:1.5;">
            ✨ ${props.highlights}
          </div>`;
        }
        
        let websiteHtml = '';
        if (props.website) {
          websiteHtml = `<a href="${props.website}" target="_blank" rel="noopener" style="display:block;margin-top:12px;padding:10px;background:${typeColor};color:#000;text-decoration:none;border-radius:6px;text-align:center;font-weight:600;">
            🌐 Visit Website
          </a>`;
        }
        
        const foundedText = props.founded ? ` • Est. ${props.founded}` : '';
        
        schoolDetailPopup
          .setLngLat(coords as [number, number])
          .setHTML(`
            ${imageHtml}
            <div class="school-popup-content">
              <div style="font-size:16px;font-weight:bold;margin-bottom:4px;">${props.name}</div>
              <div style="color:${typeColor};font-size:13px;">${typeLabel}${foundedText}</div>
              <div style="font-size:12px;opacity:0.7;margin-top:4px;">📊 Ranking: #${props.ranking}</div>
              ${statsHtml}
              ${feesHtml}
              ${highlightsHtml}
              ${websiteHtml}
            </div>
          `)
          .addTo(map);
        
        // Remove hover tooltip when detail popup opens
        schoolTooltip.remove();
        
        // Lazy-load Wikipedia image if we have a wiki URL
        if (props.wikiUrl) {
          try {
            const apiUrl = `/api/wiki-image?url=${encodeURIComponent(props.wikiUrl)}`;
            const response = await fetch(apiUrl);
            if (response.ok) {
              const data = await response.json();
              const container = document.getElementById(popupId);
              if (container && data.thumbnail) {
                container.innerHTML = `<img src="${data.thumbnail}" alt="${props.name}" class="school-popup-image" onerror="this.parentElement.style.display='none'">`;
              } else if (container) {
                container.style.display = 'none';
              }
            }
          } catch (err) {
            // Silently fail - image is optional
            const container = document.getElementById(popupId);
            if (container) container.style.display = 'none';
          }
        }
      }
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
    
    // School ranking toggles (checkboxes)
    const rankingToggleIds: Array<{id: string; key: 'top25' | 'top100' | 'top250'}> = [
      { id: 'toggle-schools-top25', key: 'top25' },
      { id: 'toggle-schools-top100', key: 'top100' },
      { id: 'toggle-schools-top250', key: 'top250' }
    ];
    
    rankingToggleIds.forEach(({ id, key }) => {
      const toggle = document.getElementById(id) as HTMLInputElement;
      if (toggle) {
        toggle.addEventListener('change', () => {
          schoolFilters[key] = toggle.checked;
          updateSchoolLayers();
        });
      }
    });
    
    // Fee band radio buttons (single-select)
    const feeBandRadios = document.querySelectorAll('input[name="fee-band"]');
    feeBandRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        schoolFilters.feeBand = target.value as SchoolFilters['feeBand'];
        updateSchoolLayers();
      });
    });
    
    // Property type radio buttons
    const propertyTypeRadios = document.querySelectorAll('input[name="property-type"]');
    propertyTypeRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        propertyType = target.value as PropertyType;
        updatePostcodeColors();
      });
    });
  });
}

init().catch(console.error);
