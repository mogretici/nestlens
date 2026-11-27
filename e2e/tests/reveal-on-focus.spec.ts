import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Controls that only appear on hover have to appear for everyone else too.
 *
 * The JSON viewer's "Copy value" button sits at opacity 0 until its row is
 * hovered, and a filter chip's ✕ at 60%. A keyboard reader tabbing onto either
 * focused something they could not see, and on a phone a tap has to reveal
 * what hover reveals, or the button is invisible but still clickable.
 */

const ENTRIES =
  'http://localhost:3000/nestlens/__nestlens__/api/entries/cursor?type=request&limit=100';

interface RequestEntry {
  id: number;
  payload: { body?: unknown };
}

/** A request whose payload the viewer renders as rows, each with its own copy button. */
async function requestWithBody(request: APIRequestContext): Promise<number> {
  const response = await request.get(ENTRIES);
  const { data } = (await response.json()) as { data: RequestEntry[] };
  const entry = data.find(
    ({ payload }) =>
      typeof payload.body === 'object' &&
      payload.body !== null &&
      Object.keys(payload.body).length > 0,
  );
  if (!entry) throw new Error('The seeded example app has no request with a body.');

  return entry.id;
}

async function tabTo(page: Page, name: string): Promise<void> {
  for (let presses = 0; presses < 80; presses++) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(
      () =>
        document.activeElement?.getAttribute('title') ??
        document.activeElement?.getAttribute('aria-label'),
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
    await expect(page.locator('button[title="Copy value"]:focus').locator('xpath=..')).toHaveCSS(
      'opacity',
      '1',
    );
  });

  test("a filter chip's remove icon shows fully when the chip has keyboard focus", async ({
    page,
  }) => {
    await page.goto('/requests?tags=SUCCESS');
    const chip = page.getByRole('button', { name: 'Remove Tag filter: SUCCESS' });
    await expect(chip).toBeVisible();

    await tabTo(page, 'Remove Tag filter: SUCCESS');

    await expect(chip).toBeFocused();
    await expect(chip.locator('svg')).toHaveCSS('opacity', '1');
  });

  test.describe('on a touch screen', () => {
    test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

    /**
     * A phone puts the tapped element in `:hover` and leaves it there, so the
     * product has to let `hover:` apply on a device that reports
     * `(hover: none)`. Tailwind 4 wraps `hover:` in `@media (hover: hover)`,
     * which is what the `hover` variant override in index.css undoes.
     *
     * This sets the hover state directly instead of tapping. Headless Chromium
     * on Linux follows a tap's synthetic click with a mouse move back to the
     * emulated cursor, at (0, 0), so the row loses `:hover` 10 ms later; the
     * button faded in and straight back out on CI. A phone does not do that,
     * and the property being tested is the stylesheet's, not the emulator's.
     */
    test('a hovered row shows its copy button on a device without hover', async ({
      page,
      request,
      browserName,
    }) => {
      test.skip(browserName === 'firefox', 'Firefox has no mobile emulation in Playwright.');

      await page.goto(`/requests/${await requestWithBody(request)}`);
      expect(await page.evaluate(() => matchMedia('(hover: none)').matches)).toBe(true);

      const holder = page.getByTitle('Copy value').first().locator('xpath=..');
      await expect(holder).toHaveCSS('opacity', '0');

      await holder.locator('xpath=..').hover();

      await expect(holder).toHaveCSS('opacity', '1');
    });
  });
});
