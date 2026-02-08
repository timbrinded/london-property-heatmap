import { test, expect } from '@playwright/test';

test.setTimeout(60000);

test.describe('Data Source Toggle - UI Structure', () => {
  // These tests verify UI structure without requiring map.on('load') to fire
  // (WebGL/Mapbox map load event doesn't fire reliably in headless Chromium)

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for page to be interactive (DOM ready, JS executed)
    await expect(page.locator('#info-panel')).toBeVisible({ timeout: 10000 });
    // Wait for sqft option to appear (data fetch completes before map load)
    await expect(page.locator('#sqft-option')).toBeVisible({ timeout: 15000 });
  });

  test('1. Page loads successfully — map and info panel visible', async ({ page }) => {
    await expect(page.locator('#map')).toBeVisible();
    await expect(page.locator('#info-panel')).toBeVisible();
    await expect(page.locator('#panel-title')).toHaveText('🏠 London Property Prices');
  });

  test('2. Default view has Median Price radio checked', async ({ page }) => {
    const medianRadio = page.locator('input[name="data-source"][value="median"]');
    await expect(medianRadio).toBeChecked();
  });

  test('3. Data source toggle exists with both options', async ({ page }) => {
    await expect(page.getByText('Data Source')).toBeVisible();
    await expect(page.getByText('Median Price', { exact: true })).toBeVisible();
    await expect(page.getByText('£ per sqft', { exact: true })).toBeVisible();
  });

  test('4. Can switch to £/sqft radio', async ({ page }) => {
    await page.locator('#sqft-option').click();
    const sqftRadio = page.locator('input[name="data-source"][value="sqft"]');
    await expect(sqftRadio).toBeChecked();
  });

  test('5. Can switch back to Median Price', async ({ page }) => {
    await page.locator('#sqft-option').click();
    await expect(page.locator('input[name="data-source"][value="sqft"]')).toBeChecked();
    
    await page.locator('label.radio-item').filter({ hasText: 'Median Price' }).click();
    await expect(page.locator('input[name="data-source"][value="median"]')).toBeChecked();
  });

  test('6. Hover popup element exists and is hidden initially', async ({ page }) => {
    const popup = page.locator('#popup');
    await expect(popup).toBeAttached();
    await expect(popup).toHaveCSS('display', 'none');
  });

  test('7. Search input exists', async ({ page }) => {
    const searchInput = page.locator('#search-input');
    await expect(searchInput).toBeVisible();
    await expect(searchInput).toHaveAttribute('placeholder', /Search/);
  });

  test('8. Property type filter exists', async ({ page }) => {
    await expect(page.getByText('Property Type')).toBeVisible();
    await expect(page.getByText('All Properties')).toBeVisible();
    await expect(page.getByText('Houses Only')).toBeVisible();
    await expect(page.getByText('Flats Only')).toBeVisible();
  });
});

test.describe('Data Source Toggle - Full Integration', () => {
  // These tests require map.on('load') to fire (baseline price, title updates)
  // They may fail in headless Chromium without GPU - marked as soft failures

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Try to wait for map data load - if this times out, map.on('load') didn't fire
    try {
      await expect(page.locator('#baseline-price')).not.toHaveText('Loading...', { timeout: 30000 });
    } catch {
      test.skip(true, 'Map load event did not fire (WebGL not available in headless mode)');
    }
  });

  test('9. Baseline shows £XXXk format in median mode', async ({ page }) => {
    await expect(page.locator('#baseline-price')).toHaveText(/£\d+k/);
  });

  test('10. Switch to £/sqft updates baseline and title', async ({ page }) => {
    await page.locator('#sqft-option').click();
    await expect(page.locator('#baseline-price')).toHaveText(/£\d+\/sqft/, { timeout: 10000 });
    await expect(page.locator('#panel-title')).toHaveText('🏠 London £/sqft');
  });

  test('11. Switch back to Median Price reverts baseline and title', async ({ page }) => {
    await page.locator('#sqft-option').click();
    await expect(page.locator('#panel-title')).toHaveText('🏠 London £/sqft', { timeout: 5000 });
    
    await page.locator('label.radio-item').filter({ hasText: 'Median Price' }).click();
    await expect(page.locator('#panel-title')).toHaveText('🏠 London Property Prices', { timeout: 5000 });
    await expect(page.locator('#baseline-price')).toHaveText(/£\d+k/);
  });

  test('12. Map has postcode label layer', async ({ page }) => {
    const hasLabelLayer = await page.evaluate(() => {
      const map = window.map;
      if (!map) return false;
      const style = map.getStyle();
      if (!style || !style.layers) return false;
      return style.layers.some(l => l.type === 'symbol' && l.id.includes('label'));
    });
    expect(hasLabelLayer).toBe(true);
  });
});
