import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router-dom';

// DetailView components
import RequestDetailView from '../../components/RequestDetailView';
import QueryDetailView from '../../components/QueryDetailView';
import ExceptionDetailView from '../../components/ExceptionDetailView';
import LogDetailView from '../../components/LogDetailView';
import EventDetailView from '../../components/EventDetailView';
import JobDetailView from '../../components/JobDetailView';
import CacheDetailView from '../../components/CacheDetailView';
import MailDetailView from '../../components/MailDetailView';
import ScheduleDetailView from '../../components/ScheduleDetailView';
import HttpClientDetailView from '../../components/HttpClientDetailView';
import RedisDetailView from '../../components/RedisDetailView';
import ModelDetailView from '../../components/ModelDetailView';
import NotificationDetailView from '../../components/NotificationDetailView';
import ViewDetailView from '../../components/ViewDetailView';
import CommandDetailView from '../../components/CommandDetailView';
import GateDetailView from '../../components/GateDetailView';
import BatchDetailView from '../../components/BatchDetailView';
import DumpDetailView from '../../components/DumpDetailView';
import GraphQLDetailView from '../../components/GraphQLDetailView';

// Types - import actual types for type safety
import type {
  RequestEntry,
  QueryEntry,
  ExceptionEntry,
  LogEntry,
  EventEntry,
  JobEntry,
  CacheEntry,
  MailEntry,
  ScheduleEntry,
  HttpClientEntry,
  RedisEntry,
  ModelEntry,
  NotificationEntry,
  ViewEntry,
  CommandEntry,
  GateEntry,
  BatchEntry,
  DumpEntry,
  GraphQLEntry,
} from '../../types';

/**
 * DetailView Badge Filtering Tests
 *
 * Professional, comprehensive tests verifying that ClickableBadge components
 * in DetailView pages navigate to correctly filtered list pages.
 *
 * Test Strategy:
 * - Each test verifies a specific badge's navigation behavior
 * - Uses actual TypeScript types for type-safe mock data
 * - Follows AAA pattern (Arrange-Act-Assert)
 * - Tests uppercase display text (as ClickableBadge renders uppercase)
 *
 * @see ClickableBadge.tsx - Badge component with filtering navigation
 * @see useEntryFilters.ts - URL key mapping logic
 */

// ============================================================================
// MOCKS
// ============================================================================

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: vi.fn(),
  };
});

// ============================================================================
// TEST UTILITIES
// ============================================================================

const RouterWrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

const createBaseEntry = (type: string, id = 1) => ({
  id,
  type,
  createdAt: new Date().toISOString(),
  tags: [],
});

// ============================================================================
// TYPED MOCK FACTORIES
// Each factory creates a complete, valid entry matching TypeScript types
// ============================================================================

const mockRequestEntry = (overrides: Partial<RequestEntry['payload']> = {}): RequestEntry => ({
  ...createBaseEntry('request'),
  type: 'request',
  payload: {
    method: 'GET',
    url: 'http://api.example.com/api/users',
    path: '/api/users',
    query: {},
    params: {},
    headers: { host: 'api.example.com' },
    statusCode: 200,
    duration: 150,
    ip: '192.168.1.1',
    controllerAction: 'UsersController#index',
    ...overrides,
  },
});

const mockQueryEntry = (overrides: Partial<QueryEntry['payload']> = {}): QueryEntry => ({
  ...createBaseEntry('query'),
  type: 'query',
  payload: {
    query: 'SELECT * FROM users WHERE id = ?',
    parameters: [1],
    duration: 50,
    slow: false,
    source: 'typeorm',
    connection: 'default',
    ...overrides,
  },
});

const mockExceptionEntry = (overrides: Partial<ExceptionEntry['payload']> = {}): ExceptionEntry => ({
  ...createBaseEntry('exception'),
  type: 'exception',
  payload: {
    name: 'ValidationError',
    message: 'Invalid input provided',
    stack: 'Error: Invalid input\n    at validate (/app/src/validators.ts:10:5)',
    request: {
      method: 'POST',
      url: '/api/auth/login',
    },
    ...overrides,
  },
});

