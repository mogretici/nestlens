import { test, expect } from '@playwright/test';

/**
 * The search field on a list page writes `?search=` 350 ms after the last
 * keystroke, replacing the history entry rather than adding one per word, and
 * the browser's back and forward buttons bring the field back in step.
 */
test.describe('Search field', () => {
  test('writes the search to the URL after typing stops', async ({ page }) => {
    await page.goto('/requests');
    const field = page.getByLabel(/search by path/i);
    const entries = await page.evaluate(() => history.length);

    await field.fill('dump');

    await expect(page).toHaveURL(/[?&]search=dump(&|$)/);
    expect(await page.evaluate(() => history.length)).toBe(entries);
  });

  test('back and forward restore the search it wrote', async ({ page }) => {
    await page.goto('/requests');
    await page.getByLabel(/search by path/i).fill('dump');
    await expect(page).toHaveURL(/[?&]search=dump(&|$)/);

    await page.getByRole('link', { name: 'Queries' }).first().click();
    await expect(page).toHaveURL(/\/queries$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/requests\?search=dump$/);
    await expect(page.getByLabel(/search by path/i)).toHaveValue('dump');

    await page.goForward();
    await expect(page).toHaveURL(/\/queries$/);
  });

  test('a row clicked straight after the list opens stays open', async ({ page }) => {
    await page.goto('/requests');
    await page.locator('tbody tr').first().click();

    await expect(page).toHaveURL(/\/requests\/\d+$/);
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/requests\/\d+$/);
  });
});
