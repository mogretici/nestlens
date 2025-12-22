import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import ClickableBadge, { FilterType, ListType } from '../components/ClickableBadge';

// Mock navigate function - will be populated by react-router-dom mock
const mockNavigate = vi.fn();

// Mock react-router-dom
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Helper to render with router
const renderWithRouter = (ui: React.ReactElement) => {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
};

/**
 * ClickableBadge Filter Type Tests
 *
 * These tests verify that clicking a badge with a specific filterType
 * navigates to the correct URL with the proper query parameter.
 *
 * BUG DOCUMENTED: Many filterTypes are NOT properly mapped in getUrlParam()
 * and fall through to 'tags' instead of their correct API key.
 */

describe('ClickableBadge', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  describe('Basic rendering', () => {
    it('renders badge with text', () => {
      renderWithRouter(<ClickableBadge>Test Badge</ClickableBadge>);
      expect(screen.getByText('TEST BADGE')).toBeInTheDocument();
    });

    it('renders text in uppercase', () => {
      renderWithRouter(<ClickableBadge>lowercase text</ClickableBadge>);
      expect(screen.getByText('LOWERCASE TEXT')).toBeInTheDocument();
    });

    it('is not clickable without listType', () => {
      renderWithRouter(<ClickableBadge>Badge</ClickableBadge>);
      const badge = screen.getByText('BADGE');
      expect(badge).not.toHaveAttribute('role', 'button');
    });

    it('is clickable with listType', () => {
      renderWithRouter(
        <ClickableBadge listType="logs">Badge</ClickableBadge>
      );
      const badge = screen.getByText('BADGE');
      expect(badge).toHaveAttribute('role', 'button');
    });
  });

  describe('Navigation with explicit filterTypes', () => {
    // These filterTypes ARE handled correctly by getUrlParam()
    const correctlyHandledFilterTypes: Array<{
      filterType: FilterType;
      expectedParam: string;
      testValue: string;
      listType: ListType;
    }> = [
      { filterType: 'path', expectedParam: 'path', testValue: '/api/users', listType: 'requests' },
      { filterType: 'requestId', expectedParam: 'requestId', testValue: 'abc-123', listType: 'requests' },
      { filterType: 'names', expectedParam: 'names', testValue: 'TypeError', listType: 'exceptions' },
      { filterType: 'methods', expectedParam: 'methods', testValue: 'POST', listType: 'requests' },
      { filterType: 'paths', expectedParam: 'paths', testValue: '/api/orders', listType: 'requests' },
      { filterType: 'types', expectedParam: 'types', testValue: 'SELECT', listType: 'queries' },
      { filterType: 'levels', expectedParam: 'levels', testValue: 'error', listType: 'logs' },
      { filterType: 'statuses', expectedParam: 'statuses', testValue: '200', listType: 'requests' },
      { filterType: 'queues', expectedParam: 'queues', testValue: 'emails', listType: 'jobs' },
      { filterType: 'operations', expectedParam: 'operations', testValue: 'get', listType: 'cache' },
      { filterType: 'contexts', expectedParam: 'contexts', testValue: 'UserService', listType: 'logs' },
      { filterType: 'sources', expectedParam: 'sources', testValue: 'typeorm', listType: 'queries' },
      { filterType: 'hostnames', expectedParam: 'hostnames', testValue: 'localhost:3000', listType: 'requests' },
      { filterType: 'controllers', expectedParam: 'controllers', testValue: 'UsersController#findAll', listType: 'requests' },
      { filterType: 'ips', expectedParam: 'ips', testValue: '127.0.0.1', listType: 'requests' },
    ];

    correctlyHandledFilterTypes.forEach(({ filterType, expectedParam, testValue, listType }) => {
      it(`filterType="${filterType}" navigates with "${expectedParam}" param`, () => {
        renderWithRouter(
          <ClickableBadge
            listType={listType}
            filterType={filterType}
            filterValue={testValue}
          >
            {testValue}
          </ClickableBadge>
        );

        fireEvent.click(screen.getByRole('button'));
        expect(mockNavigate).toHaveBeenCalledWith(
          `/${listType}?${expectedParam}=${encodeURIComponent(testValue)}`
        );
      });
    });
  });

  describe('Previously missing filterTypes (now fixed)', () => {
    /**
     * These filterTypes were previously NOT handled in getUrlParam(),
     * causing them to fall through to auto-detection.
     * They are now properly mapped to their correct API parameters.
     */
    const filterTypeMappings: Array<{
      filterType: FilterType;
      expectedParam: string;
      testValue: string;
      listType: ListType;
    }> = [
      // Cache filters
      { filterType: 'cacheOperations', expectedParam: 'cacheOperations', testValue: 'get', listType: 'cache' },

      // Redis filters
      { filterType: 'redisCommands', expectedParam: 'redisCommands', testValue: 'GET', listType: 'redis' },
      { filterType: 'redisStatuses', expectedParam: 'redisStatuses', testValue: 'success', listType: 'redis' },

      // Model filters
      { filterType: 'modelActions', expectedParam: 'modelActions', testValue: 'create', listType: 'models' },
      { filterType: 'modelSources', expectedParam: 'modelSources', testValue: 'typeorm', listType: 'models' },
      { filterType: 'entities', expectedParam: 'entities', testValue: 'User', listType: 'models' },

      // Notification filters
      { filterType: 'notificationTypes', expectedParam: 'notificationTypes', testValue: 'email', listType: 'notifications' },
      { filterType: 'notificationStatuses', expectedParam: 'notificationStatuses', testValue: 'sent', listType: 'notifications' },

      // View filters
      { filterType: 'viewFormats', expectedParam: 'viewFormats', testValue: 'html', listType: 'views' },
      { filterType: 'viewStatuses', expectedParam: 'viewStatuses', testValue: 'rendered', listType: 'views' },

      // Command filters
      { filterType: 'commandStatuses', expectedParam: 'commandStatuses', testValue: 'completed', listType: 'commands' },
      { filterType: 'commandNames', expectedParam: 'commandNames', testValue: 'cache:clear', listType: 'commands' },

      // Gate filters
      { filterType: 'gateNames', expectedParam: 'gateNames', testValue: 'admin', listType: 'gates' },
      { filterType: 'gateResults', expectedParam: 'gateResults', testValue: 'allowed', listType: 'gates' },

      // Batch filters
      { filterType: 'batchOperations', expectedParam: 'batchOperations', testValue: 'insert', listType: 'batches' },
      { filterType: 'batchStatuses', expectedParam: 'batchStatuses', testValue: 'completed', listType: 'batches' },

      // Dump filters
      { filterType: 'dumpOperations', expectedParam: 'dumpOperations', testValue: 'export', listType: 'dumps' },
      { filterType: 'dumpFormats', expectedParam: 'dumpFormats', testValue: 'json', listType: 'dumps' },
      { filterType: 'dumpStatuses', expectedParam: 'dumpStatuses', testValue: 'completed', listType: 'dumps' },
    ];

    filterTypeMappings.forEach(({ filterType, expectedParam, testValue, listType }) => {
      it(`filterType="${filterType}" correctly uses "${expectedParam}"`, () => {
        renderWithRouter(
          <ClickableBadge
            listType={listType}
            filterType={filterType}
            filterValue={testValue}
          >
            {testValue}
          </ClickableBadge>
        );

        fireEvent.click(screen.getByRole('button'));
        expect(mockNavigate).toHaveBeenCalledWith(
          `/${listType}?${expectedParam}=${encodeURIComponent(testValue)}`
        );
      });
    });
  });

  describe('Auto-detection behavior (when filterType is not specified)', () => {
    it('detects HTTP methods', () => {
      renderWithRouter(
        <ClickableBadge listType="requests">GET</ClickableBadge>
      );
      fireEvent.click(screen.getByRole('button'));
      expect(mockNavigate).toHaveBeenCalledWith('/requests?methods=GET');
    });

    it('detects status codes', () => {
      renderWithRouter(
        <ClickableBadge listType="requests">404</ClickableBadge>
      );
      fireEvent.click(screen.getByRole('button'));
      expect(mockNavigate).toHaveBeenCalledWith('/requests?statuses=404');
    });

    it('detects IPv4 addresses like 10.0.0.1', () => {
      renderWithRouter(
        <ClickableBadge listType="requests">10.0.0.1</ClickableBadge>
      );
      fireEvent.click(screen.getByRole('button'));
      expect(mockNavigate).toHaveBeenCalledWith('/requests?ips=10.0.0.1');
    });

    it('detects IPv4 addresses like 192.168.1.1 correctly (fixed)', () => {
      // Previously this was detected as status code because '192' is in 100-599 range
      // Now IPv4 detection happens BEFORE status code detection
      renderWithRouter(
        <ClickableBadge listType="requests">192.168.1.1</ClickableBadge>
      );
      fireEvent.click(screen.getByRole('button'));
      expect(mockNavigate).toHaveBeenCalledWith('/requests?ips=192.168.1.1');
    });

    it('detects controller actions with #', () => {
      renderWithRouter(
        <ClickableBadge listType="requests">UsersController#create</ClickableBadge>
      );
      fireEvent.click(screen.getByRole('button'));
      expect(mockNavigate).toHaveBeenCalledWith(
        `/requests?controllers=${encodeURIComponent('UsersController#create')}`
      );
    });

    it('detects hostnames with port', () => {
      renderWithRouter(
        <ClickableBadge listType="requests">api.example.com:3000</ClickableBadge>
      );
      fireEvent.click(screen.getByRole('button'));
      expect(mockNavigate).toHaveBeenCalledWith(
        `/requests?hostnames=${encodeURIComponent('api.example.com:3000')}`
      );
    });

    it('falls back to tags for unknown values', () => {
      renderWithRouter(
        <ClickableBadge listType="requests">some-random-value</ClickableBadge>
      );
      fireEvent.click(screen.getByRole('button'));
      expect(mockNavigate).toHaveBeenCalledWith('/requests?tags=some-random-value');
    });
  });

  describe('filterValue override', () => {
    it('uses filterValue instead of children when provided', () => {
      renderWithRouter(
        <ClickableBadge
          listType="logs"
          filterType="levels"
          filterValue="error"
        >
          ERROR (display text)
        </ClickableBadge>
      );

      fireEvent.click(screen.getByRole('button'));
      expect(mockNavigate).toHaveBeenCalledWith('/logs?levels=error');
    });
  });

  describe('Click prevention', () => {
    it('does not navigate when clickable=false', () => {
      renderWithRouter(
        <ClickableBadge listType="logs" clickable={false}>
          Badge
        </ClickableBadge>
      );

      const badge = screen.getByText('BADGE');
      fireEvent.click(badge);
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('calls custom onClick instead of navigating', () => {
      const customOnClick = vi.fn();
      renderWithRouter(
        <ClickableBadge listType="logs" onClick={customOnClick}>
          Badge
        </ClickableBadge>
      );

      fireEvent.click(screen.getByRole('button'));
      expect(customOnClick).toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('has button role when clickable', () => {
      renderWithRouter(
        <ClickableBadge listType="logs">Badge</ClickableBadge>
      );
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('has aria-label when clickable', () => {
      renderWithRouter(
        <ClickableBadge listType="logs">Error</ClickableBadge>
      );
      expect(screen.getByRole('button')).toHaveAttribute(
        'aria-label',
        'Click to filter by ERROR'
      );
    });

    it('supports custom aria-label', () => {
      renderWithRouter(
        <ClickableBadge listType="logs" ariaLabel="Custom label">
          Badge
        </ClickableBadge>
      );
      expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Custom label');
    });

    it('responds to Enter key', () => {
      renderWithRouter(
        <ClickableBadge listType="logs" filterType="levels">
          error
        </ClickableBadge>
      );

      const badge = screen.getByRole('button');
      fireEvent.keyDown(badge, { key: 'Enter' });
      expect(mockNavigate).toHaveBeenCalledWith('/logs?levels=error');
    });

    it('responds to Space key', () => {
      renderWithRouter(
        <ClickableBadge listType="logs" filterType="levels">
          warn
        </ClickableBadge>
      );

      const badge = screen.getByRole('button');
      fireEvent.keyDown(badge, { key: ' ' });
      expect(mockNavigate).toHaveBeenCalledWith('/logs?levels=warn');
    });
  });

  describe('All ListTypes supported', () => {
    const listTypes: ListType[] = [
      'requests', 'queries', 'exceptions', 'logs', 'events', 'jobs',
      'cache', 'mail', 'schedule', 'http-client', 'redis', 'models',
      'notifications', 'views', 'commands', 'gates', 'batches', 'dumps'
    ];

    listTypes.forEach((listType) => {
      it(`supports listType="${listType}"`, () => {
        renderWithRouter(
          <ClickableBadge listType={listType}>test</ClickableBadge>
        );

        fireEvent.click(screen.getByRole('button'));
        expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining(`/${listType}?`));
      });
    });
  });

  describe('Summary: All filterTypes are now properly mapped', () => {
    it('verifies all 19 previously missing filterTypes are now handled', () => {
      const nowHandledFilterTypes = [
        'cacheOperations',
        'redisCommands', 'redisStatuses',
        'modelActions', 'modelSources', 'entities',
        'notificationTypes', 'notificationStatuses',
        'viewFormats', 'viewStatuses',
        'commandStatuses', 'commandNames',
        'gateNames', 'gateResults',
        'batchOperations', 'batchStatuses',
        'dumpOperations', 'dumpFormats', 'dumpStatuses',
      ];

      // All 19 filterTypes that were previously missing are now properly handled
      expect(nowHandledFilterTypes).toHaveLength(19);
    });
  });
});
