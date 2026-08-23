import { test, expect, Page } from '@playwright/test';
import { EntriesPage } from '../page-objects/entries.page';

/**
 * The two range filters, end to end.
 *
 * Both were built in the storages first — every backend agreed on `from` and
 * `minDuration` while no control in the dashboard could ask for either. What
 * these check is the whole chain: a choice in the header becomes a query
 * parameter, the parameter reaches the API, and the table narrows.
 */

/** The `entries/cursor` request the page makes next, as a URL. */
const nextCursorRequest = (page: Page): Promise<URL> =>
  page
    .waitForRequest((request) => request.url().includes('/api/entries/cursor'))
    .then((request) => new URL(request.url()));

test.describe('Range filters', () => {
  let entries: EntriesPage;

  test.beforeEach(async ({ page }) => {
    entries = new EntriesPage(page);
    await entries.goto('requests');
    await entries.waitForLoad();
  });

  test('choosing a window sends an instant to the API', async ({ page }) => {
    const request = nextCursorRequest(page);
    await page.getByTestId('window-filter').selectOption('15m');

    const asked = await request;
    const from = asked.searchParams.get('from');

    expect(from).not.toBeNull();

    // Fifteen minutes back from now, give or take the round trip.
    const minutesBack = (Date.now() - Date.parse(from as string)) / 60_000;
    expect(minutesBack).toBeGreaterThan(14);
    expect(minutesBack).toBeLessThan(17);
  });

  test('the window is in the URL, so the view is a link', async ({ page }) => {
    await page.getByTestId('window-filter').selectOption('1h');

    await expect(page).toHaveURL(/window=1h/);

    await page.reload();
    await entries.waitForLoad();

    await expect(page.getByTestId('window-filter')).toHaveValue('1h');
  });

  test('choosing a duration keeps only the entries that took that long', async ({ page }) => {
    const request = nextCursorRequest(page);
    await page.getByTestId('duration-filter').selectOption('100');

    expect((await request).searchParams.get('minDuration')).toBe('100');

    await entries.waitForLoad();

    // Every duration the table shows has to satisfy the bound that was asked
    // for. A filter the server ignores looks identical to one it applies until
    // somebody reads the rows.
    const shown = await page
      .locator('tbody tr td')
      .filter({ hasText: /^\d+(\.\d+)?(ms|s)$/ })
      .allTextContents();

    // An empty table satisfies any bound, so it proves nothing about the filter.
    expect(shown.length).toBeGreaterThan(0);

    for (const text of shown) {
      // Anything over a second is written as `1.57s`.
      const ms = text.endsWith('ms')
        ? Number.parseFloat(text)
        : Number.parseFloat(text) * 1000;

      expect(ms).toBeGreaterThanOrEqual(100);
    }
  });

  test('a window nobody offers is ignored rather than sent', async ({ page }) => {
    const request = nextCursorRequest(page);
    await page.goto('/requests?window=37y');

    expect((await request).searchParams.has('from')).toBe(false);
    await expect(page.getByTestId('window-filter')).toHaveValue('all');
  });

  test('the duration control is absent where nothing measures one', async ({ page }) => {
    for (const route of ['logs', 'exceptions']) {
      await entries.goto(route);
      await entries.waitForLoad();

      await expect(page.getByTestId('window-filter')).toBeVisible();
      await expect(page.getByTestId('duration-filter')).toHaveCount(0);
    }
  });

  test('the header leaves room for itself', async ({ page }) => {
    // The header is fixed; the content below it used to be pushed down by a
    // constant each page carried its own copy of. Adding a row to the header
    // slid the top of the table underneath it.
    await page.goto('/requests?methods=GET');
    await entries.waitForLoad();

    const header = await page.locator('.fixed.top-0').first().boundingBox();
    const firstRow = await page.locator('tbody tr').first().boundingBox();

    expect(header).not.toBeNull();
    expect(firstRow).not.toBeNull();
    expect(firstRow!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
  });
});
