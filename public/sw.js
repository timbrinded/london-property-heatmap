// Cache version - updated on each build
const CACHE_VERSION = '__BUILD_TIMESTAMP__';
const CACHE_NAME = `property-heatmap-${CACHE_VERSION}`;

// Assets that rarely change - use cache-first
const STATIC_ASSETS = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png'
];

// Assets that change frequently - use network-first
const DYNAMIC_ASSETS = [
  '/',
  '/index.html',
  '/data/prices.json',
  '/data/schools-with-fees.json',
  '/data/transport-lines.json',
  '/data/postcode-districts.geojson'
];

self.addEventListener('install', event => {
  // Skip waiting - activate immediately
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('activate', event => {
  // Claim clients immediately
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Delete old caches
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name.startsWith('property-heatmap-') && name !== CACHE_NAME)
            .map(name => caches.delete(name))
        );
      })
    ])
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Only handle same-origin requests
  if (url.origin !== location.origin) {
    return;
  }
  
  // Network-first for HTML, JS, and data files
  if (event.request.destination === 'document' || 
      event.request.destination === 'script' ||
      url.pathname.startsWith('/data/') ||
      url.pathname.endsWith('.json') ||
      url.pathname === '/') {
    event.respondWith(networkFirst(event.request));
    return;
  }
  
  // Cache-first for static assets (images, manifest)
  if (STATIC_ASSETS.some(asset => url.pathname === asset) ||
      event.request.destination === 'image') {
    event.respondWith(cacheFirst(event.request));
    return;
  }
  
  // Network-first for everything else
  event.respondWith(networkFirst(event.request));
});

async function networkFirst(request) {
  try {
    // Cache-bust: append version param to avoid browser HTTP cache serving stale responses
    // For navigate requests, fetch the original (Request constructor rejects mode:'navigate')
    let fetchRequest = request;
    if (request.mode !== 'navigate') {
      const bustUrl = new URL(request.url);
      bustUrl.searchParams.set('_v', CACHE_VERSION);
      fetchRequest = new Request(bustUrl, {
        method: request.method,
        headers: request.headers,
        mode: request.mode,
        credentials: request.credentials,
        redirect: request.redirect,
      });
    }
    const response = await fetch(fetchRequest);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      // Store against original URL (without cache-bust param)
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    throw error;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }
  
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    throw error;
  }
}

// Listen for skip waiting message from client
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
