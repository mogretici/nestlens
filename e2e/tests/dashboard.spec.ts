import { test, expect } from '@playwright/test';
import { DashboardPage } from '../page-objects/dashboard.page';

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
    await dashboard.logo.click();
    await expect(page).toHaveURL('/');
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

  test('shows confirmation dialog on clear click', async ({ page }) => {
    await dashboard.openClearDialog();

    // Verify dialog appears
    const dialog = page.getByRole('dialog').or(page.locator('[role="alertdialog"]'));
    await expect(dialog).toBeVisible();
  });

  test('closes dialog on cancel', async ({ page }) => {
    await dashboard.openClearDialog();

    const cancelButton = page.getByRole('button', { name: /cancel|close/i });
    await cancelButton.click();

    const dialog = page.getByRole('dialog').or(page.locator('[role="alertdialog"]'));
    await expect(dialog).not.toBeVisible();
  });
});
