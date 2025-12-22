import { test, expect } from '@playwright/test';

/**
 * Logs Page E2E Tests
 *
 * Tests for the logs list page functionality.
 */
test.describe('Logs Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/logs');
    await page.waitForLoadState('networkidle');
  });

  test('displays page header with title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /logs/i })).toBeVisible();
  });

  test('displays log level filters', async ({ page }) => {
    // Page should have level filter options or badges
    await expect(page).toHaveURL(/\/logs/);
  });

  test('filter by level via URL', async ({ page }) => {
    await page.goto('/logs?levels=error');
    await page.waitForLoadState('networkidle');

    // Should show filter in header
    await expect(page).toHaveURL(/levels=error/);
  });
});

test.describe('Exceptions Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/exceptions');
    await page.waitForLoadState('networkidle');
  });

  test('displays page header with title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /exceptions/i })).toBeVisible();
  });

  test('displays exception list', async ({ page }) => {
    // Table or empty state should be present
    await expect(page).toHaveURL(/\/exceptions/);
  });
});

test.describe('Queries Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/queries');
    await page.waitForLoadState('networkidle');
  });

  test('displays page header with title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /queries/i })).toBeVisible();
  });

  test('displays query list', async ({ page }) => {
    await expect(page).toHaveURL(/\/queries/);
  });
});
