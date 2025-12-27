import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate, useLocation } from 'react-router-dom';
import ClickableBadge from '../../components/ClickableBadge';
import { ListType, FilterType } from '../../config/entryTypes';
import { getFilterUrlKey, FilterCategory } from '../../hooks/useEntryFilters';

/**
 * Badge Filter Navigation Tests
 *
 * Tests that clicking ClickableBadge components navigates to the correct
 * filtered URL for all 19 entry types and their filter combinations.
 *
 * Following AAA pattern (Arrange-Act-Assert).
 * Total: 45+ parametric tests covering all listType + filterType combinations.
 */

// Mock react-router-dom's useNavigate and useLocation
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: vi.fn(),
    useLocation: vi.fn(),
  };
});

// Test wrapper with router
const RouterWrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

describe('Badge Filter Navigation', () => {
  const mockNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);
    // Default location mock - not on any list page
    vi.mocked(useLocation).mockReturnValue({
      pathname: '/',
      search: '',
      hash: '',
      state: null,
      key: 'default',
    });
  });

  // ============================================================================
  // COMPLETE FILTER NAVIGATION TEST MATRIX
  // ============================================================================
  // All 19 entry types with their filter types and expected URL keys

  interface FilterTestCase {
    listType: ListType;
    filterType: FilterCategory;
    value: string;
    expectedUrlKey: string;
  }

  const filterTestCases: FilterTestCase[] = [
    // ─────────────────────────────────────────────────────────────────────────
    // REQUESTS (6 filters)
    // ─────────────────────────────────────────────────────────────────────────
    { listType: 'requests', filterType: 'methods', value: 'GET', expectedUrlKey: 'methods' },
    { listType: 'requests', filterType: 'methods', value: 'POST', expectedUrlKey: 'methods' },
    { listType: 'requests', filterType: 'statuses', value: '200', expectedUrlKey: 'statuses' },
    { listType: 'requests', filterType: 'statuses', value: '404', expectedUrlKey: 'statuses' },
    { listType: 'requests', filterType: 'paths', value: '/api/users', expectedUrlKey: 'paths' },
    { listType: 'requests', filterType: 'controllers', value: 'UsersController#index', expectedUrlKey: 'controllers' },
    { listType: 'requests', filterType: 'hostnames', value: 'api.example.com', expectedUrlKey: 'hostnames' },
    { listType: 'requests', filterType: 'ips', value: '192.168.1.1', expectedUrlKey: 'ips' },

    // ─────────────────────────────────────────────────────────────────────────
    // QUERIES (2 filters)
    // ─────────────────────────────────────────────────────────────────────────
    { listType: 'queries', filterType: 'types', value: 'SELECT', expectedUrlKey: 'queryTypes' },
    { listType: 'queries', filterType: 'types', value: 'INSERT', expectedUrlKey: 'queryTypes' },
    { listType: 'queries', filterType: 'sources', value: 'typeorm', expectedUrlKey: 'sources' },
    { listType: 'queries', filterType: 'sources', value: 'prisma', expectedUrlKey: 'sources' },

    // ─────────────────────────────────────────────────────────────────────────
    // EXCEPTIONS (3 filters)
    // ─────────────────────────────────────────────────────────────────────────
    { listType: 'exceptions', filterType: 'names', value: 'ValidationError', expectedUrlKey: 'names' },
    { listType: 'exceptions', filterType: 'methods', value: 'POST', expectedUrlKey: 'methods' },
    { listType: 'exceptions', filterType: 'paths', value: '/api/auth', expectedUrlKey: 'paths' },

    // ─────────────────────────────────────────────────────────────────────────
    // LOGS (2 filters)
    // ─────────────────────────────────────────────────────────────────────────
    { listType: 'logs', filterType: 'levels', value: 'error', expectedUrlKey: 'levels' },
    { listType: 'logs', filterType: 'levels', value: 'warn', expectedUrlKey: 'levels' },
    { listType: 'logs', filterType: 'contexts', value: 'AuthService', expectedUrlKey: 'contexts' },

    // ─────────────────────────────────────────────────────────────────────────
    // EVENTS (1 filter)
    // ─────────────────────────────────────────────────────────────────────────
    { listType: 'events', filterType: 'names', value: 'user.created', expectedUrlKey: 'eventNames' },
    { listType: 'events', filterType: 'names', value: 'order.completed', expectedUrlKey: 'eventNames' },

    // ─────────────────────────────────────────────────────────────────────────
    // JOBS (3 filters)
    // ─────────────────────────────────────────────────────────────────────────
    { listType: 'jobs', filterType: 'statuses', value: 'completed', expectedUrlKey: 'jobStatuses' },
    { listType: 'jobs', filterType: 'statuses', value: 'failed', expectedUrlKey: 'jobStatuses' },
    { listType: 'jobs', filterType: 'queues', value: 'email', expectedUrlKey: 'queues' },
    { listType: 'jobs', filterType: 'names', value: 'SendEmailJob', expectedUrlKey: 'jobNames' },

    // ─────────────────────────────────────────────────────────────────────────
    // CACHE (1 filter)
    // ─────────────────────────────────────────────────────────────────────────
    { listType: 'cache', filterType: 'operations', value: 'get', expectedUrlKey: 'cacheOperations' },
    { listType: 'cache', filterType: 'operations', value: 'set', expectedUrlKey: 'cacheOperations' },

    // ─────────────────────────────────────────────────────────────────────────
    // MAIL (1 filter)
    // ─────────────────────────────────────────────────────────────────────────
    { listType: 'mail', filterType: 'statuses', value: 'sent', expectedUrlKey: 'mailStatuses' },
    { listType: 'mail', filterType: 'statuses', value: 'failed', expectedUrlKey: 'mailStatuses' },

    // ─────────────────────────────────────────────────────────────────────────
    // SCHEDULE (2 filters)
    // ─────────────────────────────────────────────────────────────────────────
    { listType: 'schedule', filterType: 'statuses', value: 'completed', expectedUrlKey: 'scheduleStatuses' },
    { listType: 'schedule', filterType: 'names', value: 'cleanup:sessions', expectedUrlKey: 'scheduleNames' },

    // ─────────────────────────────────────────────────────────────────────────
    // HTTP-CLIENT (3 filters)
    // ─────────────────────────────────────────────────────────────────────────
    { listType: 'http-client', filterType: 'methods', value: 'GET', expectedUrlKey: 'methods' },
    { listType: 'http-client', filterType: 'statuses', value: '200', expectedUrlKey: 'statuses' },
    { listType: 'http-client', filterType: 'hostnames', value: 'api.stripe.com', expectedUrlKey: 'hostnames' },

    // ─────────────────────────────────────────────────────────────────────────
    // REDIS (2 filters)
    // ─────────────────────────────────────────────────────────────────────────
    { listType: 'redis', filterType: 'commands', value: 'GET', expectedUrlKey: 'redisCommands' },
    { listType: 'redis', filterType: 'commands', value: 'SET', expectedUrlKey: 'redisCommands' },
    { listType: 'redis', filterType: 'statuses', value: 'success', expectedUrlKey: 'redisStatuses' },

    // ─────────────────────────────────────────────────────────────────────────
    // MODELS (3 filters)
    // ─────────────────────────────────────────────────────────────────────────
    { listType: 'models', filterType: 'actions', value: 'create', expectedUrlKey: 'modelActions' },
    { listType: 'models', filterType: 'entities', value: 'User', expectedUrlKey: 'entities' },
    { listType: 'models', filterType: 'sources', value: 'prisma', expectedUrlKey: 'modelSources' },

    // ─────────────────────────────────────────────────────────────────────────
    // NOTIFICATIONS (2 filters)
    // ─────────────────────────────────────────────────────────────────────────
    { listType: 'notifications', filterType: 'types', value: 'email', expectedUrlKey: 'notificationTypes' },
    { listType: 'notifications', filterType: 'statuses', value: 'sent', expectedUrlKey: 'notificationStatuses' },

    // ─────────────────────────────────────────────────────────────────────────
    // VIEWS (2 filters)
    // ─────────────────────────────────────────────────────────────────────────
    { listType: 'views', filterType: 'formats', value: 'html', expectedUrlKey: 'viewFormats' },
    { listType: 'views', filterType: 'statuses', value: 'rendered', expectedUrlKey: 'viewStatuses' },

    // ─────────────────────────────────────────────────────────────────────────
    // COMMANDS (2 filters)
    // ─────────────────────────────────────────────────────────────────────────
    { listType: 'commands', filterType: 'statuses', value: 'completed', expectedUrlKey: 'commandStatuses' },
    { listType: 'commands', filterType: 'names', value: 'migrate:run', expectedUrlKey: 'commandNames' },

    // ─────────────────────────────────────────────────────────────────────────
    // GATES (2 filters)
    // ─────────────────────────────────────────────────────────────────────────
    { listType: 'gates', filterType: 'names', value: 'admin-panel', expectedUrlKey: 'gateNames' },
    { listType: 'gates', filterType: 'results', value: 'allowed', expectedUrlKey: 'gateResults' },
    { listType: 'gates', filterType: 'results', value: 'denied', expectedUrlKey: 'gateResults' },

    // ─────────────────────────────────────────────────────────────────────────
    // BATCHES (2 filters)
    // ─────────────────────────────────────────────────────────────────────────
    { listType: 'batches', filterType: 'operations', value: 'import', expectedUrlKey: 'batchOperations' },
    { listType: 'batches', filterType: 'statuses', value: 'completed', expectedUrlKey: 'batchStatuses' },

    // ─────────────────────────────────────────────────────────────────────────
    // DUMPS (3 filters)
    // ─────────────────────────────────────────────────────────────────────────
    { listType: 'dumps', filterType: 'operations', value: 'export', expectedUrlKey: 'dumpOperations' },
    { listType: 'dumps', filterType: 'formats', value: 'json', expectedUrlKey: 'dumpFormats' },
    { listType: 'dumps', filterType: 'statuses', value: 'completed', expectedUrlKey: 'dumpStatuses' },

    // ─────────────────────────────────────────────────────────────────────────
    // GRAPHQL (3 filters)
    // ─────────────────────────────────────────────────────────────────────────
    { listType: 'graphql', filterType: 'operationTypes', value: 'query', expectedUrlKey: 'operationTypes' },
    { listType: 'graphql', filterType: 'operationTypes', value: 'mutation', expectedUrlKey: 'operationTypes' },
    { listType: 'graphql', filterType: 'operationNames', value: 'GetUsers', expectedUrlKey: 'operationNames' },
    { listType: 'graphql', filterType: 'statuses', value: '200', expectedUrlKey: 'statuses' },
  ];

  describe('ClickableBadge Navigation', () => {
    describe.each(filterTestCases)(
      '$listType - $filterType with value "$value"',
      ({ listType, filterType, value, expectedUrlKey }) => {
        it(`navigates to /${listType}?${expectedUrlKey}=${encodeURIComponent(value)}`, async () => {
          // Arrange
          const user = userEvent.setup();
          const expectedUrl = `/${listType}?${expectedUrlKey}=${encodeURIComponent(value)}`;

          // Act
          render(
            <ClickableBadge
              listType={listType}
              filterType={filterType as FilterType}
              filterValue={value}
            >
              {value}
            </ClickableBadge>,
            { wrapper: RouterWrapper }
          );
          await user.click(screen.getByRole('button'));

          // Assert
          expect(mockNavigate).toHaveBeenCalledTimes(1);
          expect(mockNavigate).toHaveBeenCalledWith(expectedUrl);
        });
      }
    );
  });

  // ============================================================================
  // URL KEY MAPPING VERIFICATION
  // ============================================================================

  describe('getFilterUrlKey Mapping', () => {
    const urlKeyMappings: Array<{
      listType: ListType;
      filterType: FilterCategory;
      expectedUrlKey: string;
    }> = [
      // Simple mappings (category name = URL key)
      { listType: 'requests', filterType: 'methods', expectedUrlKey: 'methods' },
      { listType: 'requests', filterType: 'statuses', expectedUrlKey: 'statuses' },
      { listType: 'requests', filterType: 'paths', expectedUrlKey: 'paths' },
      { listType: 'exceptions', filterType: 'names', expectedUrlKey: 'names' },
      { listType: 'logs', filterType: 'levels', expectedUrlKey: 'levels' },
      { listType: 'events', filterType: 'names', expectedUrlKey: 'eventNames' },

      // Prefixed mappings (entry type prefix + category)
      { listType: 'queries', filterType: 'types', expectedUrlKey: 'queryTypes' },
      { listType: 'jobs', filterType: 'statuses', expectedUrlKey: 'jobStatuses' },
      { listType: 'cache', filterType: 'operations', expectedUrlKey: 'cacheOperations' },
      { listType: 'mail', filterType: 'statuses', expectedUrlKey: 'mailStatuses' },
      { listType: 'schedule', filterType: 'statuses', expectedUrlKey: 'scheduleStatuses' },
      { listType: 'redis', filterType: 'commands', expectedUrlKey: 'redisCommands' },
      { listType: 'redis', filterType: 'statuses', expectedUrlKey: 'redisStatuses' },
      { listType: 'models', filterType: 'actions', expectedUrlKey: 'modelActions' },
      { listType: 'models', filterType: 'sources', expectedUrlKey: 'modelSources' },
      { listType: 'notifications', filterType: 'types', expectedUrlKey: 'notificationTypes' },
      { listType: 'notifications', filterType: 'statuses', expectedUrlKey: 'notificationStatuses' },
      { listType: 'views', filterType: 'formats', expectedUrlKey: 'viewFormats' },
      { listType: 'views', filterType: 'statuses', expectedUrlKey: 'viewStatuses' },
      { listType: 'commands', filterType: 'statuses', expectedUrlKey: 'commandStatuses' },
      { listType: 'commands', filterType: 'names', expectedUrlKey: 'commandNames' },
      { listType: 'gates', filterType: 'names', expectedUrlKey: 'gateNames' },
      { listType: 'gates', filterType: 'results', expectedUrlKey: 'gateResults' },
      { listType: 'batches', filterType: 'operations', expectedUrlKey: 'batchOperations' },
      { listType: 'batches', filterType: 'statuses', expectedUrlKey: 'batchStatuses' },
      { listType: 'dumps', filterType: 'operations', expectedUrlKey: 'dumpOperations' },
      { listType: 'dumps', filterType: 'formats', expectedUrlKey: 'dumpFormats' },
      { listType: 'dumps', filterType: 'statuses', expectedUrlKey: 'dumpStatuses' },
      { listType: 'graphql', filterType: 'operationTypes', expectedUrlKey: 'operationTypes' },
      { listType: 'graphql', filterType: 'statuses', expectedUrlKey: 'statuses' },
    ];

    describe.each(urlKeyMappings)(
      '$listType + $filterType',
      ({ listType, filterType, expectedUrlKey }) => {
        it(`maps to "${expectedUrlKey}"`, () => {
          // Arrange & Act
          const result = getFilterUrlKey(listType, filterType);

          // Assert
          expect(result).toBe(expectedUrlKey);
        });
      }
    );
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe('Edge Cases', () => {
    it('handles special characters in filter values', async () => {
      // Arrange
      const user = userEvent.setup();
      const specialValue = '/api/users?name=test&id=1';

      // Act
      render(
        <ClickableBadge listType="requests" filterType="paths" filterValue={specialValue}>
          {specialValue}
        </ClickableBadge>,
        { wrapper: RouterWrapper }
      );
      await user.click(screen.getByRole('button'));

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith(
        `/requests?paths=${encodeURIComponent(specialValue)}`
      );
    });

    it('handles numeric filter values', async () => {
      // Arrange
      const user = userEvent.setup();

      // Act
      render(
        <ClickableBadge listType="requests" filterType="statuses" filterValue="404">
          404
        </ClickableBadge>,
        { wrapper: RouterWrapper }
      );
      await user.click(screen.getByRole('button'));

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/requests?statuses=404');
    });

    it('uses children as filterValue when filterValue prop is not provided', async () => {
      // Arrange
      const user = userEvent.setup();

      // Act
      render(
        <ClickableBadge listType="requests" filterType="methods">
          GET
        </ClickableBadge>,
        { wrapper: RouterWrapper }
      );
      await user.click(screen.getByRole('button'));

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/requests?methods=GET');
    });

    it('does not navigate when clickable=false', async () => {
      // Arrange
      const user = userEvent.setup();

      // Act
      render(
        <ClickableBadge listType="requests" filterType="methods" clickable={false}>
          GET
        </ClickableBadge>,
        { wrapper: RouterWrapper }
      );

      // The badge should not be a button when not clickable
      const badge = screen.queryByRole('button');
      expect(badge).toBeNull();

      // Assert - navigate should not be called
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('calls custom onClick instead of navigating when onClick prop is provided', async () => {
      // Arrange
      const user = userEvent.setup();
      const customOnClick = vi.fn();

      // Act
      render(
        <ClickableBadge
          listType="requests"
          filterType="methods"
          onClick={customOnClick}
        >
          GET
        </ClickableBadge>,
        { wrapper: RouterWrapper }
      );
      await user.click(screen.getByRole('button'));

      // Assert
      expect(customOnClick).toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // CONSISTENCY CHECKS
  // ============================================================================

  describe('Consistency Checks', () => {
    it('all 19 entry types have at least one filter test case', () => {
      // Arrange
      const allListTypes: ListType[] = [
        'requests', 'queries', 'exceptions', 'logs', 'events',
        'jobs', 'cache', 'mail', 'schedule', 'http-client',
        'redis', 'models', 'notifications', 'views', 'commands',
        'gates', 'batches', 'dumps', 'graphql',
      ];

      // Act
      const testedListTypes = [...new Set(filterTestCases.map(tc => tc.listType))];

      // Assert
      allListTypes.forEach(listType => {
        expect(testedListTypes).toContain(listType);
      });
    });

    it('total test cases cover expected filter count', () => {
      // Assert - we should have at least 45 test cases
      expect(filterTestCases.length).toBeGreaterThanOrEqual(45);
    });
  });

  // ============================================================================
  // FILTER MERGING TESTS
  // ============================================================================
  // When on the same list page, clicking a badge should ADD to existing filters
  // instead of replacing them

  describe('Filter Merging', () => {
    it('merges filters when on the same list page (logs: level + context)', async () => {
      // Arrange - already on /logs with levels=error filter
      vi.mocked(useLocation).mockReturnValue({
        pathname: '/logs',
        search: '?levels=error',
        hash: '',
        state: null,
        key: 'test',
      });
      const user = userEvent.setup();

      // Act - click context badge
      render(
        <ClickableBadge listType="logs" filterType="contexts" filterValue="AuthService">
          AuthService
        </ClickableBadge>,
        { wrapper: RouterWrapper }
      );
      await user.click(screen.getByRole('button'));

      // Assert - both filters should be in URL
      expect(mockNavigate).toHaveBeenCalledWith('/logs?levels=error&contexts=AuthService');
    });

    it('merges filters when on the same list page (cache: operation + tags)', async () => {
      // Arrange - already on /cache with cacheOperations=get filter
      vi.mocked(useLocation).mockReturnValue({
        pathname: '/cache',
        search: '?cacheOperations=get',
        hash: '',
        state: null,
        key: 'test',
      });
      const user = userEvent.setup();

      // Act - click HIT tag badge
      render(
        <ClickableBadge listType="cache" filterType="tags" filterValue="hit">
          HIT
        </ClickableBadge>,
        { wrapper: RouterWrapper }
      );
      await user.click(screen.getByRole('button'));

      // Assert - both filters should be in URL
      expect(mockNavigate).toHaveBeenCalledWith('/cache?cacheOperations=get&tags=hit');
    });

    it('merges filters when on the same list page (exceptions: name + method + path)', async () => {
      // Arrange - already on /exceptions with names=TypeError filter
      vi.mocked(useLocation).mockReturnValue({
        pathname: '/exceptions',
        search: '?names=TypeError',
        hash: '',
        state: null,
        key: 'test',
      });
      const user = userEvent.setup();

      // Act - click method badge
      render(
        <ClickableBadge listType="exceptions" filterType="methods" filterValue="POST">
          POST
        </ClickableBadge>,
        { wrapper: RouterWrapper }
      );
      await user.click(screen.getByRole('button'));

      // Assert - both filters should be in URL
      expect(mockNavigate).toHaveBeenCalledWith('/exceptions?names=TypeError&methods=POST');
    });

    it('adds to existing filter values (same filter type)', async () => {
      // Arrange - already on /logs with levels=error filter
      vi.mocked(useLocation).mockReturnValue({
        pathname: '/logs',
        search: '?levels=error',
        hash: '',
        state: null,
        key: 'test',
      });
      const user = userEvent.setup();

      // Act - click another level badge
      render(
        <ClickableBadge listType="logs" filterType="levels" filterValue="warn">
          warn
        </ClickableBadge>,
        { wrapper: RouterWrapper }
      );
      await user.click(screen.getByRole('button'));

      // Assert - both values should be comma-separated
      expect(mockNavigate).toHaveBeenCalledWith('/logs?levels=error%2Cwarn');
    });

    it('does not duplicate existing filter value', async () => {
      // Arrange - already on /logs with levels=error filter
      vi.mocked(useLocation).mockReturnValue({
        pathname: '/logs',
        search: '?levels=error',
        hash: '',
        state: null,
        key: 'test',
      });
      const user = userEvent.setup();

      // Act - click same level badge again
      render(
        <ClickableBadge listType="logs" filterType="levels" filterValue="error">
          error
        </ClickableBadge>,
        { wrapper: RouterWrapper }
      );
      await user.click(screen.getByRole('button'));

      // Assert - should not duplicate
      expect(mockNavigate).toHaveBeenCalledWith('/logs?levels=error');
    });

    it('starts fresh when navigating from different page', async () => {
      // Arrange - on /requests page, clicking a logs badge
      vi.mocked(useLocation).mockReturnValue({
        pathname: '/requests',
        search: '?methods=GET',
        hash: '',
        state: null,
        key: 'test',
      });
      const user = userEvent.setup();

      // Act - click logs level badge (different list type)
      render(
        <ClickableBadge listType="logs" filterType="levels" filterValue="error">
          error
        </ClickableBadge>,
        { wrapper: RouterWrapper }
      );
      await user.click(screen.getByRole('button'));

      // Assert - should NOT include requests filters
      expect(mockNavigate).toHaveBeenCalledWith('/logs?levels=error');
    });

    it('merges filters when on detail page of same type', async () => {
      // Arrange - on /logs/123 detail page
      vi.mocked(useLocation).mockReturnValue({
        pathname: '/logs/123',
        search: '',
        hash: '',
        state: null,
        key: 'test',
      });
      const user = userEvent.setup();

      // Act - click context badge
      render(
        <ClickableBadge listType="logs" filterType="contexts" filterValue="AuthService">
          AuthService
        </ClickableBadge>,
        { wrapper: RouterWrapper }
      );
      await user.click(screen.getByRole('button'));

      // Assert - should navigate to list with filter
      expect(mockNavigate).toHaveBeenCalledWith('/logs?contexts=AuthService');
    });

    it('preserves multiple existing filters when adding new one', async () => {
      // Arrange - already on /exceptions with two filters
      vi.mocked(useLocation).mockReturnValue({
        pathname: '/exceptions',
        search: '?names=TypeError&methods=POST',
        hash: '',
        state: null,
        key: 'test',
      });
      const user = userEvent.setup();

      // Act - click path badge
      render(
        <ClickableBadge listType="exceptions" filterType="paths" filterValue="/api/users">
          /api/users
        </ClickableBadge>,
        { wrapper: RouterWrapper }
      );
      await user.click(screen.getByRole('button'));

      // Assert - all three filters should be in URL
      expect(mockNavigate).toHaveBeenCalledWith(
        '/exceptions?names=TypeError&methods=POST&paths=%2Fapi%2Fusers'
      );
    });
  });
});
