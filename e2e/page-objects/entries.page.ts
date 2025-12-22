import { Page, Locator } from '@playwright/test';

/**
 * Entries Page Object
 * For interacting with entry list pages (Requests, Queries, etc.)
 */
export class EntriesPage {
  readonly page: Page;
  readonly table: Locator;
  readonly rows: Locator;
  readonly pageHeader: Locator;
  readonly filterChips: Locator;
  readonly clearFiltersButton: Locator;
  readonly pagination: Locator;
  readonly loadingSpinner: Locator;
  readonly emptyState: Locator;

  constructor(page: Page) {
    this.page = page;
    this.table = page.locator('table').or(page.locator('[role="grid"]'));
    this.rows = page.locator('tbody tr').or(page.locator('[role="row"]'));
    this.pageHeader = page.locator('[data-testid="page-header"]').or(page.locator('header'));
    this.filterChips = page.locator('[data-testid="filter-chip"]').or(page.locator('.filter-chip'));
    this.clearFiltersButton = page.getByRole('button', { name: /clear all/i });
    this.pagination = page.locator('[data-testid="pagination"]').or(page.locator('.pagination'));
    this.loadingSpinner = page.locator('[data-testid="loading"]').or(page.locator('.animate-spin'));
    this.emptyState = page.locator('[data-testid="empty-state"]').or(page.getByText(/no entries/i));
  }

  async goto(entryType: string) {
    await this.page.goto(`/${entryType}`);
  }

  async waitForLoad() {
    await this.loadingSpinner.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  }

  async getRowCount(): Promise<number> {
    return await this.rows.count();
  }

  async clickRow(index: number) {
    await this.rows.nth(index).click();
  }

  async clickBadge(text: string) {
    await this.page.locator(`[data-testid="badge"]`).filter({ hasText: text }).first().click();
  }

  async addFilter(category: string, value: string) {
    // Click on a badge with the value to add filter
    await this.page.locator(`text="${value}"`).first().click();
  }

  async removeFilter(value: string) {
    await this.filterChips.filter({ hasText: value }).locator('button').click();
  }

  async clearAllFilters() {
    if (await this.clearFiltersButton.isVisible()) {
      await this.clearFiltersButton.click();
    }
  }

  async getFilterCount(): Promise<number> {
    return await this.filterChips.count();
  }

  async goToNextPage() {
    await this.pagination.getByRole('button', { name: /next/i }).click();
  }

  async goToPreviousPage() {
    await this.pagination.getByRole('button', { name: /previous|prev/i }).click();
  }

  async getEntryDetails() {
    return await this.page.locator('[data-testid="entry-detail"]').textContent();
  }
}
