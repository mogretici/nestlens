import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CursorFilters, getEntriesWithCursor } from '../../api';

/**
 * Every filter the client can hold has to reach the server.
 *
 * `CursorFilters` and the block that turns it into a query string are two lists
 * that have to say the same thing, and nothing links them: a field added to the
 * type but not to the serialiser is a filter the dashboard offers and silently
 * drops. RedisStorage shipped that shape once — 44 filters declared, 9 applied —
 * and no test noticed until somebody used one.
 *
 * The last case walks the type itself, so a filter added later without a line in
 * the serialiser fails here rather than in somebody's browser.
 */
describe('cursor query parameters', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  const asked = (): URLSearchParams =>
    new URL(String(fetchMock.mock.calls[0][0])).searchParams;

  beforeEach(() => {
    fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: [], meta: {} }),
    }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the window as an instant', async () => {
    await getEntriesWithCursor({ filters: { from: '2026-08-22T11:55:00.000Z' } });

    expect(asked().get('from')).toBe('2026-08-22T11:55:00.000Z');
  });

  it('sends both ends of a window', async () => {
    await getEntriesWithCursor({
      filters: { from: '2026-08-22T11:00:00.000Z', to: '2026-08-22T12:00:00.000Z' },
    });

    expect(asked().get('to')).toBe('2026-08-22T12:00:00.000Z');
  });

  it('sends a duration bound', async () => {
    await getEntriesWithCursor({ filters: { minDuration: 500, maxDuration: 5000 } });

    expect(asked().get('minDuration')).toBe('500');
    expect(asked().get('maxDuration')).toBe('5000');
  });

  it('sends a zero duration bound rather than dropping it', async () => {
    // `if (f.minDuration)` would swallow this; zero is a bound like any other.
    await getEntriesWithCursor({ filters: { minDuration: 0 } });

    expect(asked().get('minDuration')).toBe('0');
  });

  it('sends nothing for a filter that was not set', async () => {
    await getEntriesWithCursor({ type: 'request', limit: 50 });

    expect(asked().has('from')).toBe(false);
    expect(asked().has('minDuration')).toBe(false);
  });

  it('sends every filter the type declares', async () => {
    // One value per field, typed through `CursorFilters` so the sample cannot
    // drift from the type without the compiler saying so.
    const sample: Required<CursorFilters> = {
      levels: ['error'],
      contexts: ['AppService'],
      queryTypes: ['select'],
      sources: ['typeorm'],
      slow: true,
      names: ['Error'],
      methods: ['GET'],
      paths: ['/orders'],
      resolved: false,
      statuses: [500],
      hostnames: ['api.test'],
      controllers: ['OrdersController'],
      ips: ['127.0.0.1'],
      eventNames: ['order.created'],
      scheduleStatuses: ['completed'],
      scheduleNames: ['nightly'],
      jobStatuses: ['failed'],
      jobNames: ['send-mail'],
      queues: ['default'],
      cacheOperations: ['hit'],
      mailStatuses: ['sent'],
      redisStatuses: ['success'],
      redisCommands: ['GET'],
      modelActions: ['created'],
      entities: ['User'],
      modelSources: ['typeorm'],
      notificationTypes: ['mail'],
      notificationStatuses: ['sent'],
      viewFormats: ['hbs'],
      viewStatuses: ['rendered'],
      commandStatuses: ['success'],
      commandNames: ['seed'],
      gateNames: ['update-order'],
      gateResults: ['allowed'],
      batchStatuses: ['completed'],
      batchOperations: ['import'],
      dumpStatuses: ['completed'],
      dumpOperations: ['export'],
      dumpFormats: ['json'],
      operationTypes: ['query'],
      operationNames: ['GetOrders'],
      hasErrors: true,
      hasN1: false,
      tags: ['slow'],
      search: 'orders',
      from: '2026-08-22T11:00:00.000Z',
      to: '2026-08-22T12:00:00.000Z',
      minDuration: 100,
      maxDuration: 9000,
    };

    await getEntriesWithCursor({ filters: sample });

    const sent = asked();
    const missing = Object.keys(sample).filter((key) => !sent.has(key));

    expect(missing).toEqual([]);
  });
});
