import { test, expect } from '@playwright/test';
import { EntriesPage } from '../page-objects/entries.page';

/**
 * The live tail, in a browser.
 *
 * The stream has integration tests on the server — the endpoint pushes what
 * the collector records — and nothing checked that a browser receives it and
 * puts a row on the page. That is the whole of the feature from a reader's
 * side: the *Live* indicator says entries arrive as they are collected.
 *
 * It is the kind of promise this repository has found broken before by one
 * layer answering correctly and the next never asking: `captureVariables`
 * recorded nothing on Mercurius, monitored tags counted zero, the Prisma
 * client was looked for where a Nest application never puts it.
 */
test.describe('Live tail', () => {
  /**
   * The application is on 3000; the dashboard under test may be served from
   * the dev server on 5173, which is what `baseURL` points at for those
   * projects. A request has to go to the application to be recorded.
   */
  const APPLICATION = 'http://localhost:3000';

  test('a request made now appears without a reload', async ({ page }) => {
    const entries = new EntriesPage(page);
    await entries.goto('requests');
    await entries.waitForLoad();

    const before = await entries.rows.count();

    // Something the application does, while the page is watching. A route the
    // application actually has: an unmatched path never reaches an
    // interceptor, so it is recorded as a not-found exception rather than as a
    // request.
    await page.request.get(`${APPLICATION}/status/no-content`).catch(() => undefined);

    await expect
      .poll(async () => entries.rows.count(), { timeout: 15_000 })
      .toBeGreaterThan(before);
  });

  test('the new row is the request that was just made', async ({ page }) => {
    const entries = new EntriesPage(page);
    await entries.goto('requests');
    await entries.waitForLoad();

    await page.request.get(`${APPLICATION}/status/no-content`).catch(() => undefined);

    await expect(page.getByText('/status/no-content', { exact: false }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('the Live indicator is shown', async ({ page }) => {
    const entries = new EntriesPage(page);
    await entries.goto('requests');
    await entries.waitForLoad();

    await expect(page.getByText(/^live$/i).first()).toBeVisible();
  });
});
