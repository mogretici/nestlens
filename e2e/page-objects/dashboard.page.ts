import { Page, Locator } from '@playwright/test';

/**
 * Dashboard Page Object
 * Encapsulates interactions with the main dashboard page
 */
export class DashboardPage {
  readonly page: Page;
  readonly sidebar: Locator;
  readonly mainContent: Locator;
  readonly themeToggle: Locator;
  readonly clearButton: Locator;
  readonly logo: Locator;
  readonly navItems: Locator;
  readonly mobileMenuButton: Locator;
  readonly mobileSidebar: Locator;

  constructor(page: Page) {
    this.page = page;
    // The layout renders a mobile and a desktop sidebar at the same time and
    // hides one with CSS, so anything matching both has to take the visible
    // one — `.first()` picks whichever comes first in the DOM, which is the
    // hidden mobile copy.
    this.sidebar = page.locator('[data-testid="sidebar"]');
    this.mainContent = page.locator('main');
    this.themeToggle = page.getByRole('button', { name: /dark mode|light mode|theme/i });
    this.clearButton = page.getByRole('button', { name: /clear/i });
    this.logo = page.locator('a[href="/"]:visible').first();
    this.navItems = page.locator('nav:visible a');
    this.mobileMenuButton = page.getByRole('button', { name: /menu/i });
    // The drawer the menu button opens — a separate element from the desktop
    // sidebar, which stays hidden at mobile widths.
    this.mobileSidebar = page.locator('[data-testid="mobile-sidebar"]');
  }

  async goto() {
    await this.page.goto('/');
  }

  async navigateTo(path: string) {
    await this.page.goto(path);
  }

  async clickNavItem(text: string) {
    await this.navItems.filter({ hasText: text }).first().click();
  }

  async toggleTheme() {
    await this.themeToggle.click();
  }

  async isDarkMode(): Promise<boolean> {
    const html = this.page.locator('html');
    return (await html.getAttribute('class'))?.includes('dark') ?? false;
  }

  async openClearDialog() {
    await this.clearButton.click();
  }

  async confirmClear() {
    await this.page.getByRole('button', { name: /confirm|yes|clear/i }).click();
  }

  async getStats() {
    const stats = await this.page.locator('[data-testid="stats"]').textContent();
    return stats;
  }
}
