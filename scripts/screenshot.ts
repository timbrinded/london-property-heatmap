import { chromium } from 'playwright';

async function screenshot() {
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  
  // Collect console logs
  const logs: string[] = [];
  page.on('console', msg => {
    logs.push(`[${msg.type()}] ${msg.text()}`);
  });
  
  console.log('Navigating to app...');
  await page.goto('https://london-property-heatmap.vercel.app', { 
    waitUntil: 'networkidle',
    timeout: 60000 
  });
  
  // Wait longer for map to load (Mapbox tiles + WebGL rendering)
  console.log('Waiting for map to render (10s)...');
  await page.waitForTimeout(10000);
  
  // Take screenshot
  await page.screenshot({ path: 'screenshot.png', fullPage: false });
  console.log('Screenshot saved to screenshot.png');
  
  // Check for key elements
  const infoPanel = await page.$('.info-panel');
  const legend = await page.$('.legend');
  const map = await page.$('#map');
  
  console.log('\n--- Element Check ---');
  console.log('Info panel:', infoPanel ? '✓' : '✗');
  console.log('Legend:', legend ? '✓' : '✗');
  console.log('Map container:', map ? '✓' : '✗');
  
  // Check for baseline text
  const baselineText = await page.textContent('#baseline-price');
  console.log('Baseline price text:', baselineText);
  
  // Check if map has rendered (look for canvas)
  const canvas = await page.$('canvas.mapboxgl-canvas');
  console.log('Mapbox canvas:', canvas ? '✓ rendered' : '✗ not found');
  
  // Check network requests for data files
  console.log('\n--- Console Logs ---');
  logs.forEach(log => console.log(log));
  
  await browser.close();
  
  console.log('\n✓ Screenshot test complete');
}

screenshot().catch(console.error);
