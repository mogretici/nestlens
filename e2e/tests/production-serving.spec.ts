import { expect, test, type Page } from '@playwright/test';

/**
 * What the published package actually serves.
 *
 * The other suites load the dashboard from the Vite dev server, which serves
 * the SPA itself and proxies the API. Convenient, but it means the code
 * NestLens ships — the controller that reads files off disk, injects
 * `<base href>`, resolves the SPA wildcard and sets cache headers — is never
 * exercised. 0.8.0 shipped a regression that served every script as
 * `{"type":"Buffer","data":[…]}`; the dashboard rendered blank and not one
 * test failed.
 *
 * These run against the example application, where the bundle comes out of the
 * package exactly as it would in a user's app. They deliberately stay small:
 * re-running the functional suite here would re-download the ~1 MB bundle per
 * test — Playwright gives each test a cold cache — for coverage the dev-server
 * projects already provide. What cannot be covered anywhere else is that the
 * bytes leaving the package are correct.
 */

const MOUNT = '/nestlens';

/**
 * Each test starts with an empty cache, so the first paint waits on the whole
 * bundle — comfortably past the default expect timeout on a cold run, even
 * though the page itself is fine.
 */
const FIRST_PAINT = { timeout: 20_000 };

/**
 * Proof the SPA mounted: the navigation only exists once React has rendered.
 * Matched by role rather than by tag, so it does not depend on the markup the
 * dashboard happens to use.
 */
const appShell = (page: Page) => page.getByRole('navigation').first();

test.describe('serving the built dashboard', () => {
  test('serves index.html, not a wrapped or serialised value', async ({ page }) => {
    const response = await page.goto(MOUNT);

    expect(response?.status()).toBe(200);
    expect(response?.headers()['content-type']).toContain('text/html');
    await expect(page.locator('#root')).toBeAttached();
  });

  test('tells the bundle where it is mounted', async ({ page }) => {
    await page.goto(MOUNT);

    await expect(page.locator('base')).toHaveAttribute('href', `${MOUNT}/`);
    expect(await page.evaluate(() => window.__NESTLENS_BASE__)).toBe(MOUNT);
  });

  /**
   * The regression guard: a raw Buffer handed to the adapter came back as JSON,
   * so every asset was valid HTTP with a plausible content-type and unusable
   * content. Only executing it catches that.
   */
  test('serves assets a browser can execute', async ({ page }) => {
    const failures: string[] = [];
    page.on('response', (response) => {
      if (response.url().includes('/assets/') && !response.ok()) {
        failures.push(`${response.status()} ${response.url()}`);
      }
    });
    page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));

    await page.goto(MOUNT);

    // The app only renders if its modules parsed and ran.
    await expect(appShell(page)).toBeVisible(FIRST_PAINT);
    expect(failures).toEqual([]);
  });

  test('fingerprinted assets are cacheable, the entry point is not', async ({ page }) => {
    await page.goto(MOUNT);

    const assetUrl = await page.evaluate(() => {
      const script = document.querySelector<HTMLScriptElement>('script[src*="/assets/"]');
      return script ? new URL(script.src, document.baseURI).toString() : null;
    });
    expect(assetUrl).not.toBeNull();

    const asset = await page.request.get(assetUrl as string);
    expect(asset.status()).toBe(200);
    expect(asset.headers()['cache-control']).toContain('immutable');

    const html = await page.request.get(`${MOUNT}`);
    expect(html.headers()['cache-control']).toContain('no-cache');
  });

  /**
   * Deep links are served by the SPA wildcard, which is a bare `*` because that
   * is the only form both Express and Fastify accept.
   */
  test('serves a deep SPA route as the application', async ({ page }) => {
    const response = await page.goto(`${MOUNT}/requests/abc-123`);

    expect(response?.status()).toBe(200);
    expect(response?.headers()['content-type']).toContain('text/html');
    await expect(appShell(page)).toBeVisible(FIRST_PAINT);
  });

  test('answers its own API under the mount point', async ({ page }) => {
    const response = await page.request.get(`${MOUNT}/__nestlens__/api/entries?limit=1`);

    expect(response.status()).toBe(200);
    const body = (await response.json()) as { success: boolean; data: unknown };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });
});