const mockLogEntry = (overrides: Partial<LogEntry['payload']> = {}): LogEntry => ({
  ...createBaseEntry('log'),
  type: 'log',
  payload: {
    level: 'error',
    message: 'Database connection failed',
    context: 'AuthService',
    ...overrides,
  },
});

const mockEventEntry = (overrides: Partial<EventEntry['payload']> = {}): EventEntry => ({
  ...createBaseEntry('event'),
  type: 'event',
  payload: {
    name: 'user.created',
    payload: { userId: 1, email: 'test@example.com' },
    listeners: ['SendWelcomeEmailListener', 'UpdateAnalyticsListener'],
    duration: 25,
    ...overrides,
  },
});

const mockJobEntry = (overrides: Partial<JobEntry['payload']> = {}): JobEntry => ({
  ...createBaseEntry('job'),
  type: 'job',
  payload: {
    name: 'SendEmailJob',
    queue: 'email',
    status: 'completed',
    attempts: 1,
    duration: 200,
    data: { to: 'user@example.com', template: 'welcome' },
    ...overrides,
  },
});

const mockCacheEntry = (overrides: Partial<CacheEntry['payload']> = {}): CacheEntry => ({
  ...createBaseEntry('cache'),
  type: 'cache',
  payload: {
    key: 'user:1:profile',
    operation: 'get',
    hit: true,
    duration: 2,
    ...overrides,
  },
});

const mockMailEntry = (overrides: Partial<MailEntry['payload']> = {}): MailEntry => ({
  ...createBaseEntry('mail'),
  type: 'mail',
  payload: {
    to: ['user@example.com'],
    subject: 'Welcome to our platform',
    status: 'sent',
    duration: 150,
    ...overrides,
  },
});

const mockScheduleEntry = (overrides: Partial<ScheduleEntry['payload']> = {}): ScheduleEntry => ({
  ...createBaseEntry('schedule'),
  type: 'schedule',
  payload: {
    name: 'cleanup:sessions',
    status: 'completed',
    duration: 1500,
    cron: '0 0 * * *',
    ...overrides,
  },
});

const mockHttpClientEntry = (overrides: Partial<HttpClientEntry['payload']> = {}): HttpClientEntry => ({
  ...createBaseEntry('http-client'),
  type: 'http-client',
  payload: {
    method: 'GET',
    url: 'https://api.stripe.com/v1/charges',
    hostname: 'api.stripe.com',
    path: '/v1/charges',
    statusCode: 200,
    duration: 350,
    ...overrides,
  },
});

const mockRedisEntry = (overrides: Partial<RedisEntry['payload']> = {}): RedisEntry => ({
  ...createBaseEntry('redis'),
  type: 'redis',
  payload: {
    command: 'GET',
    keyPattern: 'session:*',
    duration: 1,
    status: 'success',
    ...overrides,
  },
});

const mockModelEntry = (overrides: Partial<ModelEntry['payload']> = {}): ModelEntry => ({
  ...createBaseEntry('model'),
  type: 'model',
  payload: {
    action: 'create',
    entity: 'User',
    source: 'prisma',
    duration: 15,
    records: 1,
    ...overrides,
  },
});

const mockNotificationEntry = (overrides: Partial<NotificationEntry['payload']> = {}): NotificationEntry => ({
  ...createBaseEntry('notification'),
  type: 'notification',
  payload: {
    type: 'email',
    recipient: 'user@example.com',
    status: 'sent',
    duration: 100,
    channels: ['email', 'push'],
    ...overrides,
  },
});

const mockViewEntry = (overrides: Partial<ViewEntry['payload']> = {}): ViewEntry => ({
  ...createBaseEntry('view'),
  type: 'view',
  payload: {
    template: 'dashboard/index',
    format: 'html',
    status: 'rendered',
    duration: 45,
    ...overrides,
  },
});

const mockCommandEntry = (overrides: Partial<CommandEntry['payload']> = {}): CommandEntry => ({
  ...createBaseEntry('command'),
  type: 'command',
  payload: {
    name: 'migrate:run',
    status: 'completed',
    duration: 3500,
    ...overrides,
  },
});

