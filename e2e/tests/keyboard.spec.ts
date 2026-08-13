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

  /**
   * Asked of the request, not of the table.
   *
   * Two earlier versions of this got it wrong. The first ran on the dashboard
   * root, which has no table: it counted zero rows and asserted there were
   * still zero — true whatever the shortcut did, including clearing everything.
   * The second counted a real list, and then failed because the suite shares
   * one example application: another test clearing entries made this one look
   * like the shortcut had.
   *
   * What the shortcut promises is narrower and does not depend on anyone else:
   * dismissing the confirmation must not send the delete.
   */
  test('dismissing the Ctrl+K confirmation sends no delete', async ({ page }) => {
    const entries = new EntriesPage(page);
    await entries.goto('requests');
    await entries.waitForLoad();

    const deletes: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'DELETE') deletes.push(request.url());
    });

    page.once('dialog', (dialog) => dialog.dismiss());
    await page.locator('body').click();
    await page.keyboard.press('ControlOrMeta+k');

    // Long enough for the request to have been made had the dismissal been
    // ignored; the shortcut fires it synchronously on confirmation.
    await page.waitForTimeout(500);
    expect(deletes).toEqual([]);
  });
});

test.describe('Table Keyboard Navigation', () => {
  test('Arrow keys navigate table rows', async ({ page }) => {
    const entries = new EntriesPage(page);
    await entries.goto('requests');
    await entries.waitForLoad();

    // Not a skip: the suite seeds the application before it runs, so too few
    // rows means the seeding or the table is broken. Skipping reported that as
    // a pass, which is how a genuinely unseeded run once came back green.
    expect(await entries.getRowCount()).toBeGreaterThanOrEqual(2);

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

    expect(await entries.getRowCount()).toBeGreaterThan(0);

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

    expect(await entries.getRowCount()).toBeGreaterThanOrEqual(3);

    const rows = page.locator('tbody tr[tabindex]');
    await rows.first().focus();

    await page.keyboard.press('End');
    await expect(rows.last()).toBeFocused();

    await page.keyboard.press('Home');
    await expect(rows.first()).toBeFocused();
  });
});
