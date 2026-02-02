import { test, expect } from '@playwright/test';

test.describe('Live Site Verification', () => {
  test('verify live deployment', async ({ page }) => {
    // Go directly to the Vercel deployment
    await page.goto('https://london-property-heatmap.vercel.app');
    
    // Wait for map to fully load
    await page.waitForTimeout(5000);
    
    // Take screenshot of the full page
    await page.screenshot({ path: 'test-results/live-site-initial.png', fullPage: true });
    
    // Check that the map loads correctly
    await expect(page).toHaveTitle(/London Property Heatmap/);
    
    // Check info panel
    await expect(page.getByText('🏠 London Property Prices')).toBeVisible();
    
    // Check the baseline
    await expect(page.getByText('Baseline: E14 (Millwall)')).toBeVisible();
    
    // Check filters exist
    await expect(page.getByText('🚇 Travel')).toBeVisible();
    await expect(page.getByText('🎓 Schools')).toBeVisible();
    
    // Take a screenshot with school filters toggled
    await page.screenshot({ path: 'test-results/live-site-verified.png', fullPage: true });
    
    console.log('Live site verified successfully!');
  });
});
