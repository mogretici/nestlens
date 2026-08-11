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

    // The handler lives on the row, so a row has to hold focus — clicking the
    // table does not give it to one, and clicking a row would open the entry.
    const rows = page.locator('tbody tr[tabindex]');
    await rows.first().focus();

    await page.keyboard.press('ArrowDown');

    // The table moves real DOM focus rather than marking rows with an
    // attribute, so focus itself is the thing to assert on.
    await expect(rows.nth(1)).toBeFocused();
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

    // Focus rather than click — clicking opens the entry on its own, so the
    // original version proved nothing about the Enter key.
    await page.locator('tbody tr[tabindex]').first().focus();

    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/requests\/\d+/);
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

    const rows = page.locator('tbody tr[tabindex]');
    await rows.first().focus();

    await page.keyboard.press('End');
    await expect(rows.last()).toBeFocused();

    await page.keyboard.press('Home');
    await expect(rows.first()).toBeFocused();
  });
});
