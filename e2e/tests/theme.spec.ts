import { test, expect, type Page } from '@playwright/test';
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
  const pageTrack = (page: Page) =>
    page.evaluate(() => getComputedStyle(document.documentElement, '::-webkit-scrollbar-track').backgroundColor);

  /**
   * The thumb's colour, read from the stylesheet rather than from
   * getComputedStyle.
   *
   * Chromium on Linux resolves `getComputedStyle(html, '::-webkit-scrollbar-thumb')`
   * as if the thumb were hovered, whatever the pointer is doing: it returns the
   * `:hover` colour in both themes, with the pointer outside the page, while
   * the thumb it actually paints (with Playwright's `--hide-scrollbars` lifted)
   * is the plain one. On macOS it returns the plain colour. So this resolves
   * the cascade itself: the last rule for the thumb, without `:hover`, whose
   * selector reaches <html>.
   */
  const pageThumb = (page: Page) =>
    page.evaluate(() => {
      const PART = '::-webkit-scrollbar-thumb';
      const rules: CSSStyleRule[] = [];
      const collect = (list: CSSRuleList): void => {
        for (const rule of Array.from(list)) {
          if (rule instanceof CSSStyleRule) rules.push(rule);
          else if ('cssRules' in rule) collect((rule as CSSGroupingRule).cssRules);
        }
      };
      for (const sheet of Array.from(document.styleSheets)) collect(sheet.cssRules);

      const winner = rules
        .filter((rule) => rule.selectorText.endsWith(PART) && rule.style.backgroundColor)
        .filter((rule) => {
          const scope = rule.selectorText.slice(0, -PART.length);
          return scope === '' || document.documentElement.matches(scope);
        })
        .pop();
      if (!winner) return null;

      const swatch = document.createElement('div');
      swatch.style.backgroundColor = winner.style.backgroundColor;
      document.body.append(swatch);
      const colour = getComputedStyle(swatch).backgroundColor;
      swatch.remove();
      return colour;
    });

  test('the page scrollbar is dark in the dark theme', async ({ page, browserName }) => {
    test.skip(browserName === 'firefox', 'Firefox styles scrollbars through color-scheme.');

    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/requests');
    await page.waitForSelector('html.dark');

    expect(await pageThumb(page)).toBe('rgb(75, 85, 99)');
    expect(await pageTrack(page)).toBe('rgb(31, 41, 55)');
  });

  test('the page scrollbar is light in the light theme', async ({ page, browserName }) => {
    test.skip(browserName === 'firefox', 'Firefox styles scrollbars through color-scheme.');

    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/requests');
    await page.waitForSelector('html:not(.dark)');

    expect(await pageThumb(page)).toBe('rgb(209, 213, 219)');
    expect(await pageTrack(page)).toBe('rgb(243, 244, 246)');
  });
});
