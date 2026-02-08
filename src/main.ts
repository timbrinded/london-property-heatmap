import mapboxgl from 'mapbox-gl';

// Mapbox access token
mapboxgl.accessToken = 'pk.eyJ1IjoidGltLXNiIiwiYSI6ImNta3lnbTI1czA3ZXAzZ3Iwa3IzZmhqZTYifQ.DQh_zL9rtf4xhfkAYa3xzQ';

interface PostcodeData {
  district: string;
  // New £/sqft fields
  medianPricePerSqft?: number;
  medianHousesPricePerSqft?: number | null;
  medianFlatsPricePerSqft?: number | null;
  // Legacy median price fields
  medianPrice?: number;
  medianHousesPrice?: number;
  medianFlatsPrice?: number;
  percentDiff: number;
  percentDiffHouses: number | null;
  percentDiffFlats?: number | null;
  sampleSize: number;
  housesSampleSize: number;
  flatsSampleSize: number;
  medianFloorArea?: number;
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
  ageRange?: string;
}

// Postcode district → area name mapping
const AREA_NAMES: Record<string, string> = {
  E1: 'Whitechapel', E2: 'Bethnal Green', E3: 'Bow', E4: 'Chingford', E5: 'Clapton',
  E6: 'East Ham', E7: 'Forest Gate', E8: 'Hackney', E9: 'Homerton', E10: 'Leyton',
  E11: 'Leytonstone', E14: 'Canary Wharf', E15: 'Stratford', E16: 'Silvertown',
  E17: 'Walthamstow', E18: 'South Woodford',
  EC1: 'Clerkenwell', EC2: 'Moorgate', EC3: 'Fenchurch', EC4: 'Fleet Street',
  N1: 'Islington', N2: 'East Finchley', N3: 'Finchley', N4: 'Finsbury Park',
  N5: 'Highbury', N6: 'Highgate', N7: 'Holloway', N8: 'Hornsey', N9: 'Edmonton',
  N10: 'Muswell Hill', N11: 'New Southgate', N12: 'North Finchley', N13: 'Palmers Green',
  N14: 'Southgate', N15: 'Seven Sisters', N16: 'Stoke Newington', N17: 'Tottenham',
  N18: 'Upper Edmonton', N19: 'Archway', N20: 'Whetstone', N21: 'Winchmore Hill',
  N22: 'Wood Green',
  NW1: 'Camden', NW2: 'Cricklewood', NW3: 'Hampstead', NW4: 'Hendon',
  NW5: 'Kentish Town', NW6: 'Kilburn', NW7: 'Mill Hill', NW8: "St John's Wood",
  NW9: 'The Hyde', NW10: 'Willesden', NW11: 'Golders Green',
  SE1: 'Waterloo', SE2: 'Abbey Wood', SE3: 'Blackheath', SE4: 'Brockley',
  SE5: 'Camberwell', SE6: 'Catford', SE7: 'Charlton', SE8: 'Deptford',
  SE9: 'Eltham', SE10: 'Greenwich', SE11: 'Kennington', SE12: 'Lee',
  SE13: 'Lewisham', SE14: 'New Cross', SE15: 'Peckham', SE16: 'Rotherhithe',
  SE17: 'Walworth', SE18: 'Woolwich', SE19: 'Crystal Palace', SE20: 'Anerley',
  SE21: 'Dulwich', SE22: 'East Dulwich', SE23: 'Forest Hill', SE24: 'Herne Hill',
  SE25: 'South Norwood', SE26: 'Sydenham', SE27: 'West Norwood', SE28: 'Thamesmead',
  SW1: 'Westminster', SW2: 'Brixton', SW3: 'Chelsea', SW4: 'Clapham',
  SW5: "Earl's Court", SW6: 'Fulham', SW7: 'South Kensington', SW8: 'South Lambeth',
  SW9: 'Stockwell', SW10: 'West Brompton', SW11: 'Battersea', SW12: 'Balham',
  SW13: 'Barnes', SW14: 'Mortlake', SW15: 'Putney', SW16: 'Streatham',
  SW17: 'Tooting', SW18: 'Wandsworth', SW19: 'Wimbledon', SW20: 'West Wimbledon',
  W1: 'Mayfair', W2: 'Paddington', W3: 'Acton', W4: 'Chiswick', W5: 'Ealing',
  W6: 'Hammersmith', W7: 'Hanwell', W8: 'Kensington', W9: 'Maida Vale',
  W10: 'North Kensington', W11: 'Notting Hill', W12: "Shepherd's Bush",
  W13: 'West Ealing', W14: 'West Kensington',
  WC1: 'Bloomsbury', WC2: 'Covent Garden',
  BR1: 'Bromley', BR2: 'Hayes', BR3: 'Beckenham', BR4: 'West Wickham',
  BR5: "St Paul's Cray", BR6: 'Orpington', BR7: 'Chislehurst', BR8: 'Swanley',
  CR0: 'Croydon', CR2: 'South Croydon', CR4: 'Mitcham', CR5: 'Coulsdon',
  CR7: 'Thornton Heath', CR8: 'Purley',
  DA1: 'Dartford', DA5: 'Bexley', DA6: 'Bexleyheath', DA7: 'Barnes Cray',
  DA8: 'Erith', DA14: 'Sidcup', DA15: 'Blackfen', DA16: 'Welling',
  DA17: 'Belvedere', DA18: 'Erith Marshes',
  EN1: 'Enfield', EN2: 'Enfield Chase', EN3: 'Enfield Highway', EN4: 'Barnet', EN5: 'Barnet',
  HA0: 'Wembley', HA1: 'Harrow', HA2: 'Harrow Weald', HA3: 'Kenton',
  HA4: 'Ruislip', HA5: 'Pinner', HA6: 'Northwood', HA7: 'Stanmore',
  HA8: 'Edgware', HA9: 'Wembley',
  IG1: 'Ilford', IG2: 'Gants Hill', IG3: 'Seven Kings', IG4: 'Redbridge',
  IG5: 'Clayhall', IG6: 'Barkingside', IG7: 'Chigwell', IG8: 'Woodford Green',
  IG11: 'Barking',
  KT1: 'Kingston', KT2: 'Kingston Hill', KT3: 'New Malden', KT4: 'Worcester Park',
  KT5: 'Surbiton', KT6: 'Surbiton',
  RM1: 'Romford', RM2: 'Gidea Park', RM3: 'Harold Hill', RM5: 'Collier Row',
  RM6: 'Chadwell Heath', RM7: 'Rush Green', RM8: 'Dagenham', RM9: 'Becontree',
  RM10: 'Dagenham', RM11: 'Hornchurch', RM12: 'Hornchurch', RM13: 'Rainham',
  RM14: 'Upminster',
  SM1: 'Sutton', SM2: 'Belmont', SM3: 'Cheam', SM4: 'Morden',
  SM5: 'Carshalton', SM6: 'Wallington',
  TW1: 'Twickenham', TW2: 'Whitton', TW3: 'Hounslow', TW4: 'Hounslow West',
  TW5: 'Heston', TW7: 'Isleworth', TW8: 'Brentford', TW9: 'Richmond',
  TW10: 'Ham', TW11: 'Teddington', TW12: 'Hampton', TW13: 'Feltham', TW14: 'Feltham',
  UB1: 'Southall', UB2: 'Norwood Green', UB3: 'Hayes', UB4: 'Yeading',
  UB5: 'Northolt', UB6: 'Greenford', UB7: 'West Drayton', UB8: 'Uxbridge',
  UB9: 'Denham', UB10: 'Hillingdon',
  WD6: 'Borehamwood', WD23: 'Bushey', WD25: 'Watford'
};

