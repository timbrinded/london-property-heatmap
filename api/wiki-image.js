// Vercel Serverless Function: Fetch Wikipedia thumbnail for a given article URL
// Usage: /api/wiki-image?url=https://en.wikipedia.org/wiki/University_College_School

export const config = {
  runtime: 'edge',
};

// Simple in-memory cache (resets on cold start, but helps within a single instance)
const cache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export default async function handler(request) {
  const { searchParams } = new URL(request.url);
  const wikiUrl = searchParams.get('url');
  
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=86400, s-maxage=86400', // CDN cache 24h
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers });
  }
  
  if (!wikiUrl) {
    return new Response(
      JSON.stringify({ error: 'Missing url parameter' }),
      { status: 400, headers }
    );
  }
  
  try {
    // Extract article title from Wikipedia URL
    // Handles: https://en.wikipedia.org/wiki/Article_Name
    const urlMatch = wikiUrl.match(/wikipedia\.org\/wiki\/([^#?]+)/);
    if (!urlMatch) {
      return new Response(
        JSON.stringify({ error: 'Invalid Wikipedia URL format' }),
        { status: 400, headers }
      );
    }
    
    const articleTitle = decodeURIComponent(urlMatch[1]);
    
    // Check cache
    const cacheKey = articleTitle.toLowerCase();
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return new Response(JSON.stringify(cached.data), { headers });
    }
    
    // Fetch from Wikipedia REST API
    const apiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(articleTitle)}`;
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'LondonPropertyHeatmap/1.0 (contact@example.com)',
      },
    });
    
    if (!response.ok) {
      // Try with underscores replaced by spaces
      const altTitle = articleTitle.replace(/_/g, ' ');
      const altResponse = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(altTitle)}`,
        { headers: { 'User-Agent': 'LondonPropertyHeatmap/1.0' } }
      );
      
      if (!altResponse.ok) {
        return new Response(
          JSON.stringify({ error: 'Wikipedia article not found', title: articleTitle }),
          { status: 404, headers }
        );
      }
      
      const altData = await altResponse.json();
      return handleWikiResponse(altData, cacheKey, headers);
    }
    
    const data = await response.json();
    return handleWikiResponse(data, cacheKey, headers);
    
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Failed to fetch Wikipedia data', message: error.message }),
      { status: 500, headers }
    );
  }
}

function handleWikiResponse(data, cacheKey, headers) {
  const result = {
    title: data.title,
    description: data.description,
    extract: data.extract,
    thumbnail: data.thumbnail?.source || null,
    originalImage: data.originalimage?.source || null,
    pageUrl: data.content_urls?.desktop?.page || null,
  };
  
  // Cache the result
  cache.set(cacheKey, { data: result, timestamp: Date.now() });
  
  // Limit cache size
  if (cache.size > 500) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
  
  return new Response(JSON.stringify(result), { headers });
}
