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

  constructor(page: Page) {
    this.page = page;
    this.sidebar = page.locator('[data-testid="sidebar"]').or(page.locator('aside'));
    this.mainContent = page.locator('main');
    this.themeToggle = page.getByRole('button', { name: /dark mode|light mode|theme/i });
    this.clearButton = page.getByRole('button', { name: /clear/i });
    this.logo = page.locator('a[href="/"]').first();
    this.navItems = page.locator('nav a');
    this.mobileMenuButton = page.getByRole('button', { name: /menu/i });
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
