import { test, expect } from '@playwright/test';
import { DashboardPage } from '../page-objects/dashboard.page';

test.describe('When NestLens cannot answer', () => {
  /**
   * Every number on the overview falls back to zero when the stats are absent,
   * and they are absent whenever the API refuses. Measured under 403: "0 total
   * recorded, 0 unresolved exceptions, 0 slow queries" — an all-clear from a
   * monitor that could not see anything.
   */
  test.beforeEach(async ({ page }) => {
    await page.route('**/__nestlens__/api/**', (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: '{"statusCode":403,"message":"Forbidden"}',
      }),
    );
  });

  test('says it could not reach NestLens instead of reporting zeros', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByTestId('stats-error')).toBeVisible();
    await expect(page.getByText('total recorded')).toHaveCount(0);
  });
});

test.describe('Dashboard', () => {
  let dashboard: DashboardPage;

  test.beforeEach(async ({ page }) => {
    dashboard = new DashboardPage(page);
    await dashboard.goto();
  });

  test('loads and displays the main layout', async ({ page }) => {
    // Verify sidebar navigation is present
    await expect(dashboard.sidebar).toBeVisible();

    // Verify main content area exists
    await expect(dashboard.mainContent).toBeVisible();

    // Verify logo/brand is present
    await expect(dashboard.logo).toBeVisible();
  });

  test('shows navigation items for all entry types', async ({ page }) => {
    // Check for key navigation items
    const navTexts = ['Requests', 'Queries', 'Logs', 'Exceptions', 'Jobs'];

    for (const text of navTexts) {
      await expect(dashboard.navItems.filter({ hasText: text }).first()).toBeVisible();
    }
  });

  test('logo links to home page', async ({ page }) => {
    await dashboard.navigateTo('/requests');

    // Retried as a unit: a click landing before React attaches its handler is
    // simply ignored, and the assertion then waits out its timeout for a
    // navigation that was never started.
    await expect(async () => {
      await dashboard.logo.click();
      await expect(page).toHaveURL('/', { timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
  });

  test('displays theme toggle button', async ({ page }) => {
    await expect(dashboard.themeToggle).toBeVisible();
  });

  test('displays clear data button', async ({ page }) => {
    await expect(dashboard.clearButton).toBeVisible();
  });
});

test.describe('Theme Toggle', () => {
  let dashboard: DashboardPage;

  test.beforeEach(async ({ page }) => {
    dashboard = new DashboardPage(page);
    await dashboard.goto();
  });

  test('toggles dark mode on click', async ({ page }) => {
    const initialDark = await dashboard.isDarkMode();
    await dashboard.toggleTheme();

    // Wait for theme transition
    await page.waitForTimeout(100);

    const afterToggle = await dashboard.isDarkMode();
    expect(afterToggle).not.toBe(initialDark);
  });

  test('persists theme preference on reload', async ({ page }) => {
    // Set dark mode
    if (!(await dashboard.isDarkMode())) {
      await dashboard.toggleTheme();
    }

    await page.waitForTimeout(100);
    expect(await dashboard.isDarkMode()).toBe(true);

    // Reload and verify persistence
    await page.reload();
    await page.waitForTimeout(100);

    expect(await dashboard.isDarkMode()).toBe(true);
  });
});

test.describe('Clear Data Dialog', () => {
  let dashboard: DashboardPage;

  test.beforeEach(async ({ page }) => {
    dashboard = new DashboardPage(page);
    await dashboard.goto();
  });

  /**
   * Clearing goes through `window.confirm`, so there is no dialog in the DOM to
   * query — the browser owns it. These drive it the way Playwright exposes it.
   */
  test('asks for confirmation before clearing', async ({ page }) => {
    let asked: string | null = null;
    page.once('dialog', async (dialog) => {
      asked = dialog.message();
      await dialog.dismiss();
    });

    await dashboard.openClearDialog();

    await expect.poll(() => asked).toMatch(/clear/i);
  });

  test('keeps entries when the confirmation is dismissed', async ({ page }) => {
    page.once('dialog', (dialog) => dialog.dismiss());
    const before = await page.locator('table tbody tr').count();

    await dashboard.openClearDialog();

    await expect(page.locator('table tbody tr')).toHaveCount(before);
  });
});
