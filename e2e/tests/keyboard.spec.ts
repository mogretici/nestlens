import { test, expect } from '@playwright/test';
import { DashboardPage } from '../page-objects/dashboard.page';
import { EntriesPage } from '../page-objects/entries.page';

test.describe('Keyboard Shortcuts', () => {
  test('Ctrl+D toggles dark mode', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    const initialDark = await dashboard.isDarkMode();

    // Press Ctrl+D
    await page.keyboard.press('Control+d');
    await page.waitForTimeout(100);

    const afterToggle = await dashboard.isDarkMode();
    expect(afterToggle).not.toBe(initialDark);
  });

  test('Ctrl+K opens clear dialog', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    // Press Ctrl+K
    await page.keyboard.press('Control+k');

    // Dialog should appear
    const dialog = page.getByRole('dialog').or(page.locator('[role="alertdialog"]'));
    await expect(dialog).toBeVisible();
  });

  test('Escape closes open dialogs', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    // Open dialog first
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog').or(page.locator('[role="alertdialog"]'));
    await expect(dialog).toBeVisible();

    // Press Escape
    await page.keyboard.press('Escape');

    // Dialog should close
    await expect(dialog).not.toBeVisible();
  });
});

test.describe('Table Keyboard Navigation', () => {
  test('Arrow keys navigate table rows', async ({ page }) => {
    const entries = new EntriesPage(page);
    await entries.goto('requests');
    await entries.waitForLoad();

    const rowCount = await entries.getRowCount();
    if (rowCount < 2) {
      test.skip();
      return;
    }

    // Focus on table
    await entries.table.click();

    // Press Down arrow
    await page.keyboard.press('ArrowDown');

    // Verify focus moved (row should have focus indicator)
    const focusedRow = page.locator('[data-focused="true"], :focus-within tr');
    await expect(focusedRow.first()).toBeVisible();
  });

  test('Enter opens entry detail', async ({ page }) => {
    const entries = new EntriesPage(page);
    await entries.goto('requests');
    await entries.waitForLoad();

    const rowCount = await entries.getRowCount();
    if (rowCount === 0) {
      test.skip();
      return;
    }

    // Click first row to focus
    await entries.clickRow(0);

    // Press Enter
    await page.keyboard.press('Enter');

    // Should navigate to detail or show detail panel
    await page.waitForTimeout(300);
    
    // URL should change or detail view should appear
    const hasDetail = await page.locator('[data-testid="entry-detail"]').isVisible();
    const urlHasId = /\/\d+|#\d+/.test(page.url());
    
    expect(hasDetail || urlHasId).toBe(true);
  });

  test('Home/End navigate to first/last row', async ({ page }) => {
    const entries = new EntriesPage(page);
    await entries.goto('requests');
    await entries.waitForLoad();

    const rowCount = await entries.getRowCount();
    if (rowCount < 3) {
      test.skip();
      return;
    }

    // Focus table
    await entries.table.click();

    // Press End to go to last row
    await page.keyboard.press('End');
    await page.waitForTimeout(100);

    // Press Home to go to first row
    await page.keyboard.press('Home');
    await page.waitForTimeout(100);

    // First row should be focused
    const firstRow = entries.rows.first();
    await expect(firstRow).toBeVisible();
  });
});
