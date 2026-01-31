import { chromium } from 'playwright';

async function takeScreenshot() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  
  const cacheBust = Date.now();
  console.log('Navigating to app...');
  await page.goto(`https://london-property-heatmap.vercel.app/?v=${cacheBust}`, {
    waitUntil: 'networkidle'
  });
  
  console.log('Waiting for map...');
  await page.waitForTimeout(10000);
  
  // Enable both overlays using JavaScript evaluation
  console.log('Enabling Transport Links...');
  await page.evaluate(() => {
    const checkbox = document.getElementById('toggle-transport') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(1000);
  
  console.log('Enabling Top Schools...');
  await page.evaluate(() => {
    const checkbox = document.getElementById('toggle-schools') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(2000);
  
  // Take screenshot with overlays
  console.log('Taking screenshot with overlays...');
  await page.screenshot({ path: 'screenshot-overlays.png', fullPage: false });
  
  console.log('✓ Screenshot saved to screenshot-overlays.png');
  
  await browser.close();
}

takeScreenshot().catch(console.error);