// E14 (Millwall/Isle of Dogs) baseline - will be calculated from data
const BASELINE_DISTRICT = 'E14';
let baselinePricePerSqft = 0;
let baselineHousesPricePerSqft = 0;
let baselineFlatsPricePerSqft = 0;

// Detect data schema and use £/sqft if available, fallback to median price
let useSqft = false;

function getMainPrice(d: PostcodeData): number {
  return useSqft ? (d.medianPricePerSqft || 0) : (d.medianPrice || 0);
}
function getHousesPrice(d: PostcodeData): number {
  return useSqft ? (d.medianHousesPricePerSqft || 0) : (d.medianHousesPrice || 0);
}
function getFlatsPrice(d: PostcodeData): number {
  return useSqft ? (d.medianFlatsPricePerSqft || 0) : (d.medianFlatsPrice || 0);
}

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

function formatPricePerSqft(price: number): string {
  return `£${Math.round(price)}/sqft`;
}

function formatPrice(price: number): string {
  if (price >= 1000000) {
    return `£${(price / 1000000).toFixed(2)}M`;
  }
  return `£${(price / 1000).toFixed(0)}K`;
}

function formatPriceAuto(price: number): string {
  return useSqft ? formatPricePerSqft(price) : formatPrice(price);
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

async function loadSqftData(): Promise<PostcodeData[] | null> {
  try {
    const response = await fetch('./data/prices-sqft.json');
    if (!response.ok) return null;
    const data = await response.json();
    return data.length > 0 ? data : null;
  } catch {
    return null;
  }
}

async function loadGeoJSON(): Promise<GeoJSON.FeatureCollection> {
  const response = await fetch('./data/postcode-districts.geojson');
  return response.json();
}

async function loadTransport(): Promise<GeoJSON.FeatureCollection> {
  const response = await fetch('./data/transport-lines.json');
  return response.json();
}

async function loadThames(): Promise<GeoJSON.FeatureCollection> {
  const response = await fetch('./data/thames.json');
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
  const [medianData, geoData, transportData, schoolsData, sqftData, thamesData] = await Promise.all([
    loadData(),
    loadGeoJSON(),
    loadTransport(),
    loadSchools(),
    loadSqftData(),
    loadThames()
  ]);

  // Store original GeoJSON features for rebuilding
  const originalFeatures = geoData.features.map(f => ({ ...f }));

  // Enable sqft toggle if data exists
  const hasSqftData = sqftData != null && sqftData.length > 0;
  if (hasSqftData) {
    const sqftOption = document.getElementById('sqft-option');
    const sqftUnavail = document.getElementById('sqft-unavailable');
    if (sqftOption) sqftOption.style.display = '';
    if (sqftUnavail) sqftUnavail.style.display = 'none';
  }

  // Build lookup + merge for a given dataset
  function applyDataSource(priceData: PostcodeData[], isSqft: boolean) {
    useSqft = isSqft;

    const priceLookup = new Map<string, PostcodeData>();
    priceData.forEach(d => priceLookup.set(d.district, d));

    const baseline = priceLookup.get(BASELINE_DISTRICT);
    if (baseline) {
      baselinePricePerSqft = getMainPrice(baseline);
      baselineHousesPricePerSqft = getHousesPrice(baseline) || baselinePricePerSqft;
      baselineFlatsPricePerSqft = getFlatsPrice(baseline) || baselinePricePerSqft;
    }

    function calcFlatsPercentDiff(d: PostcodeData): number {
      const flatsPrice = getFlatsPrice(d);
      if (!flatsPrice || !baselineFlatsPricePerSqft) return 0;
      return ((flatsPrice - baselineFlatsPricePerSqft) / baselineFlatsPricePerSqft) * 100;
    }

    geoData.features = originalFeatures.map(feature => {
      const district = feature.properties?.name || feature.properties?.POSTCODE;
      const data = priceLookup.get(district);
      
      return {
        ...feature,
        properties: {
          ...feature.properties,
          areaName: AREA_NAMES[district] || '',
          mainPrice: data ? getMainPrice(data) : 0,
          housesPrice: data ? getHousesPrice(data) : 0,
          flatsPrice: data ? getFlatsPrice(data) : 0,
          percentDiff: data?.percentDiff || 0,
          percentDiffHouses: data?.percentDiffHouses || 0,
          percentDiffFlats: data?.percentDiffFlats ?? (data ? calcFlatsPercentDiff(data) : 0),
          sampleSize: data?.sampleSize || 0,
          housesSampleSize: data?.housesSampleSize || 0,
          flatsSampleSize: data?.flatsSampleSize || 0,
          medianFloorArea: data?.medianFloorArea || 0,
          color: data ? getColor(data.percentDiff) : '#333'
        }
      };
    }).filter(f => f.properties.mainPrice > 0);

    // Update UI text
    const title = document.getElementById('panel-title');
    const desc = document.getElementById('panel-description');
    if (title) title.textContent = isSqft ? '🏠 London £/sqft' : '🏠 London Property Prices';
    if (desc) desc.textContent = isSqft 
      ? 'Price per square foot by postcode district (Land Registry + EPC data), relative to your baseline.'
      : 'Median property prices by postcode district, shown relative to your baseline location.';
  }

  // Initial load with median data
  applyDataSource(medianData, false);

  // Function to refresh the map after data source switch
  function refreshMapData() {
    const source = map.getSource('postcodes') as mapboxgl.GeoJSONSource;
    if (source) {
      source.setData(geoData as any);
    }
    updatePostcodeColors();
  }

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
    const basePrice = propertyType === 'houses' ? baselineHousesPricePerSqft : 
                      propertyType === 'flats' ? baselineFlatsPricePerSqft : baselinePricePerSqft;
    const typeLabel = propertyType === 'houses' ? ' (Houses)' : 
                      propertyType === 'flats' ? ' (Flats)' : '';
    document.getElementById('baseline-price')!.textContent = 
      `Median${typeLabel}: ${formatPriceAuto(basePrice)}`;
    
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

    // Postcode district labels
    map.addLayer({
      id: 'postcodes-labels',
      type: 'symbol',
      source: 'postcodes',
      layout: {
        'text-field': ['format',
          ['get', 'name'], { 'font-scale': 1.0 },
          '\n', {},
          ['get', 'areaName'], { 'font-scale': 0.75 }
        ],
        'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
        'text-size': 13,
        'text-allow-overlap': false,
        'text-ignore-placement': false,
        'text-padding': 2
      },
      paint: {
        'text-color': '#ffffff',
        'text-halo-color': 'rgba(0, 0, 0, 0.8)',
        'text-halo-width': 2
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

    // === THAMES LAYER ===
    map.addSource('thames', {
      type: 'geojson',
      data: thamesData
    });

    map.addLayer({
      id: 'thames-line',
      type: 'line',
      source: 'thames',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': '#1a3a5c',
        'line-width': 4,
        'line-opacity': 0.8
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
        const price = propertyType === 'houses' ? props.housesPrice : 
                      propertyType === 'flats' ? props.flatsPrice : props.mainPrice;
        const diff = propertyType === 'houses' ? props.percentDiffHouses : 
                     propertyType === 'flats' ? props.percentDiffFlats : props.percentDiff;
        const floorArea = props.medianFloorArea;
        
        const districtName = props.name || props.POSTCODE || 'Unknown';
        const areaName = props.areaName || AREA_NAMES[districtName] || '';
        popupDistrict.textContent = areaName ? `${districtName} — ${areaName}` : districtName;
        popupPrice.textContent = formatPriceAuto(price || 0);
        popupPrice.style.color = getColor(diff || 0);
        
        const floorAreaText = (useSqft && floorArea) ? ` · ${floorArea}m² avg` : '';
        popupDiff.textContent = formatDiff(diff || 0) + floorAreaText;
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
        
        const ageText = props.ageRange && props.ageRange !== 'Unknown' ? ` • Ages ${props.ageRange}` : '';
        const foundedText = props.founded ? `Founded ${props.founded}` : '';
        
        schoolTooltip
          .setLngLat(coords as [number, number])
          .setHTML(`
            <strong>${props.name}</strong><br>
            <span style="color: ${SCHOOL_COLORS[props.type]}">${typeLabel}</span><br>
            <span style="opacity: 0.7">Rank #${props.ranking}${ageText}${foundedText ? ` • ${foundedText}` : ''}</span>
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
        const ageRangeText = props.ageRange && props.ageRange !== 'Unknown' ? props.ageRange : null;
        
        schoolDetailPopup
          .setLngLat(coords as [number, number])
          .setHTML(`
            ${imageHtml}
            <div class="school-popup-content">
              <div style="font-size:16px;font-weight:bold;margin-bottom:4px;">${props.name}</div>
              <div style="color:${typeColor};font-size:13px;">${typeLabel}${foundedText}</div>
              <div style="font-size:12px;opacity:0.7;margin-top:4px;">
                📊 Ranking: #${props.ranking}${ageRangeText ? ` • 🎂 Ages ${ageRangeText}` : ''}
              </div>
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
    
    // Thames toggle
    const thamesToggle = document.getElementById('toggle-thames') as HTMLInputElement;
    if (thamesToggle) {
      thamesToggle.addEventListener('change', () => {
        map.setLayoutProperty('thames-line', 'visibility', thamesToggle.checked ? 'visible' : 'none');
      });
    }

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

    // Data source toggle
    const dataSourceRadios = document.querySelectorAll('input[name="data-source"]');
    dataSourceRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        if (target.value === 'sqft' && sqftData) {
          applyDataSource(sqftData, true);
        } else {
          applyDataSource(medianData, false);
        }
        refreshMapData();
      });
    });

    // === LOCATION SEARCH ===
    const searchInput = document.getElementById('search-input') as HTMLInputElement;
    const searchResults = document.getElementById('search-results')!;
    const searchClear = document.getElementById('search-clear')!;
    const MAPBOX_TOKEN = mapboxgl.accessToken;
    let searchTimeout: ReturnType<typeof setTimeout> | null = null;
    let currentResults: Array<{ center: [number, number]; place_name: string }> = [];

    function clearSearch() {
      searchInput.value = '';
      searchResults.style.display = 'none';
      searchClear.style.display = 'none';
      currentResults = [];
    }

    function selectResult(result: { center: [number, number]; place_name: string }) {
      map.flyTo({ center: result.center, zoom: 12 });
      searchInput.value = result.place_name;
      searchResults.style.display = 'none';
      searchClear.style.display = 'block';
    }

    function renderResults(features: any[]) {
      currentResults = features;
      if (features.length === 0) {
        searchResults.style.display = 'none';
        return;
      }
      searchResults.innerHTML = features.map((f, i) =>
        `<div class="search-result-item" data-index="${i}">${f.place_name}</div>`
      ).join('');
      searchResults.style.display = 'block';
    }

    searchInput.addEventListener('input', () => {
      const query = searchInput.value.trim();
      searchClear.style.display = query ? 'block' : 'none';
      if (searchTimeout) clearTimeout(searchTimeout);
      if (query.length < 2) { searchResults.style.display = 'none'; return; }
      searchTimeout = setTimeout(async () => {
        try {
          const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&bbox=-0.51,51.28,0.33,51.69&types=place,locality,neighborhood,postcode&limit=5`;
          const resp = await fetch(url);
          const data = await resp.json();
          renderResults(data.features || []);
        } catch { searchResults.style.display = 'none'; }
      }, 300);
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && currentResults.length > 0) {
        selectResult(currentResults[0]);
      }
    });

    searchResults.addEventListener('click', (e) => {
      const item = (e.target as HTMLElement).closest('.search-result-item') as HTMLElement;
      if (item) {
        const idx = parseInt(item.dataset.index || '0');
        selectResult(currentResults[idx]);
      }
    });

    searchClear.addEventListener('click', clearSearch);

    // Close results when clicking elsewhere
    document.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('#search-container')) {
        searchResults.style.display = 'none';
      }
    });
  });
}

init().catch(console.error);
