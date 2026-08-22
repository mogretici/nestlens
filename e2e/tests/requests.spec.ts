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
    await page.waitForSelector('main', { state: 'visible' });

    // Table should be present
    await expect(page.getByRole('grid')).toBeVisible();
  });

  test('shows loading state initially', async ({ page }) => {
    // On fresh load, should show loading skeletons or spinner
    // This test just verifies the page loads
    await expect(page).toHaveURL(/\/requests/);
  });

  test('shows either the table or an empty state', async ({ page }) => {
    await page.waitForSelector('main', { state: 'visible' });

    // `isVisible()` reads the DOM once, before the table has rendered; this
    // waits for whichever of the two the page ends up showing.
    const tableOrEmptyState = page.getByRole('grid').or(page.getByText(/no requests/i));

    await expect(tableOrEmptyState.first()).toBeVisible();
  });
});

test.describe('Filters', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/requests');
    await page.waitForSelector('main', { state: 'visible' });
  });

  test('filter appears in URL', async ({ page }) => {
    // Whichever method the first row happens to carry: naming one ties the
    // test to what the seed sent last, and `GET` was simply absent from the
    // first page often enough to matter.
    const badge = page.locator('tbody tr').first().getByRole('button').first();
    await expect(badge).toBeVisible();
    const method = ((await badge.textContent()) ?? '').trim();
    expect(method).not.toBe('');

    // Retried as a unit: a click that lands before React has attached the
    // handler does nothing at all, and the page gives no signal that it is
    // ready — the badge simply ignores the first click and the assertion then
    // waits out its timeout for a navigation nobody started.
    await expect(async () => {
      await badge.click();
      await expect(page).toHaveURL(new RegExp(`methods=${method}`, 'i'), { timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
  });

  test('filter persists on page reload', async ({ page }) => {
    // Navigate with filter in URL
    await page.goto('/requests?methods=get');
    await page.waitForSelector('main', { state: 'visible' });

    // URL should still have filter
    await expect(page).toHaveURL(/methods=get/i);
  });

  /**
   * The single-filter path. "Clear all" only appears once more than one filter
   * is active — filters.spec.ts covers that — so with one filter the chip's own
   * remove button is the way out, and it had no test at all. The previous
   * version of this test looked for "Clear all" behind an `if (isVisible)` and
   * so passed without ever finding it.
   */
  test('removing the only filter chip clears the URL', async ({ page }) => {
    // Upper case is what the dashboard itself puts in the URL.
    await page.goto('/requests?methods=GET');
    await page.waitForSelector('main', { state: 'visible' });

    const chip = page.getByRole('button', { name: /Remove Method filter: GET/i });
    await expect(chip).toBeVisible();

    await expect(async () => {
      await chip.click();
      await expect(page).not.toHaveURL(/methods=/, { timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
  });
});

test.describe('Entry Details', () => {
  test('clicking entry row navigates to detail', async ({ page }) => {
    await page.goto('/requests');
    await page.waitForSelector('main', { state: 'visible' });

    // The suite seeds the application, so a row missing here is a failure
    // rather than a reason to pass quietly.
    const row = page.locator('tbody tr[tabindex="0"]').first();
    await expect(row).toBeVisible();

    await expect(async () => {
      await row.click();
      await expect(page).toHaveURL(/\/requests\/\d+/, { timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
  });

  test('the arrow in the header goes to the list', async ({ page }) => {
    // The arrow used to be a history delta wearing a link's clothes: clicking
    // it went back, but its href was the detail page itself, and a detail page
    // reached from a shared link has nothing behind it to go back to.
    await page.goto('/requests');
    await page.waitForSelector('main', { state: 'visible' });
    await page.locator('tbody tr').first().click();
    await page.waitForURL(/\/requests\/\d+$/);

    const detailUrl = page.url();
    const arrow = page.getByLabel('Back to requests');

    await expect(arrow).toHaveAttribute('href', /\/requests$/);
    expect(await arrow.getAttribute('href')).not.toBe(new URL(detailUrl).pathname);

    await arrow.click();

    await expect(page).toHaveURL(/\/requests$/);
  });

  test('back navigation returns to list', async ({ page }) => {
    // Through the list, not straight to the detail — going back from the first
    // page in a fresh context lands on about:blank, which says nothing about
    // the app.
    await page.goto('/requests');
    await page.waitForSelector('main', { state: 'visible' });

    await page.goto('/requests/1');
    await page.waitForSelector('main', { state: 'visible' });

    await page.goBack();

    await expect(page).toHaveURL(/\/requests$/);
  });
});

test.describe('Keyboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/requests');
    await page.waitForSelector('main', { state: 'visible' });
  });

  test('Enter key opens entry detail', async ({ page }) => {
    const row = page.locator('tbody tr[tabindex="0"]').first();
    await expect(row).toBeVisible();

    await expect(async () => {
      await row.focus();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/\/requests\/\d+/, { timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
  });
});
