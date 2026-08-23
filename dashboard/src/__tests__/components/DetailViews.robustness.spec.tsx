/**
 * Every detail view, given only the fields its type declares as required.
 *
 * Optional fields are optional in fact as well as in the type: `captureBody`,
 * `captureHeaders`, `captureResponse` and their neighbours are settings a
 * reader turns off, and a watcher that recorded nothing for them leaves the
 * field out. A view that reads one without checking crashes the page it is on.
 *
 * The other direction — a payload without the fields its type *does* declare —
 * is handled a level up: `EntryDetailPage` falls back to showing the payload
 * as it was recorded. See `EntryDetailPage.unshaped.spec.tsx`.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
import { Entry } from '../../types';

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
  Toaster: () => null,
}));

type View = (props: { entry: Entry }) => JSX.Element;

const VIEWS: [string, View][] = [
  ['request', RequestDetailView as View],
  ['query', QueryDetailView as View],
  ['exception', ExceptionDetailView as View],
  ['log', LogDetailView as View],
  ['event', EventDetailView as View],
  ['job', JobDetailView as View],
  ['cache', CacheDetailView as View],
  ['mail', MailDetailView as View],
  ['schedule', ScheduleDetailView as View],
  ['http-client', HttpClientDetailView as View],
  ['redis', RedisDetailView as View],
  ['model', ModelDetailView as View],
  ['notification', NotificationDetailView as View],
  ['view', ViewDetailView as View],
  ['command', CommandDetailView as View],
  ['gate', GateDetailView as View],
  ['batch', BatchDetailView as View],
  ['dump', DumpDetailView as View],
  ['graphql', GraphQLDetailView as View],
];

/** The smallest payload each type declares as valid. */
const REQUIRED: Record<string, Record<string, unknown>> = {
  request: { method: 'GET', url: '/orders', path: '/orders', query: {}, params: {}, headers: {} },
  query: { query: 'SELECT 1', duration: 2, source: 'typeorm' },
  exception: { name: 'TypeError', message: 'boom' },
  log: { level: 'info', message: 'hello' },
  event: { name: 'order.created', listeners: [], duration: 1 },
  job: { name: 'send-mail', queue: 'mail', status: 'completed', attempts: 1 },
  cache: { operation: 'get', key: 'k', duration: 1 },
  mail: { to: 'ada@example.com', subject: 'hello', status: 'sent', duration: 1 },
  schedule: { name: 'nightly', status: 'completed', duration: 1 },
  'http-client': { method: 'GET', url: 'https://api.example.com/x', duration: 1 },
  redis: { command: 'get', args: [], duration: 1, status: 'success' },
  model: { action: 'find', entity: 'Order', source: 'typeorm', duration: 1 },
  notification: { type: 'email', recipient: 'ada@example.com', status: 'sent', duration: 1 },
  view: { template: 'pages/home', format: 'html', duration: 1, status: 'rendered' },
  command: { name: 'user:create', status: 'completed', duration: 1 },
  gate: { gate: 'post.update', action: 'update', allowed: true, duration: 1 },
  batch: {
    name: 'import',
    operation: 'import',
    totalItems: 1,
    processedItems: 1,
    failedItems: 0,
    status: 'completed',
    duration: 1,
  },
  dump: { operation: 'export', format: 'json', status: 'completed', duration: 1 },
  graphql: {
    operationType: 'query',
    query: '{ orders { id } }',
    queryHash: 'abc',
    duration: 1,
    statusCode: 200,
    hasErrors: false,
  },
};

const entryOf = (type: string, payload: Record<string, unknown>): Entry =>
  ({
    id: 1,
    type,
    createdAt: '2026-01-01T00:00:00.000Z',
    payload,
  }) as unknown as Entry;

describe.each(VIEWS)('the %s detail view', (type, View) => {
  it('renders with only the fields its type requires', () => {
    expect(() =>
      render(
        <MemoryRouter>
          <View entry={entryOf(type, REQUIRED[type])} />
        </MemoryRouter>,
      ),
    ).not.toThrow();
  });
});
