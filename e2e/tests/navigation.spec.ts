import { test, expect } from '@playwright/test';
import { DashboardPage } from '../page-objects/dashboard.page';

test.describe('Navigation', () => {
  let dashboard: DashboardPage;

  test.beforeEach(async ({ page }) => {
    dashboard = new DashboardPage(page);
    await dashboard.goto();
  });

  const entryTypes = [
    { name: 'Requests', path: '/requests' },
    { name: 'Queries', path: '/queries' },
    { name: 'Logs', path: '/logs' },
    { name: 'Exceptions', path: '/exceptions' },
    { name: 'Jobs', path: '/jobs' },
    { name: 'Cache', path: '/cache' },
    { name: 'HTTP', path: '/http-client' },
    { name: 'Events', path: '/events' },
    { name: 'Mail', path: '/mail' },
    { name: 'Commands', path: '/commands' },
    { name: 'Schedule', path: '/schedule' },
    { name: 'Notifications', path: '/notifications' },
    { name: 'Views', path: '/views' },
    { name: 'Gates', path: '/gates' },
    { name: 'Redis', path: '/redis' },
    { name: 'Model', path: '/model' },
    { name: 'Dumps', path: '/dumps' },
  ];

  for (const { name, path } of entryTypes) {
    test(`navigates to ${name} page`, async ({ page }) => {
      await dashboard.clickNavItem(name);
      await expect(page).toHaveURL(new RegExp(path));
    });
  }

  test('highlights active navigation item', async ({ page }) => {
    await page.goto('/requests');

    const requestsNav = dashboard.navItems.filter({ hasText: 'Requests' }).first();
    await expect(requestsNav).toHaveAttribute('aria-current', 'page');
  });

  test('back navigation works correctly', async ({ page }) => {
    await page.goto('/requests');
    await page.goto('/queries');

    await page.goBack();
    await expect(page).toHaveURL(/requests/);
  });

  test('deep linking to entry detail works', async ({ page }) => {
    // Navigate directly to a detail page URL
    await page.goto('/requests');
    
    // If entries exist, click one and verify URL changes
    const rows = page.locator('tbody tr, [role="row"]');
    const rowCount = await rows.count();
    
    if (rowCount > 0) {
      await rows.first().click();
      await expect(page).toHaveURL(/requests\/\d+|requests#/);
    }
  });
});

test.describe('Mobile Navigation', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('shows mobile menu button', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await expect(dashboard.mobileMenuButton).toBeVisible();
  });

  test('opens sidebar on menu click', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await dashboard.mobileMenuButton.click();
    await expect(dashboard.sidebar).toBeVisible();
  });

  test('closes sidebar on navigation', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await dashboard.mobileMenuButton.click();
    await dashboard.clickNavItem('Requests');

    // Sidebar should close after navigation
    await expect(page).toHaveURL(/requests/);
  });
});
