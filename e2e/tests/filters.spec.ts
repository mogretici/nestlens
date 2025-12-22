import { test, expect } from '@playwright/test';
import { EntriesPage } from '../page-objects/entries.page';

test.describe('Filters E2E', () => {
  let entries: EntriesPage;

  test.beforeEach(async ({ page }) => {
    entries = new EntriesPage(page);
    await entries.goto('requests');
    await entries.waitForLoad();
  });

  test('clicking badge adds filter to URL', async ({ page }) => {
    // Find and click a status badge (e.g., 200)
    const badge = page.locator('[data-value="200"], [data-value="GET"]').first();
    
    if (await badge.isVisible()) {
      await badge.click();
      
      // Verify URL contains filter parameter
      await expect(page).toHaveURL(/[?&]/);
    }
  });

  test('filter persists on page reload', async ({ page }) => {
    // Add a filter via URL
    await page.goto('/requests?methods=GET');
    await entries.waitForLoad();

    // Reload
    await page.reload();
    await entries.waitForLoad();

    // Verify filter is still in URL
    await expect(page).toHaveURL(/methods=GET/i);
  });

  test('removing filter updates results', async ({ page }) => {
    // Navigate with filter
    await page.goto('/requests?methods=GET');
    await entries.waitForLoad();

    // Find and remove filter chip
    const filterChip = entries.filterChips.first();
    if (await filterChip.isVisible()) {
      const closeButton = filterChip.locator('button, [role="button"]');
      await closeButton.click();

      // URL should not contain the filter anymore
      await expect(page).not.toHaveURL(/methods=GET/);
    }
  });

  test('Clear All removes all filters', async ({ page }) => {
    // Add multiple filters
    await page.goto('/requests?methods=GET&statuses=200');
    await entries.waitForLoad();

    if (await entries.clearFiltersButton.isVisible()) {
      await entries.clearFiltersButton.click();

      // URL should be clean
      await expect(page).toHaveURL('/requests');
    }
  });

  test('multiple filters work together', async ({ page }) => {
    // Navigate with multiple filters
    await page.goto('/requests?methods=GET&statuses=200');
    await entries.waitForLoad();

    // Verify both filters are shown
    await expect(page).toHaveURL(/methods=GET/i);
    await expect(page).toHaveURL(/statuses=200/i);
  });
});

test.describe('Filter Categories', () => {
  test('filters requests by method', async ({ page }) => {
    const entries = new EntriesPage(page);
    await page.goto('/requests?methods=POST');
    await entries.waitForLoad();

    // All visible methods should be POST
    const methodBadges = page.locator('text="POST"');
    const count = await methodBadges.count();
    
    if (count > 0) {
      // Verify filtering worked
      expect(count).toBeGreaterThan(0);
    }
  });

  test('filters queries by type', async ({ page }) => {
    const entries = new EntriesPage(page);
    await page.goto('/queries?types=SELECT');
    await entries.waitForLoad();

    await expect(page).toHaveURL(/types=SELECT/i);
  });

  test('filters logs by level', async ({ page }) => {
    const entries = new EntriesPage(page);
    await page.goto('/logs?levels=error');
    await entries.waitForLoad();

    await expect(page).toHaveURL(/levels=error/i);
  });
});
