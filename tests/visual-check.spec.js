import { test, expect } from '@playwright/test';

test.describe('Visual Check', () => {
  test('check new fee filter UI', async ({ page }) => {
    await page.goto('http://localhost:5173/');
    
    // Wait for map to load
    await page.waitForTimeout(3000);
    
    // Take screenshot showing the new filters
    await page.screenshot({ path: 'test-results/new-fee-filters.png', fullPage: true });
    
    // Click on a school to see the popup
    // First let's wait for schools to appear
    await page.waitForSelector('.mapboxgl-canvas', { state: 'visible' });
    await page.waitForTimeout(2000);
    
    // Select 25k-35k fee band
    await page.click('input[name="fee-band"][value="25k-35k"]');
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/fee-band-25k-35k.png', fullPage: true });
    
    console.log('Screenshots saved');
  });
});
