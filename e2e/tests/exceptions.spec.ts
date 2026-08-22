import { test, expect } from '@playwright/test';
import { EntriesPage } from '../page-objects/entries.page';

test.describe('Resolving an exception', () => {
  let entries: EntriesPage;

  test.beforeEach(async ({ page }) => {
    entries = new EntriesPage(page);
    await entries.goto('exceptions');
    await entries.waitForLoad();
  });

  test('marks one resolved', async ({ page }) => {
    const circle = page.locator('tbody tr button').first();
    await circle.click();

    // The row's own state changes; the sidebar count follows it.
    await expect(page.locator('tbody tr').first()).toHaveClass(/opacity-50/, { timeout: 10_000 });
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
