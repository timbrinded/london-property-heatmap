import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  
  const url = `https://london-property-heatmap.vercel.app?t=${Date.now()}`;
  console.log('Navigating to app...');
  await page.goto(url);
  
  console.log('Waiting for map to render (10s)...');
  await page.waitForTimeout(10000);
  
  // Toggle on transport overlay
  console.log('Enabling Transport overlay...');
  await page.click('#toggle-transport');
  await page.waitForTimeout(1000);
  
  // Toggle on schools overlay
  console.log('Enabling Schools overlay...');
  await page.click('#toggle-schools');
  await page.waitForTimeout(1500);
  
  console.log('Taking screenshot with overlays...');
  await page.screenshot({ path: 'screenshot-overlays.png' });
  console.log('Screenshot saved to screenshot-overlays.png');
  
  // Verify the toggle states
  const transportChecked = await page.$eval('#toggle-transport', (el: HTMLInputElement) => el.checked);
  const schoolsChecked = await page.$eval('#toggle-schools', (el: HTMLInputElement) => el.checked);
  console.log(`\nOverlay states: Transport=${transportChecked}, Schools=${schoolsChecked}`);
  
  // Check for schools legend visibility
  const legendVisible = await page.$eval('#schools-legend', (el: Element) => el.classList.contains('visible'));
  console.log(`Schools legend visible: ${legendVisible}`);
  
  await browser.close();
  console.log('\n✓ Done');
}

main().catch(console.error);
