import { test, expect } from '@playwright/test';

test.describe('Fee Filter Behavior Analysis', () => {
  test('analyze current fee filter logic', async ({ page }) => {
    await page.goto('/');
    
    // Wait for map to load
    await page.waitForTimeout(3000);
    
    // Take initial screenshot (no fee filters active, only ranking)
    await page.screenshot({ path: 'test-results/01-initial-state.png', fullPage: true });
    
    // Check the fees displayed in the tooltip area or count schools visible
    // For now, let's just document the current behavior
    
    // Enable >15k fee filter
    await page.locator('#toggle-fees-15k').check();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/02-fees-15k-only.png', fullPage: true });
    
    // Also enable >25k (both checked)
    await page.locator('#toggle-fees-25k').check();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/03-fees-15k-and-25k.png', fullPage: true });
    
    // Also enable >50k (15k, 25k, 50k all checked)
    await page.locator('#toggle-fees-50k').check();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/04-fees-15k-25k-50k.png', fullPage: true });
    
    // Uncheck all, then only check >50k
    await page.locator('#toggle-fees-15k').uncheck();
    await page.locator('#toggle-fees-25k').uncheck();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-results/05-fees-50k-only.png', fullPage: true });
    
    console.log('Screenshots saved. Review test-results/ folder.');
  });
});
