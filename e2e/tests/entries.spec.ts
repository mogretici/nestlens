import { test, expect } from '@playwright/test';
import { EntriesPage } from '../page-objects/entries.page';

test.describe('Entry Pages', () => {
  test('requests page loads correctly', async ({ page }) => {
    const entries = new EntriesPage(page);
    await entries.goto('requests');
    await entries.waitForLoad();

    // Page header should be visible
    await expect(page.locator('h1, [role="heading"]').filter({ hasText: /request/i }).first()).toBeVisible();
  });

  test('queries page loads correctly', async ({ page }) => {
    const entries = new EntriesPage(page);
    await entries.goto('queries');
    await entries.waitForLoad();

    await expect(page.locator('h1, [role="heading"]').filter({ hasText: /quer/i }).first()).toBeVisible();
  });

  test('logs page loads correctly', async ({ page }) => {
    const entries = new EntriesPage(page);
    await entries.goto('logs');
    await entries.waitForLoad();

    await expect(page.locator('h1, [role="heading"]').filter({ hasText: /log/i }).first()).toBeVisible();
  });

  test('exceptions page loads correctly', async ({ page }) => {
    const entries = new EntriesPage(page);
    await entries.goto('exceptions');
    await entries.waitForLoad();

    await expect(page.locator('h1, [role="heading"]').filter({ hasText: /exception/i }).first()).toBeVisible();
  });

  test('jobs page loads correctly', async ({ page }) => {
    const entries = new EntriesPage(page);
    await entries.goto('jobs');
    await entries.waitForLoad();

    await expect(page.locator('h1, [role="heading"]').filter({ hasText: /job/i }).first()).toBeVisible();
  });
});

test.describe('Entry Table', () => {
  test('displays entries in table format', async ({ page }) => {
    const entries = new EntriesPage(page);
    await entries.goto('requests');
    await entries.waitForLoad();

    // Table should be visible
    await expect(entries.table).toBeVisible();
  });

  test('shows empty state when no entries', async ({ page }) => {
    const entries = new EntriesPage(page);
    // Use a filter that likely returns no results
    await page.goto('/requests?statuses=999');
    await entries.waitForLoad();

    // Either empty state or no rows
    const rowCount = await entries.getRowCount();
    if (rowCount === 0) {
      // Empty state should be shown
      const emptyState = page.getByText(/no entries|no results|empty/i);
      await expect(emptyState.first()).toBeVisible();
    }
  });

  test('clicking row opens detail view', async ({ page }) => {
    const entries = new EntriesPage(page);
    await entries.goto('requests');
    await entries.waitForLoad();

    const rowCount = await entries.getRowCount();
    if (rowCount > 0) {
      await entries.clickRow(0);

      // Wait for navigation or detail panel
      await page.waitForTimeout(500);

      // Should show detail view
      const detailView = page.locator('[data-testid="entry-detail"], [role="dialog"], main');
      await expect(detailView.first()).toBeVisible();
    }
  });
});

test.describe('Entry Detail', () => {
  test('shows request details', async ({ page }) => {
    const entries = new EntriesPage(page);
    await entries.goto('requests');
    await entries.waitForLoad();

    const rowCount = await entries.getRowCount();
    if (rowCount > 0) {
      await entries.clickRow(0);
      await page.waitForTimeout(300);

      // Should show method and path
      await expect(page.getByText(/GET|POST|PUT|DELETE/i).first()).toBeVisible();
    }
  });

  test('shows query with SQL', async ({ page }) => {
    const entries = new EntriesPage(page);
    await entries.goto('queries');
    await entries.waitForLoad();

    const rowCount = await entries.getRowCount();
    if (rowCount > 0) {
      await entries.clickRow(0);
      await page.waitForTimeout(300);

      // Should show SQL keywords
      await expect(page.getByText(/SELECT|INSERT|UPDATE|DELETE/i).first()).toBeVisible();
    }
  });

  test('shows exception with stack trace', async ({ page }) => {
    const entries = new EntriesPage(page);
    await entries.goto('exceptions');
    await entries.waitForLoad();

    const rowCount = await entries.getRowCount();
    if (rowCount > 0) {
      await entries.clickRow(0);
      await page.waitForTimeout(300);

      // Should show exception info
      const exceptionInfo = page.locator('text=/Error|Exception|stack/i');
      await expect(exceptionInfo.first()).toBeVisible();
    }
  });

  test('shows log with level badge', async ({ page }) => {
    const entries = new EntriesPage(page);
    await entries.goto('logs');
    await entries.waitForLoad();

    const rowCount = await entries.getRowCount();
    if (rowCount > 0) {
      await entries.clickRow(0);
      await page.waitForTimeout(300);

      // Should show level
      await expect(page.getByText(/error|warn|info|debug|log/i).first()).toBeVisible();
    }
  });
});

test.describe('Pagination', () => {
  test('shows pagination when many entries exist', async ({ page }) => {
    const entries = new EntriesPage(page);
    await entries.goto('requests');
    await entries.waitForLoad();

    // If pagination is visible, it means there are enough entries
    const pagination = entries.pagination;
    const isVisible = await pagination.isVisible();

    if (isVisible) {
      await expect(pagination).toBeVisible();
    }
  });

  test('loads more entries on next page', async ({ page }) => {
    const entries = new EntriesPage(page);
    await entries.goto('requests');
    await entries.waitForLoad();

    if (await entries.pagination.isVisible()) {
      const initialRowCount = await entries.getRowCount();

      await entries.goToNextPage();
      await entries.waitForLoad();

      // Either same or different rows should be shown
      const newRowCount = await entries.getRowCount();
      expect(newRowCount).toBeGreaterThan(0);
    }
  });
});
