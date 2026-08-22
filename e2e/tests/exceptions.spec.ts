import { test, expect } from '@playwright/test';
import { EntriesPage } from '../page-objects/entries.page';

test.describe('Resolving an exception', () => {
  let entries: EntriesPage;

  test.beforeEach(async ({ page }) => {
    entries = new EntriesPage(page);
    await entries.goto('exceptions');
    await entries.waitForLoad();
  });

  test('changes the row it is clicked on', async ({ page }) => {
    // Whether the first row starts resolved depends on what ran before it —
    // this suite drives one long-lived example application, and the click
    // toggles. Asserting "it becomes resolved" passed six runs in seven and
    // failed the one where the row was already resolved. What is true either
    // way is that the state changes.
    const row = page.locator('tbody tr').first();
    const before = (await row.getAttribute('class')) ?? '';

    await row.locator('button').first().click();

    await expect
      .poll(async () => (await row.getAttribute('class')) ?? '', { timeout: 10_000 })
      .not.toBe(before);
  });

  test('says so when the API refuses', async ({ page }) => {
    // It used to write to the console and nothing else: the circle stayed as it
    // was, so the reader clicks again, and again, against an API that is
    // refusing them.
    await page.route('**/__nestlens__/api/entries/*/*resolve', (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: '{"statusCode":403,"message":"Forbidden"}',
      }),
    );

    await page.locator('tbody tr button').first().click();

    await expect(page.getByText(/Could not change this exception/)).toBeVisible();
  });
});