const mockGateEntry = (overrides: Partial<GateEntry['payload']> = {}): GateEntry => ({
  ...createBaseEntry('gate'),
  type: 'gate',
  payload: {
    gate: 'admin-panel',
    action: 'access',
    allowed: true,
    duration: 2,
    ...overrides,
  },
});

const mockBatchEntry = (overrides: Partial<BatchEntry['payload']> = {}): BatchEntry => ({
  ...createBaseEntry('batch'),
  type: 'batch',
  payload: {
    name: 'user-import',
    operation: 'import',
    totalItems: 1000,
    processedItems: 1000,
    failedItems: 0,
    duration: 45000,
    status: 'completed',
    ...overrides,
  },
});

const mockDumpEntry = (overrides: Partial<DumpEntry['payload']> = {}): DumpEntry => ({
  ...createBaseEntry('dump'),
  type: 'dump',
  payload: {
    operation: 'export',
    format: 'json',
    status: 'completed',
    duration: 2500,
    recordCount: 5000,
    ...overrides,
  },
});

const mockGraphQLEntry = (overrides: Partial<GraphQLEntry['payload']> = {}): GraphQLEntry => ({
  ...createBaseEntry('graphql'),
  type: 'graphql',
  payload: {
    operationType: 'query',
    operationName: 'GetUsers',
    query: 'query GetUsers { users { id name email } }',
    queryHash: 'abc123',
    statusCode: 200,
    duration: 120,
    hasErrors: false,
    ...overrides,
  },
});

// ============================================================================
// TESTS
// ============================================================================

