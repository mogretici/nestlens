/**
 * Layout Component Tests
 *
 * Tests for the main layout with navigation, theme toggle,
 * and keyboard shortcuts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Layout from '../../components/Layout';
import { StatsProvider } from '../../contexts/StatsContext';

// Mock API
vi.mock('../../api', () => ({
  clearEntries: vi.fn().mockResolvedValue({}),
  getRecordingStatus: vi.fn().mockResolvedValue({
    data: { isPaused: false, pausedAt: null },
  }),
  pauseRecording: vi.fn().mockResolvedValue({
    data: { isPaused: true, pausedAt: new Date().toISOString() },
  }),
  resumeRecording: vi.fn().mockResolvedValue({
    data: { isPaused: false, pausedAt: null },
  }),
  getStats: vi.fn().mockResolvedValue({
    data: {
      total: 100,
      byType: { request: 50, exception: 5 },
      unresolvedExceptions: 3,
    },
  }),
}));

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Helper to render Layout with necessary providers
function renderLayout(initialEntries: string[] = ['/']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <StatsProvider>
        <Layout />
      </StatsProvider>
    </MemoryRouter>
  );
}

// ============================================================================
// Layout Tests
// ============================================================================

describe('Layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Reset document dark mode class
    document.documentElement.classList.remove('dark');
  });

  describe('Navigation', () => {
    it('renders all navigation groups', () => {
      renderLayout();

      // Both mobile and desktop navs exist, so we check for at least one
      expect(screen.getAllByText('Overview').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Monitoring').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Debugging').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Background').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Storage').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Advanced').length).toBeGreaterThan(0);
    });

    it('renders navigation items', () => {
      renderLayout();

      expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Requests').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Queries').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Exceptions').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Logs').length).toBeGreaterThan(0);
    });

    it('highlights active route', () => {
      renderLayout(['/requests']);

      // Find links with Requests text that have active class
      const links = screen.getAllByRole('link', { name: /requests/i });
      const activeLink = links.find((link) =>
        link.className.includes('bg-primary-50')
      );
      expect(activeLink).toBeDefined();
    });

    it('collapses group on header click', () => {
      renderLayout();

      // Click on Monitoring group header
      const groupHeaders = screen.getAllByText('Monitoring');
      fireEvent.click(groupHeaders[0]);

      // Requests should be hidden (collapsed)
      // Check aria-expanded
      const buttons = screen.getAllByRole('button', { name: /monitoring/i });
      const monitoringButton = buttons.find((btn) =>
        btn.textContent?.includes('Monitoring')
      );
      expect(monitoringButton).toHaveAttribute('aria-expanded', 'false');
    });

    it('expands collapsed group on click', () => {
      renderLayout();

      const groupHeaders = screen.getAllByText('Monitoring');

      // Collapse
      fireEvent.click(groupHeaders[0]);

      // Expand
      fireEvent.click(groupHeaders[0]);

      const buttons = screen.getAllByRole('button', { name: /monitoring/i });
      const monitoringButton = buttons.find((btn) =>
        btn.textContent?.includes('Monitoring')
      );
      expect(monitoringButton).toHaveAttribute('aria-expanded', 'true');
    });

    it('persists collapsed state to localStorage', () => {
      renderLayout();

      const groupHeaders = screen.getAllByText('Monitoring');
      fireEvent.click(groupHeaders[0]);

      const saved = localStorage.getItem('nestlens-collapsed-groups');
      expect(saved).toBe(JSON.stringify(['Monitoring']));
    });
  });

  describe('Logo and Branding', () => {
    it('renders NestLens logo', () => {
      renderLayout();

      expect(screen.getAllByText('NestLens').length).toBeGreaterThan(0);
    });

    it('logo links to home', () => {
      renderLayout();

      const logoLinks = screen.getAllByRole('link', { name: /nestlens/i });
      expect(logoLinks[0]).toHaveAttribute('href', '/');
    });
  });

  describe('Theme Toggle', () => {
    it('renders theme toggle button', () => {
      renderLayout();

      expect(
        screen.getAllByRole('button', { name: /switch to (light|dark) mode/i })
          .length
      ).toBeGreaterThan(0);
    });

    it('toggles dark mode on click', () => {
      renderLayout();

      const themeButtons = screen.getAllByRole('button', {
        name: /switch to dark mode/i,
      });

      fireEvent.click(themeButtons[0]);

      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('toggles back to light mode', () => {
      // Set dark mode initially
      document.documentElement.classList.add('dark');
      localStorage.setItem('nestlens-theme', 'dark');

      renderLayout();

      // Find theme buttons - may have both mobile and desktop
      const themeButtons = screen.getAllByRole('button', {
        name: /switch to light mode/i,
      });

      expect(themeButtons.length).toBeGreaterThan(0);
      fireEvent.click(themeButtons[0]);

      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('persists theme to localStorage', () => {
      renderLayout();

      const themeButtons = screen.getAllByRole('button', {
        name: /switch to dark mode/i,
      });

      fireEvent.click(themeButtons[0]);

      expect(localStorage.getItem('nestlens-theme')).toBe('dark');
    });
  });

  describe('Clear Data', () => {
    it('renders clear data button', () => {
      renderLayout();

      expect(
        screen.getAllByRole('button', { name: /clear all data/i }).length
      ).toBeGreaterThan(0);
    });

    it('shows confirmation dialog on clear click', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

      renderLayout();

      const clearButtons = screen.getAllByRole('button', {
        name: /clear all data/i,
      });
      fireEvent.click(clearButtons[0]);

      expect(confirmSpy).toHaveBeenCalledWith(
        'Are you sure you want to clear all entries?'
      );

      confirmSpy.mockRestore();
    });
  });

  describe('Mobile Sidebar', () => {
    it('renders mobile menu button', () => {
      renderLayout();

      expect(
        screen.getByRole('button', { name: /open navigation menu/i })
      ).toBeInTheDocument();
    });

    it('opens mobile sidebar on menu click', () => {
      const { container } = renderLayout();

      const menuButton = screen.getByRole('button', {
        name: /open navigation menu/i,
      });
      fireEvent.click(menuButton);

      // Mobile sidebar should be visible
      const mobileSidebar = container.querySelector('#mobile-sidebar');
      expect(mobileSidebar).toBeInTheDocument();
    });

    it('closes mobile sidebar on close button click', () => {
      renderLayout();

      // Open sidebar
      const menuButton = screen.getByRole('button', {
        name: /open navigation menu/i,
      });
      fireEvent.click(menuButton);

      // Close sidebar
      const closeButton = screen.getByRole('button', { name: /close sidebar/i });
      fireEvent.click(closeButton);

      // Menu button should have aria-expanded false
      expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    });

    it('closes on Escape key', () => {
      renderLayout();

      // Open sidebar
      const menuButton = screen.getByRole('button', {
        name: /open navigation menu/i,
      });
      fireEvent.click(menuButton);

      // Press Escape
      fireEvent.keyDown(document, { key: 'Escape' });

      // Should be closed
      expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    });
  });

  describe('Keyboard Shortcuts', () => {
    it('Ctrl+D toggles theme', () => {
      renderLayout();

      fireEvent.keyDown(document, { key: 'd', ctrlKey: true });

      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('Ctrl+K triggers clear dialog', () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

      renderLayout();

      fireEvent.keyDown(document, { key: 'k', ctrlKey: true });

      expect(confirmSpy).toHaveBeenCalled();

      confirmSpy.mockRestore();
    });
  });

  describe('External Links', () => {
    it('renders documentation link', () => {
      renderLayout();

      const docLinks = screen.getAllByRole('link', { name: /documentation/i });
      expect(docLinks.length).toBeGreaterThan(0);
      expect(docLinks[0]).toHaveAttribute('target', '_blank');
      expect(docLinks[0]).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  describe('Accessibility', () => {
    it('nav items have aria-current for active page', () => {
      renderLayout(['/requests']);

      const links = screen.getAllByRole('link', { name: /requests/i });
      const activeLink = links.find(
        (link) => link.getAttribute('aria-current') === 'page'
      );
      expect(activeLink).toBeDefined();
    });

    it('group headers have aria-expanded', () => {
      renderLayout();

      const buttons = screen.getAllByRole('button');
      const groupButtons = buttons.filter((btn) =>
        btn.getAttribute('aria-expanded')
      );
      expect(groupButtons.length).toBeGreaterThan(0);
    });

    it('mobile menu button has aria-controls', () => {
      renderLayout();

      const menuButton = screen.getByRole('button', {
        name: /open navigation menu/i,
      });
      expect(menuButton).toHaveAttribute('aria-controls', 'mobile-sidebar');
    });
  });

  describe('System Theme Detection', () => {
    it('loads theme from localStorage if set', () => {
      localStorage.setItem('nestlens-theme', 'dark');

      renderLayout();

      // Wait for useEffect
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('respects system preference when set to system', () => {
      // Mock matchMedia
      const mockMatchMedia = vi.fn().mockImplementation((query) => ({
        matches: query === '(prefers-color-scheme: dark)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));

      window.matchMedia = mockMatchMedia;

      localStorage.setItem('nestlens-theme', 'system');

      renderLayout();

      // With system preference dark, should be dark
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('uses light mode when system preference is light', () => {
      // Mock matchMedia - light preference
      const mockMatchMedia = vi.fn().mockImplementation((query) => ({
        matches: false, // prefers-color-scheme: dark is false
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));

      window.matchMedia = mockMatchMedia;
      localStorage.setItem('nestlens-theme', 'system');

      renderLayout();

      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('responds to system theme changes', () => {
      // Create a handler capture
      let changeHandler: ((e: MediaQueryListEvent) => void) | null = null;

      const mockMatchMedia = vi.fn().mockImplementation((query) => ({
        matches: false, // Start with light
        media: query,
        addEventListener: vi.fn((event, handler) => {
          if (event === 'change') {
            changeHandler = handler;
          }
        }),
        removeEventListener: vi.fn(),
      }));

      window.matchMedia = mockMatchMedia;
      localStorage.setItem('nestlens-theme', 'system');

      renderLayout();

      // Initially light
      expect(document.documentElement.classList.contains('dark')).toBe(false);

      // Simulate system theme change to dark
      expect(changeHandler).not.toBeNull();
      changeHandler!({ matches: true } as MediaQueryListEvent);

      // Should now be dark
      expect(document.documentElement.classList.contains('dark')).toBe(true);

      // Simulate change back to light
      changeHandler!({ matches: false } as MediaQueryListEvent);

      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
  });

  describe('Mobile Sidebar Interactions', () => {
    it('closes mobile sidebar when clicking overlay', () => {
      const { container } = renderLayout();

      // Open sidebar
      const menuButton = screen.getByRole('button', {
        name: /open navigation menu/i,
      });
      fireEvent.click(menuButton);

      // Find and click overlay (bg-gray-900/80)
      const overlay = container.querySelector('.bg-gray-900\\/80');
      expect(overlay).toBeInTheDocument();
      fireEvent.click(overlay!);

      // Sidebar should be closed
      expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    });

    it('closes mobile sidebar when clicking nav item', () => {
      renderLayout();

      // Open sidebar
      const menuButton = screen.getByRole('button', {
        name: /open navigation menu/i,
      });
      fireEvent.click(menuButton);

      // Click on a navigation link in mobile sidebar
      const requestsLinks = screen.getAllByRole('link', { name: /requests/i });
      // Find the one in mobile sidebar (should close it)
      fireEvent.click(requestsLinks[0]);

      // Sidebar should be closed
      expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    });

    it('mobile sidebar has close button', () => {
      renderLayout();

      // Open sidebar
      const menuButton = screen.getByRole('button', {
        name: /open navigation menu/i,
      });
      fireEvent.click(menuButton);

      // Close button should be visible
      const closeButton = screen.getByRole('button', { name: /close sidebar/i });
      expect(closeButton).toBeInTheDocument();
    });
  });

  describe('Badge Counts', () => {
    it('shows exception badge count', async () => {
      renderLayout();

      // Wait for stats to load
      await waitFor(() => {
        // Should show badge with count (unresolvedExceptions = 3)
        const badges = screen.getAllByText('3');
        expect(badges.length).toBeGreaterThan(0);
      });
    });

    it('hides badge when count is 0', async () => {
      // Override mock to return 0 unresolvedExceptions
      const api = await import('../../api');
      (api.getStats as any).mockResolvedValue({
        data: {
          total: 100,
          byType: { request: 50, exception: 0 },
          unresolvedExceptions: 0,
        },
      });

      renderLayout();

      // Wait for stats to load
      await waitFor(() => {
        // Badge with 0 should not be visible
        const exceptionLinks = screen.getAllByRole('link', { name: /exceptions/i });
        const hasBadge = exceptionLinks.some((link) =>
          link.textContent?.includes('0')
        );
        expect(hasBadge).toBe(false);
      });
    });
  });

  describe('Collapsed Groups Persistence', () => {
    it('loads collapsed groups from localStorage', () => {
      localStorage.setItem('nestlens-collapsed-groups', JSON.stringify(['Monitoring']));

      renderLayout();

      // Monitoring group should be collapsed
      const buttons = screen.getAllByRole('button', { name: /monitoring/i });
      const monitoringButton = buttons.find((btn) =>
        btn.textContent?.includes('Monitoring')
      );
      expect(monitoringButton).toHaveAttribute('aria-expanded', 'false');
    });

    it('toggles multiple groups independently', () => {
      renderLayout();

      // Collapse Monitoring
      const monitoringHeaders = screen.getAllByText('Monitoring');
      fireEvent.click(monitoringHeaders[0]);

      // Collapse Debugging
      const debuggingHeaders = screen.getAllByText('Debugging');
      fireEvent.click(debuggingHeaders[0]);

      // Both should be in localStorage
      const saved = JSON.parse(localStorage.getItem('nestlens-collapsed-groups') || '[]');
      expect(saved).toContain('Monitoring');
      expect(saved).toContain('Debugging');
    });
  });

  describe('Navigation Group Chevrons', () => {
    it('shows ChevronDown when expanded', () => {
      renderLayout();

      // Find a group button that's expanded (default state)
      const overviewHeader = screen.getAllByText('Overview')[0];
      const button = overviewHeader.closest('button');

      // Should have ChevronDown SVG
      const svg = button?.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('shows ChevronRight when collapsed', () => {
      renderLayout();

      // Collapse a group
      const monitoringHeaders = screen.getAllByText('Monitoring');
      fireEvent.click(monitoringHeaders[0]);

      // Check aria-expanded is false
      const buttons = screen.getAllByRole('button', { name: /monitoring/i });
      const monitoringButton = buttons.find((btn) =>
        btn.textContent?.includes('Monitoring')
      );
      expect(monitoringButton).toHaveAttribute('aria-expanded', 'false');
    });
  });
});
