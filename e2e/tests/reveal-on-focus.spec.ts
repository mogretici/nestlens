import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Controls that only appear on hover have to appear for everyone else too.
 *
 * The JSON viewer's "Copy value" button sits at opacity 0 until its row is
 * hovered, and a filter chip's ✕ at 60%. A keyboard reader tabbing onto either
 * focused something they could not see, and on a phone a tap has to reveal
 * what hover reveals, or the button is invisible but still clickable.
 */

const ENTRIES = 'http://localhost:3000/nestlens/__nestlens__/api/entries/cursor?type=request&limit=100';

interface RequestEntry {
  id: number;
  payload: { body?: unknown };
}

/** A request whose payload the viewer renders as rows, each with its own copy button. */
async function requestWithBody(request: APIRequestContext): Promise<number> {
  const response = await request.get(ENTRIES);
  const { data } = (await response.json()) as { data: RequestEntry[] };
  const entry = data.find(
    ({ payload }) => typeof payload.body === 'object' && payload.body !== null && Object.keys(payload.body).length > 0,
  );
  if (!entry) throw new Error('The seeded example app has no request with a body.');

  return entry.id;
}

async function tabTo(page: Page, name: string): Promise<void> {
  for (let presses = 0; presses < 80; presses++) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(
      () => document.activeElement?.getAttribute('title') ?? document.activeElement?.getAttribute('aria-label'),
    );
    if (focused === name) return;
  }
  throw new Error(`Tab never reached "${name}".`);
}

test.describe('controls revealed on hover', () => {
  test('the copy button shows when it has keyboard focus', async ({ page, request }) => {
    await page.goto(`/requests/${await requestWithBody(request)}`);
    const copy = page.getByTitle('Copy value').first();
    await expect(copy).toBeAttached();

    await tabTo(page, 'Copy value');

    await expect(page.getByTitle('Copy value').first()).toBeFocused();
    await expect(page.locator('button[title="Copy value"]:focus').locator('xpath=..')).toHaveCSS('opacity', '1');
  });

  test("a filter chip's remove icon shows fully when the chip has keyboard focus", async ({ page }) => {
    await page.goto('/requests?tags=SUCCESS');
    const chip = page.getByRole('button', { name: 'Remove Tag filter: SUCCESS' });
    await expect(chip).toBeVisible();

    await tabTo(page, 'Remove Tag filter: SUCCESS');

    await expect(chip).toBeFocused();
    await expect(chip.locator('svg')).toHaveCSS('opacity', '1');
  });

  test.describe('on a touch screen', () => {
    test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

    test('tapping a row shows its copy button', async ({ page, request, browserName }) => {
      test.skip(browserName === 'firefox', 'Firefox has no mobile emulation in Playwright.');

      await page.goto(`/requests/${await requestWithBody(request)}`);
      const copy = page.getByTitle('Copy value').first();
      const holder = copy.locator('xpath=..');
      await expect(holder).toHaveCSS('opacity', '0');

      await holder.locator('xpath=..').tap();

      await expect(holder).toHaveCSS('opacity', '1');
    });
  });
});
