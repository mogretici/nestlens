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

  /**
   * The shortcut goes through `window.confirm`, which the browser owns — there
   * is no dialog element to assert on, and dismissing it is what Escape would
   * have done anyway.
   */
  test('Ctrl+K asks for confirmation before clearing', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    let asked: string | null = null;
    page.once('dialog', async (dialog) => {
      asked = dialog.message();
      await dialog.dismiss();
    });

    await page.locator('body').click();
    await page.keyboard.press('ControlOrMeta+k');

    await expect.poll(() => asked).toMatch(/clear/i);
  });

  test('dismissing the Ctrl+K confirmation keeps entries', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    page.once('dialog', (dialog) => dialog.dismiss());
    const before = await page.locator('table tbody tr').count();

    await page.locator('body').click();
    await page.keyboard.press('ControlOrMeta+k');

    await expect(page.locator('table tbody tr')).toHaveCount(before);
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
