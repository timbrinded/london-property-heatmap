import { test, expect } from '@playwright/test';

test.describe('London Property Heatmap', () => {
  test('homepage loads with map', async ({ page }) => {
    await page.goto('/');
    
    // Check title
    await expect(page).toHaveTitle(/London Property Heatmap/);
    
    // Check map container exists
    const mapContainer = page.locator('#map');
    await expect(mapContainer).toBeVisible();
    
    // Check filter panels exist
    await expect(page.getByText('🚇 Travel')).toBeVisible();
    await expect(page.getByText('🎓 Schools')).toBeVisible();
  });

  test('transport filters are present', async ({ page }) => {
    await page.goto('/');
    
    // Check transport filter options
    await expect(page.getByText('Underground')).toBeVisible();
    await expect(page.getByText('Elizabeth Line')).toBeVisible();
    await expect(page.getByText('DLR')).toBeVisible();
    await expect(page.getByText('Overground')).toBeVisible();
  });

  test('school filters are present', async ({ page }) => {
    await page.goto('/');
    
    // Check school ranking filters (use exact match)
    await expect(page.getByText('Top 25', { exact: true })).toBeVisible();
    await expect(page.getByText('Top 100', { exact: true })).toBeVisible();
    await expect(page.getByText('Top 250', { exact: true })).toBeVisible();
    
    // Check fee filters
    await expect(page.getByText('> £15,000')).toBeVisible();
    await expect(page.getByText('> £25,000')).toBeVisible();
    await expect(page.getByText('> £35,000')).toBeVisible();
    await expect(page.getByText('> £50,000')).toBeVisible();
  });

  test('school type filters are present', async ({ page }) => {
    await page.goto('/');
    
    await expect(page.getByText('Boys')).toBeVisible();
    await expect(page.getByText('Girls')).toBeVisible();
    await expect(page.getByText('Co-educational')).toBeVisible();
  });

  test('baseline selector exists', async ({ page }) => {
    await page.goto('/');
    
    // Check baseline text is present (use specific text)
    await expect(page.getByText('Baseline: E14 (Millwall)')).toBeVisible();
  });
});