describe('DetailView Badge Filtering', () => {
  const mockNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // REQUEST DETAIL VIEW
  // ─────────────────────────────────────────────────────────────────────────
  describe('RequestDetailView', () => {
    it('hostname badge navigates to filtered requests', async () => {
      // Arrange
      const user = userEvent.setup();
      const entry = mockRequestEntry({
        headers: { host: 'api.example.com' },
        url: 'http://api.example.com/api/users',
      });

      // Act
      render(<RequestDetailView entry={entry} />, { wrapper: RouterWrapper });
      const badge = screen.getByText('API.EXAMPLE.COM');
      await user.click(badge);

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/requests?hostnames=api.example.com');
    });

    it('path badge navigates to filtered requests', async () => {
      // Arrange
      const user = userEvent.setup();
      const entry = mockRequestEntry({ path: '/api/users' });

      // Act
      render(<RequestDetailView entry={entry} />, { wrapper: RouterWrapper });
      const badge = screen.getByText('/API/USERS');
      await user.click(badge);

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/requests?paths=%2Fapi%2Fusers');
    });

    it('status badge navigates to filtered requests', async () => {
      // Arrange
      const user = userEvent.setup();
      const entry = mockRequestEntry({ statusCode: 200 });

      // Act
      render(<RequestDetailView entry={entry} />, { wrapper: RouterWrapper });
      const badge = screen.getByText('200');
      await user.click(badge);

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/requests?statuses=200');
    });

    it('controller badge navigates to filtered requests', async () => {
      // Arrange
      const user = userEvent.setup();
      const entry = mockRequestEntry({ controllerAction: 'UsersController#index' });

      // Act
      render(<RequestDetailView entry={entry} />, { wrapper: RouterWrapper });
      const badge = screen.getByText('USERSCONTROLLER#INDEX');
      await user.click(badge);

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/requests?controllers=UsersController%23index');
    });

    it('IP badge navigates to filtered requests', async () => {
      // Arrange
      const user = userEvent.setup();
      const entry = mockRequestEntry({ ip: '192.168.1.1' });

      // Act
      render(<RequestDetailView entry={entry} />, { wrapper: RouterWrapper });
      const badge = screen.getByText('192.168.1.1');
      await user.click(badge);

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/requests?ips=192.168.1.1');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // QUERY DETAIL VIEW
  // ─────────────────────────────────────────────────────────────────────────
  describe('QueryDetailView', () => {
    it('source badge navigates to filtered queries', async () => {
      // Arrange
      const user = userEvent.setup();
      const entry = mockQueryEntry({ source: 'typeorm' });

      // Act
      render(<QueryDetailView entry={entry} />, { wrapper: RouterWrapper });
      const badge = screen.getByText('TYPEORM');
      await user.click(badge);

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/queries?sources=typeorm');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // EXCEPTION DETAIL VIEW
  // ─────────────────────────────────────────────────────────────────────────
  describe('ExceptionDetailView', () => {
    it('exception name badge navigates to filtered exceptions', async () => {
      // Arrange
      const user = userEvent.setup();
      const entry = mockExceptionEntry({ name: 'ValidationError' });

      // Act
      render(<ExceptionDetailView entry={entry} />, { wrapper: RouterWrapper });
      const badge = screen.getByText('VALIDATIONERROR');
      await user.click(badge);

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/exceptions?names=ValidationError');
    });

    it('method badge navigates to filtered exceptions', async () => {
      // Arrange
      const user = userEvent.setup();
      const entry = mockExceptionEntry({ request: { method: 'POST', url: '/api/auth' } });

      // Act
      render(<ExceptionDetailView entry={entry} />, { wrapper: RouterWrapper });
      const badge = screen.getByText('POST');
      await user.click(badge);

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/exceptions?methods=POST');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // LOG DETAIL VIEW
  // ─────────────────────────────────────────────────────────────────────────
  describe('LogDetailView', () => {
    it('level badge navigates to filtered logs', async () => {
      // Arrange
      const user = userEvent.setup();
      const entry = mockLogEntry({ level: 'error' });

      // Act
      render(<LogDetailView entry={entry} />, { wrapper: RouterWrapper });
      const badge = screen.getByText('ERROR');
      await user.click(badge);

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/logs?levels=error');
    });

    it('context badge navigates to filtered logs', async () => {
      // Arrange
      const user = userEvent.setup();
      const entry = mockLogEntry({ context: 'AuthService' });

      // Act
      render(<LogDetailView entry={entry} />, { wrapper: RouterWrapper });
      const badge = screen.getByText('AUTHSERVICE');
      await user.click(badge);

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/logs?contexts=AuthService');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // EVENT DETAIL VIEW
  // ─────────────────────────────────────────────────────────────────────────
  describe('EventDetailView', () => {
    it('event name badge navigates to filtered events', async () => {
      // Arrange
      const user = userEvent.setup();
      const entry = mockEventEntry({ name: 'user.created' });

      // Act
      render(<EventDetailView entry={entry} />, { wrapper: RouterWrapper });
      const badge = screen.getByText('USER.CREATED');
      await user.click(badge);

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/events?eventNames=user.created');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // JOB DETAIL VIEW
  // ─────────────────────────────────────────────────────────────────────────
  describe('JobDetailView', () => {
    it('job name badge navigates to filtered jobs', async () => {
      // Arrange
      const user = userEvent.setup();
      const entry = mockJobEntry({ name: 'SendEmailJob' });

      // Act
      render(<JobDetailView entry={entry} />, { wrapper: RouterWrapper });
      // Job name badge is in Details section with role="button"
      const badge = screen.getByText('SENDEMAILJ' + 'OB');
      await user.click(badge);

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/jobs?jobNames=SendEmailJob');
    });

    it('queue badge navigates to filtered jobs', async () => {
      // Arrange
      const user = userEvent.setup();
      const entry = mockJobEntry({ queue: 'email' });

      // Act
      render(<JobDetailView entry={entry} />, { wrapper: RouterWrapper });
      // Queue badge is in Details section
      const badges = screen.getAllByText('EMAIL');
      const queueBadge = badges.find(el => el.getAttribute('role') === 'button');
      await user.click(queueBadge!);

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/jobs?queues=email');
    });

    it('status badge navigates to filtered jobs', async () => {
      // Arrange
      const user = userEvent.setup();
      const entry = mockJobEntry({ status: 'completed' });

      // Act
      render(<JobDetailView entry={entry} />, { wrapper: RouterWrapper });
      // Status badge is in Details section with role="button" (not the stats row one)
      const badges = screen.getAllByText('COMPLETED');
      const statusBadge = badges.find(el => el.getAttribute('role') === 'button');
      await user.click(statusBadge!);

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/jobs?jobStatuses=completed');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CACHE DETAIL VIEW
  // ─────────────────────────────────────────────────────────────────────────
  describe('CacheDetailView', () => {
    it('operation badge navigates to filtered cache entries', async () => {
      // Arrange
      const user = userEvent.setup();
      const entry = mockCacheEntry({ operation: 'get' });

      // Act
      render(<CacheDetailView entry={entry} />, { wrapper: RouterWrapper });
      // Find the badge in the Details section (there are two GET labels)
      const badges = screen.getAllByText('GET');
      const operationBadge = badges.find(el => el.getAttribute('role') === 'button');
      await user.click(operationBadge!);

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/cache?cacheOperations=get');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // MAIL DETAIL VIEW
  // ─────────────────────────────────────────────────────────────────────────
  describe('MailDetailView', () => {
    it('status badge navigates to filtered mail entries', async () => {
      // Arrange
      const user = userEvent.setup();
      const entry = mockMailEntry({ status: 'sent' });

      // Act
      render(<MailDetailView entry={entry} />, { wrapper: RouterWrapper });
      // Status badge is in Details section with role="button"
      const badges = screen.getAllByText('SENT');
      const statusBadge = badges.find(el => el.getAttribute('role') === 'button');
      await user.click(statusBadge!);

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/mail?mailStatuses=sent');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SCHEDULE DETAIL VIEW
  // ─────────────────────────────────────────────────────────────────────────
  describe('ScheduleDetailView', () => {
    it('task name badge navigates to filtered schedule entries', async () => {
      // Arrange
      const user = userEvent.setup();
      const entry = mockScheduleEntry({ name: 'cleanup:sessions' });

      // Act
      render(<ScheduleDetailView entry={entry} />, { wrapper: RouterWrapper });
      // Name badge is in Details section with role="button"
      const badges = screen.getAllByText('CLEANUP:SESSIONS');
      const nameBadge = badges.find(el => el.getAttribute('role') === 'button');
      await user.click(nameBadge!);

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/schedule?scheduleNames=cleanup%3Asessions');
    });

    it('status badge navigates to filtered schedule entries', async () => {
      // Arrange
      const user = userEvent.setup();
      const entry = mockScheduleEntry({ status: 'completed' });

      // Act
      render(<ScheduleDetailView entry={entry} />, { wrapper: RouterWrapper });
      // Status badge is in Details section with role="button"
      const badges = screen.getAllByText('COMPLETED');
      const statusBadge = badges.find(el => el.getAttribute('role') === 'button');
      await user.click(statusBadge!);

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/schedule?scheduleStatuses=completed');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // HTTP CLIENT DETAIL VIEW
  // ─────────────────────────────────────────────────────────────────────────
  describe('HttpClientDetailView', () => {
    it('method badge navigates to filtered http-client entries', async () => {
      // Arrange
      const user = userEvent.setup();
      const entry = mockHttpClientEntry({ method: 'GET' });

      // Act
      render(<HttpClientDetailView entry={entry} />, { wrapper: RouterWrapper });
      const badge = screen.getByText('GET');
      await user.click(badge);

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/http-client?methods=GET');
    });

    it('hostname badge navigates to filtered http-client entries', async () => {
      // Arrange
      const user = userEvent.setup();
      const entry = mockHttpClientEntry({ hostname: 'api.stripe.com' });

      // Act
      render(<HttpClientDetailView entry={entry} />, { wrapper: RouterWrapper });
      const badge = screen.getByText('API.STRIPE.COM');
      await user.click(badge);

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/http-client?hostnames=api.stripe.com');
    });

    it('status badge navigates to filtered http-client entries', async () => {
      // Arrange
      const user = userEvent.setup();
      const entry = mockHttpClientEntry({ statusCode: 200 });

      // Act
      render(<HttpClientDetailView entry={entry} />, { wrapper: RouterWrapper });
      const badge = screen.getByText('200');
      await user.click(badge);

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/http-client?statuses=200');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // REDIS DETAIL VIEW
  // ─────────────────────────────────────────────────────────────────────────
  describe('RedisDetailView', () => {
    it('command badge navigates to filtered redis entries', async () => {
      // Arrange
      const user = userEvent.setup();
      const entry = mockRedisEntry({ command: 'GET' });

      // Act
      render(<RedisDetailView entry={entry} />, { wrapper: RouterWrapper });
      // Find the badge (role=button)
      const badges = screen.getAllByText('GET');
      const commandBadge = badges.find(el => el.getAttribute('role') === 'button');
      await user.click(commandBadge!);

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/redis?redisCommands=GET');
    });

    it('status badge navigates to filtered redis entries', async () => {
      // Arrange
      const user = userEvent.setup();
      const entry = mockRedisEntry({ status: 'success' });

      // Act
      render(<RedisDetailView entry={entry} />, { wrapper: RouterWrapper });
      // Status badge is in Details section with role="button"
      const badges = screen.getAllByText('SUCCESS');
      const statusBadge = badges.find(el => el.getAttribute('role') === 'button');
      await user.click(statusBadge!);

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/redis?redisStatuses=success');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // MODEL DETAIL VIEW
  // ─────────────────────────────────────────────────────────────────────────
  describe('ModelDetailView', () => {
    it('action badge navigates to filtered model entries', async () => {
      // Arrange
      const user = userEvent.setup();
      const entry = mockModelEntry({ action: 'create' });

      // Act
      render(<ModelDetailView entry={entry} />, { wrapper: RouterWrapper });
      // Action badge is in Details section with role="button"
      const badges = screen.getAllByText('CREATE');
      const actionBadge = badges.find(el => el.getAttribute('role') === 'button');
      await user.click(actionBadge!);

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/models?modelActions=create');
    });

    it('entity badge navigates to filtered model entries', async () => {
      // Arrange
      const user = userEvent.setup();
      const entry = mockModelEntry({ entity: 'User' });

      // Act
      render(<ModelDetailView entry={entry} />, { wrapper: RouterWrapper });
      // Entity badge is in Details section with role="button"
      const badges = screen.getAllByText('USER');
      const entityBadge = badges.find(el => el.getAttribute('role') === 'button');
      await user.click(entityBadge!);

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/models?entities=User');
    });

    it('source badge navigates to filtered model entries', async () => {
      // Arrange
      const user = userEvent.setup();
      const entry = mockModelEntry({ source: 'prisma' });

      // Act
      render(<ModelDetailView entry={entry} />, { wrapper: RouterWrapper });
      // Source badge is in Details section with role="button"
      const badges = screen.getAllByText('PRISMA');
      const sourceBadge = badges.find(el => el.getAttribute('role') === 'button');
      await user.click(sourceBadge!);

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/models?modelSources=prisma');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // NOTIFICATION DETAIL VIEW
  // ─────────────────────────────────────────────────────────────────────────
  describe('NotificationDetailView', () => {
    it('type badge navigates to filtered notification entries', async () => {
      // Arrange
      const user = userEvent.setup();
      const entry = mockNotificationEntry({ type: 'email' });

      // Act
      render(<NotificationDetailView entry={entry} />, { wrapper: RouterWrapper });
      // Type badge is in Details section with role="button"
      const badges = screen.getAllByText('EMAIL');
      const typeBadge = badges.find(el => el.getAttribute('role') === 'button');
      await user.click(typeBadge!);

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/notifications?notificationTypes=email');
    });

    it('status badge navigates to filtered notification entries', async () => {
      // Arrange
      const user = userEvent.setup();
      const entry = mockNotificationEntry({ status: 'sent' });

      // Act
      render(<NotificationDetailView entry={entry} />, { wrapper: RouterWrapper });
      // Status badge is in Details section with role="button"
      const badges = screen.getAllByText('SENT');
      const statusBadge = badges.find(el => el.getAttribute('role') === 'button');
      await user.click(statusBadge!);

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/notifications?notificationStatuses=sent');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // VIEW DETAIL VIEW
  // ─────────────────────────────────────────────────────────────────────────
  describe('ViewDetailView', () => {
    it('format badge navigates to filtered view entries', async () => {
      // Arrange
      const user = userEvent.setup();
      const entry = mockViewEntry({ format: 'html' });

      // Act
      render(<ViewDetailView entry={entry} />, { wrapper: RouterWrapper });
      // Format badge is in Details section with role="button"
      const badges = screen.getAllByText('HTML');
      const formatBadge = badges.find(el => el.getAttribute('role') === 'button');
      await user.click(formatBadge!);

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/views?viewFormats=html');
    });

    it('status badge navigates to filtered view entries', async () => {
      // Arrange
      const user = userEvent.setup();
      const entry = mockViewEntry({ status: 'rendered' });

      // Act
      render(<ViewDetailView entry={entry} />, { wrapper: RouterWrapper });
      // Status badge is in Details section with role="button"
      const badges = screen.getAllByText('RENDERED');
      const statusBadge = badges.find(el => el.getAttribute('role') === 'button');
      await user.click(statusBadge!);

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/views?viewStatuses=rendered');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // COMMAND DETAIL VIEW
  // ─────────────────────────────────────────────────────────────────────────
  describe('CommandDetailView', () => {
    it('command name badge navigates to filtered command entries', async () => {
      // Arrange
      const user = userEvent.setup();
      const entry = mockCommandEntry({ name: 'migrate:run' });

      // Act
      render(<CommandDetailView entry={entry} />, { wrapper: RouterWrapper });
      // Command name badge is in Details section with role="button"
      const badges = screen.getAllByText('MIGRATE:RUN');
      const nameBadge = badges.find(el => el.getAttribute('role') === 'button');
      await user.click(nameBadge!);

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/commands?commandNames=migrate%3Arun');
    });

    it('status badge navigates to filtered command entries', async () => {
      // Arrange
      const user = userEvent.setup();
      const entry = mockCommandEntry({ status: 'completed' });

      // Act
      render(<CommandDetailView entry={entry} />, { wrapper: RouterWrapper });
      // Status badge is in Details section with role="button"
      const badges = screen.getAllByText('COMPLETED');
      const statusBadge = badges.find(el => el.getAttribute('role') === 'button');
      await user.click(statusBadge!);

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/commands?commandStatuses=completed');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GATE DETAIL VIEW
  // ─────────────────────────────────────────────────────────────────────────
  describe('GateDetailView', () => {
    it('gate name badge navigates to filtered gate entries', async () => {
      // Arrange
      const user = userEvent.setup();
      const entry = mockGateEntry({ gate: 'admin-panel' });

      // Act
      render(<GateDetailView entry={entry} />, { wrapper: RouterWrapper });
      const badge = screen.getByText('ADMIN-PANEL');
      await user.click(badge);

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/gates?gateNames=admin-panel');
    });

    it('allowed result badge navigates to filtered gate entries', async () => {
      // Arrange
      const user = userEvent.setup();
      const entry = mockGateEntry({ allowed: true });

      // Act
      render(<GateDetailView entry={entry} />, { wrapper: RouterWrapper });
      const badge = screen.getByText('ALLOWED');
      await user.click(badge);

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/gates?gateResults=allowed');
    });

    it('denied result badge navigates to filtered gate entries', async () => {
      // Arrange
      const user = userEvent.setup();
      const entry = mockGateEntry({ allowed: false });

      // Act
      render(<GateDetailView entry={entry} />, { wrapper: RouterWrapper });
      const badge = screen.getByText('DENIED');
      await user.click(badge);

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/gates?gateResults=denied');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // BATCH DETAIL VIEW
  // ─────────────────────────────────────────────────────────────────────────
  describe('BatchDetailView', () => {
    it('operation badge navigates to filtered batch entries', async () => {
      // Arrange
      const user = userEvent.setup();
      const entry = mockBatchEntry({ operation: 'import' });

      // Act
      render(<BatchDetailView entry={entry} />, { wrapper: RouterWrapper });
      // Operation badge is in Details section with role="button"
      const badges = screen.getAllByText('IMPORT');
      const operationBadge = badges.find(el => el.getAttribute('role') === 'button');
      await user.click(operationBadge!);

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/batches?batchOperations=import');
    });

    it('status badge navigates to filtered batch entries', async () => {
      // Arrange
      const user = userEvent.setup();
      const entry = mockBatchEntry({ status: 'completed' });

      // Act
      render(<BatchDetailView entry={entry} />, { wrapper: RouterWrapper });
      // Status badge is in Details section with role="button"
      const badges = screen.getAllByText('COMPLETED');
      const statusBadge = badges.find(el => el.getAttribute('role') === 'button');
      await user.click(statusBadge!);

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/batches?batchStatuses=completed');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DUMP DETAIL VIEW
  // ─────────────────────────────────────────────────────────────────────────
  describe('DumpDetailView', () => {
    it('operation badge navigates to filtered dump entries', async () => {
      // Arrange
      const user = userEvent.setup();
      const entry = mockDumpEntry({ operation: 'export' });

      // Act
      render(<DumpDetailView entry={entry} />, { wrapper: RouterWrapper });
      // Operation badge is in Details section with role="button"
      const badges = screen.getAllByText('EXPORT');
      const operationBadge = badges.find(el => el.getAttribute('role') === 'button');
      await user.click(operationBadge!);

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/dumps?dumpOperations=export');
    });

    it('format badge navigates to filtered dump entries', async () => {
      // Arrange
      const user = userEvent.setup();
      const entry = mockDumpEntry({ format: 'json' });

      // Act
      render(<DumpDetailView entry={entry} />, { wrapper: RouterWrapper });
      // Format badge is in Details section with role="button"
      const badges = screen.getAllByText('JSON');
      const formatBadge = badges.find(el => el.getAttribute('role') === 'button');
      await user.click(formatBadge!);

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/dumps?dumpFormats=json');
    });

    it('status badge navigates to filtered dump entries', async () => {
      // Arrange
      const user = userEvent.setup();
      const entry = mockDumpEntry({ status: 'completed' });

      // Act
      render(<DumpDetailView entry={entry} />, { wrapper: RouterWrapper });
      // Status badge is in Details section with role="button"
      const badges = screen.getAllByText('COMPLETED');
      const statusBadge = badges.find(el => el.getAttribute('role') === 'button');
      await user.click(statusBadge!);

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/dumps?dumpStatuses=completed');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GRAPHQL DETAIL VIEW
  // ─────────────────────────────────────────────────────────────────────────
  describe('GraphQLDetailView', () => {
    it('operation type badge navigates to filtered graphql entries', async () => {
      // Arrange
      const user = userEvent.setup();
      const entry = mockGraphQLEntry({ operationType: 'query' });

      // Act
      render(<GraphQLDetailView entry={entry} />, { wrapper: RouterWrapper });
      const badge = screen.getByText('QUERY');
      await user.click(badge);

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/graphql?operationTypes=query');
    });

    it('operation name badge navigates to filtered graphql entries', async () => {
      // Arrange
      const user = userEvent.setup();
      const entry = mockGraphQLEntry({ operationName: 'GetUsers' });

      // Act
      render(<GraphQLDetailView entry={entry} />, { wrapper: RouterWrapper });
      const badge = screen.getByText('GETUSERS');
      await user.click(badge);

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/graphql?operationNames=GetUsers');
    });

    it('status badge navigates to filtered graphql entries', async () => {
      // Arrange
      const user = userEvent.setup();
      const entry = mockGraphQLEntry({ statusCode: 200 });

      // Act
      render(<GraphQLDetailView entry={entry} />, { wrapper: RouterWrapper });
      const badge = screen.getByText('200');
      await user.click(badge);

      // Assert
      expect(mockNavigate).toHaveBeenCalledWith('/graphql?statuses=200');
    });
  });
});
