import { chromium } from 'playwright';

async function screenshot() {
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  
  // Collect all console logs
  const logs: string[] = [];
  page.on('console', msg => {
    logs.push(`[${msg.type()}] ${msg.text()}`);
  });
  
  // Track network requests
  const failedRequests: string[] = [];
  page.on('requestfailed', request => {
    failedRequests.push(`${request.url()} - ${request.failure()?.errorText}`);
  });
  
  console.log('Navigating to app (cache-busted)...');
  // Add cache-busting param
  await page.goto('https://london-property-heatmap.vercel.app/?_=' + Date.now(), { 
    waitUntil: 'networkidle',
    timeout: 60000 
  });
  
  // Wait for map to fully load
  console.log('Waiting for map to render (12s)...');
  await page.waitForTimeout(12000);
  
  // Take screenshot
  await page.screenshot({ path: 'screenshot.png', fullPage: false });
  console.log('Screenshot saved to screenshot.png');
  
  // Check for key elements
  console.log('\n--- Element Check ---');
  const infoPanel = await page.$('.info-panel');
  const legend = await page.$('.legend');
  const canvas = await page.$('canvas.mapboxgl-canvas');
  console.log('Info panel:', infoPanel ? '✓' : '✗');
  console.log('Legend:', legend ? '✓' : '✗');
  console.log('Mapbox canvas:', canvas ? '✓' : '✗');
  
  // Check baseline text
  const baselineText = await page.textContent('#baseline-price');
  console.log('Baseline price:', baselineText);
  
  // Check if map source was added by evaluating in page context
  const mapState = await page.evaluate(() => {
    const mapContainer = document.getElementById('map');
    const canvases = document.querySelectorAll('canvas');
    // Check for map layers by looking at SVG/canvas children
    return {
      containerExists: !!mapContainer,
      canvasCount: canvases.length,
      containerChildren: mapContainer?.children.length || 0
    };
  });
  console.log('Map state:', mapState);
  
  // Show any console errors
  const errors = logs.filter(l => l.startsWith('[error]'));
  if (errors.length > 0) {
    console.log('\n--- Console Errors ---');
    errors.forEach(e => console.log(e));
  } else {
    console.log('\nNo console errors');
  }
  
  if (failedRequests.length > 0) {
    console.log('\n--- Failed Requests ---');
    failedRequests.forEach(r => console.log(r));
  }
  
  await browser.close();
  console.log('\n✓ Test complete');
}

screenshot().catch(console.error);
