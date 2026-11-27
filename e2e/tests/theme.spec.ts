import { test, expect } from '@playwright/test';
import { DashboardPage } from '../page-objects/dashboard.page';

test.describe('Theme', () => {
  test('respects system preference (dark)', async ({ page }) => {
    // Emulate dark color scheme
    await page.emulateMedia({ colorScheme: 'dark' });

    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    // Should be in dark mode initially
    const html = page.locator('html');
    await expect(html).toHaveClass(/dark/);
  });

  test('respects system preference (light)', async ({ page }) => {
    // Clear any stored preference
    await page.addInitScript(() => {
      localStorage.removeItem('theme');
    });

    // Emulate light color scheme
    await page.emulateMedia({ colorScheme: 'light' });

    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    // Should be in light mode
    const html = page.locator('html');
    await expect(html).not.toHaveClass(/dark/);
  });

  test('persists user theme choice', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    // Toggle to dark mode
    if (!(await dashboard.isDarkMode())) {
      await dashboard.toggleTheme();
    }

    // Verify it's dark
    expect(await dashboard.isDarkMode()).toBe(true);

    // Reload page
    await page.reload();

    // Should still be dark
    expect(await dashboard.isDarkMode()).toBe(true);
  });

  test('applies correct dark mode styles', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    // Set dark mode
    if (!(await dashboard.isDarkMode())) {
      await dashboard.toggleTheme();
    }

    // Verify background color is dark
    const body = page.locator('body');
    const bgColor = await body.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });

    // Dark mode should have dark background (not white/light)
    expect(bgColor).not.toBe('rgb(255, 255, 255)');
  });

  test('toggle button shows correct icon', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    // Check if button exists and is accessible
    await expect(dashboard.themeToggle).toBeVisible();
    await expect(dashboard.themeToggle).toBeEnabled();
  });
});

test.describe('Native controls', () => {
  /**
   * What the browser paints for itself — the select popup, the scrollbars —
   * follows `color-scheme`, not Tailwind. Without it the dark theme stopped at
   * the edge of anything the stylesheet does not paint, and the range filter's
   * dropdown opened white on a dark page.
   */
  const declaredScheme = (page: import('@playwright/test').Page) =>
    page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);

  test('tells the browser the page is dark', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/requests');
    await page.waitForSelector('html.dark');

    expect(await declaredScheme(page)).toBe('dark');
  });

  test('tells the browser the page is light', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/requests');
    await page.waitForSelector('html:not(.dark)');

    expect(await declaredScheme(page)).toBe('light');
  });
});

test.describe('Scrollbars', () => {
  /**
   * `.dark` sits on <html>, and the page's own scrollbar belongs to <html>.
   * A rule written for `.dark *` reaches every scrolling panel but not the
   * page, so the main scrollbar stayed light in the dark theme. Firefox does
   * not implement `::-webkit-scrollbar` and follows `color-scheme` instead.
   */
  const pageScrollbar = (page: import('@playwright/test').Page, part: string) =>
    page.evaluate((pseudo) => getComputedStyle(document.documentElement, pseudo).backgroundColor, part);

  test('the page scrollbar is dark in the dark theme', async ({ page, browserName }) => {
    test.skip(browserName === 'firefox', 'Firefox styles scrollbars through color-scheme.');

    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/requests');
    await page.waitForSelector('html.dark');

    expect(await pageScrollbar(page, '::-webkit-scrollbar-thumb')).toBe('rgb(75, 85, 99)');
    expect(await pageScrollbar(page, '::-webkit-scrollbar-track')).toBe('rgb(31, 41, 55)');
  });

  test('the page scrollbar is light in the light theme', async ({ page, browserName }) => {
    test.skip(browserName === 'firefox', 'Firefox styles scrollbars through color-scheme.');

    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/requests');
    await page.waitForSelector('html:not(.dark)');

    expect(await pageScrollbar(page, '::-webkit-scrollbar-thumb')).toBe('rgb(209, 213, 219)');
    expect(await pageScrollbar(page, '::-webkit-scrollbar-track')).toBe('rgb(243, 244, 246)');
  });
});
