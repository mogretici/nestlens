/**
 * Tabs Component Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Tabs, { Tab } from '../../components/Tabs';

const mockTabs: Tab[] = [
  { id: 'overview', label: 'Overview', content: <div>Overview content</div> },
  { id: 'details', label: 'Details', content: <div>Details content</div> },
  { id: 'logs', label: 'Logs', content: <div>Logs content</div>, badge: 5 },
];

describe('Tabs', () => {
  beforeEach(() => {
    // Clear URL hash
    window.location.hash = '';
  });

  describe('Rendering', () => {
    it('renders all tab labels', () => {
      render(<Tabs tabs={mockTabs} />);

      expect(screen.getByRole('tab', { name: /overview/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /details/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /logs/i })).toBeInTheDocument();
    });

    it('renders badge count', () => {
      render(<Tabs tabs={mockTabs} />);

      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('hides badge when 0', () => {
      const tabsWithZeroBadge: Tab[] = [
        { id: 'test', label: 'Test', content: <div />, badge: 0 },
      ];
      render(<Tabs tabs={tabsWithZeroBadge} />);

      expect(screen.queryByText('0')).not.toBeInTheDocument();
    });

    it('renders first tab content by default', () => {
      render(<Tabs tabs={mockTabs} />);

      expect(screen.getByText('Overview content')).toBeInTheDocument();
    });

    it('renders specified defaultTab content', () => {
      render(<Tabs tabs={mockTabs} defaultTab="details" />);

      expect(screen.getByText('Details content')).toBeInTheDocument();
    });

    it('renders headerRight content', () => {
      render(
        <Tabs
          tabs={mockTabs}
          headerRight={<button data-testid="custom-action">Action</button>}
        />
      );

      expect(screen.getByTestId('custom-action')).toBeInTheDocument();
    });
  });

  describe('Tab Switching', () => {
    it('switches content on tab click', () => {
      render(<Tabs tabs={mockTabs} />);

      expect(screen.getByText('Overview content')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('tab', { name: /details/i }));

      expect(screen.getByText('Details content')).toBeInTheDocument();
      expect(screen.queryByText('Overview content')).not.toBeInTheDocument();
    });

    it('calls onTabChange callback', () => {
      const handleChange = vi.fn();
      render(<Tabs tabs={mockTabs} onTabChange={handleChange} />);

      fireEvent.click(screen.getByRole('tab', { name: /details/i }));

      expect(handleChange).toHaveBeenCalledWith('details');
    });
  });

  describe('Keyboard Navigation', () => {
    it('ArrowRight moves to next tab', () => {
      render(<Tabs tabs={mockTabs} />);

      const firstTab = screen.getByRole('tab', { name: /overview/i });
      firstTab.focus();

      fireEvent.keyDown(firstTab, { key: 'ArrowRight' });

      expect(screen.getByText('Details content')).toBeInTheDocument();
    });

    it('ArrowLeft moves to previous tab', () => {
      render(<Tabs tabs={mockTabs} defaultTab="details" />);

      const detailsTab = screen.getByRole('tab', { name: /details/i });
      detailsTab.focus();

      fireEvent.keyDown(detailsTab, { key: 'ArrowLeft' });

      expect(screen.getByText('Overview content')).toBeInTheDocument();
    });

    it('ArrowRight wraps to first tab from last', () => {
      render(<Tabs tabs={mockTabs} defaultTab="logs" />);

      const logsTab = screen.getByRole('tab', { name: /logs/i });
      logsTab.focus();

      fireEvent.keyDown(logsTab, { key: 'ArrowRight' });

      expect(screen.getByText('Overview content')).toBeInTheDocument();
    });

    it('ArrowLeft wraps to last tab from first', () => {
      render(<Tabs tabs={mockTabs} />);

      const firstTab = screen.getByRole('tab', { name: /overview/i });
      firstTab.focus();

      fireEvent.keyDown(firstTab, { key: 'ArrowLeft' });

      expect(screen.getByText('Logs content')).toBeInTheDocument();
    });

    it('Home moves to first tab', () => {
      render(<Tabs tabs={mockTabs} defaultTab="logs" />);

      const logsTab = screen.getByRole('tab', { name: /logs/i });
      logsTab.focus();

      fireEvent.keyDown(logsTab, { key: 'Home' });

      expect(screen.getByText('Overview content')).toBeInTheDocument();
    });

    it('End moves to last tab', () => {
      render(<Tabs tabs={mockTabs} />);

      const firstTab = screen.getByRole('tab', { name: /overview/i });
      firstTab.focus();

      fireEvent.keyDown(firstTab, { key: 'End' });

      expect(screen.getByText('Logs content')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has tablist role', () => {
      render(<Tabs tabs={mockTabs} />);

      expect(screen.getByRole('tablist')).toBeInTheDocument();
    });

    it('has tab role for each tab button', () => {
      render(<Tabs tabs={mockTabs} />);

      expect(screen.getAllByRole('tab')).toHaveLength(3);
    });

    it('has tabpanel role for content', () => {
      render(<Tabs tabs={mockTabs} />);

      expect(screen.getByRole('tabpanel')).toBeInTheDocument();
    });

    it('active tab has aria-selected=true', () => {
      render(<Tabs tabs={mockTabs} />);

      const activeTab = screen.getByRole('tab', { name: /overview/i });
      expect(activeTab).toHaveAttribute('aria-selected', 'true');

      const inactiveTab = screen.getByRole('tab', { name: /details/i });
      expect(inactiveTab).toHaveAttribute('aria-selected', 'false');
    });

    it('active tab has tabindex=0, others have tabindex=-1', () => {
      render(<Tabs tabs={mockTabs} />);

      const activeTab = screen.getByRole('tab', { name: /overview/i });
      expect(activeTab).toHaveAttribute('tabindex', '0');

      const inactiveTab = screen.getByRole('tab', { name: /details/i });
      expect(inactiveTab).toHaveAttribute('tabindex', '-1');
    });

    it('tab and panel are linked with aria-controls/aria-labelledby', () => {
      render(<Tabs tabs={mockTabs} />);

      const tab = screen.getByRole('tab', { name: /overview/i });
      const panel = screen.getByRole('tabpanel');

      expect(tab).toHaveAttribute('aria-controls', 'tabpanel-overview');
      expect(panel).toHaveAttribute('aria-labelledby', 'tab-overview');
    });
  });

  describe('URL Hash Persistence', () => {
    it('updates URL hash when hashKey provided', () => {
      render(<Tabs tabs={mockTabs} hashKey="tab" />);

      fireEvent.click(screen.getByRole('tab', { name: /details/i }));

      expect(window.location.hash).toBe('#tab=details');
    });

    it('removes hash param for default tab', () => {
      window.location.hash = '#tab=details';

      render(<Tabs tabs={mockTabs} hashKey="tab" />);

      // Switch back to default
      fireEvent.click(screen.getByRole('tab', { name: /overview/i }));

      // Hash should be cleared for default tab
      expect(window.location.hash).toBe('');
    });
  });
});
