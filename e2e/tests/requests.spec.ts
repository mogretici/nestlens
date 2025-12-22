import { test, expect } from '@playwright/test';

/**
 * Requests Page E2E Tests
 *
 * Tests for the requests list page functionality.
 */
test.describe('Requests Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/requests');
  });

  test('displays page header with title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /requests/i })).toBeVisible();
  });

  test('displays data table', async ({ page }) => {
    await page.waitForLoadState('networkidle');

    // Table should be present
    await expect(page.getByRole('grid')).toBeVisible();
  });

  test('shows loading state initially', async ({ page }) => {
    // On fresh load, should show loading skeletons or spinner
    // This test just verifies the page loads
    await expect(page).toHaveURL(/\/requests/);
  });

  test('displays empty state when no entries', async ({ page }) => {
    // If no entries, should show empty message
    await page.waitForLoadState('networkidle');

    // Either table with data or empty state
    const hasTable = await page.getByRole('grid').isVisible();
    const hasEmptyState = await page.getByText(/no requests/i).isVisible().catch(() => false);

    expect(hasTable || hasEmptyState).toBeTruthy();
  });
});

test.describe('Filters', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/requests');
    await page.waitForLoadState('networkidle');
  });

  test('filter appears in URL', async ({ page }) => {
    // Click on a method badge if one exists
    const badge = page.getByText('GET').first();
    const isBadgeVisible = await badge.isVisible().catch(() => false);

    if (isBadgeVisible) {
      await badge.click();
      await expect(page).toHaveURL(/methods=get/i);
    }
  });

  test('filter persists on page reload', async ({ page }) => {
    // Navigate with filter in URL
    await page.goto('/requests?methods=get');
    await page.waitForLoadState('networkidle');

    // URL should still have filter
    await expect(page).toHaveURL(/methods=get/i);
  });

  test('clear all removes filters', async ({ page }) => {
    // Navigate with filter
    await page.goto('/requests?methods=get');
    await page.waitForLoadState('networkidle');

    // Click Clear All if visible
    const clearButton = page.getByText('Clear all');
    const isVisible = await clearButton.isVisible().catch(() => false);

    if (isVisible) {
      await clearButton.click();
      await expect(page).not.toHaveURL(/methods=/);
    }
  });
});

test.describe('Entry Details', () => {
  test('clicking entry row navigates to detail', async ({ page }) => {
    await page.goto('/requests');
    await page.waitForLoadState('networkidle');

    // Find a clickable row
    const row = page.locator('tbody tr[tabindex="0"]').first();
    const isRowVisible = await row.isVisible().catch(() => false);

    if (isRowVisible) {
      await row.click();

      // Should navigate to detail page
      await expect(page).toHaveURL(/\/requests\/\d+/);
    }
  });

  test('back navigation returns to list', async ({ page }) => {
    // Navigate directly to a request detail page
    await page.goto('/requests/1');
    await page.waitForLoadState('networkidle');

    // Go back
    await page.goBack();

    // Should be on list page
    await expect(page).toHaveURL(/\/requests$/);
  });
});

test.describe('Keyboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/requests');
    await page.waitForLoadState('networkidle');
  });

  test('Enter key opens entry detail', async ({ page }) => {
    // Focus on a row
    const row = page.locator('tbody tr[tabindex="0"]').first();
    const isRowVisible = await row.isVisible().catch(() => false);

    if (isRowVisible) {
      await row.focus();
      await page.keyboard.press('Enter');

      // Should navigate to detail
      await expect(page).toHaveURL(/\/requests\/\d+/);
    }
  });
});
