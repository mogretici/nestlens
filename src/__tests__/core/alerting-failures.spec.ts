/**
 * Telling a webhook to announce what went wrong.
 *
 * `events` was a list of entry types, and the thing a destination is usually
 * for — *failures* — needed a list per type plus an entry filter that knows the
 * shape of each payload. An application reported reaching that at a hundred
 * lines of configuration, and the ordering it depends on is stated nowhere but
 * in the collector's source.
 */
import { Subject } from 'rxjs';
import { AlertingService } from '../../core/alerting.service';
import { CollectorService } from '../../core/collector.service';
import { AlertingEvents, NestLensConfig } from '../../nestlens.config';
import { Entry } from '../../types';

const WEBHOOK = 'http://alerts.test/hook';

const announced = async (events: AlertingEvents, entry: Entry): Promise<boolean> => {
  const posted: string[] = [];
  const original = global.fetch;
  global.fetch = (async (url: string) => {
    posted.push(String(url));
    return { ok: true, status: 200 } as Response;
  }) as unknown as typeof fetch;

  const stream = new Subject<Entry>();
  const service = new AlertingService(
    { entryStream$: stream.asObservable() } as unknown as CollectorService,
    {
      alerting: { enabled: true, webhooks: [{ url: WEBHOOK, events }] },
    } as unknown as NestLensConfig,
  );

  service.onModuleInit();
  stream.next(entry);
  await new Promise((resolve) => setTimeout(resolve, 20));
  service.onModuleDestroy();
  global.fetch = original;

  return posted.length > 0;
};

const entry = (type: string, payload: Record<string, unknown>, id = 1): Entry =>
  ({ id, type, payload }) as unknown as Entry;

describe("events: 'failures'", () => {
  it.each([
    ['an exception', entry('exception', { name: 'Error', message: 'boom' }), true],
    ['a request that failed', entry('request', { statusCode: 503, path: '/a' }), true],
    ['an operation that failed', entry('graphql', { hasErrors: true, statusCode: 500 }), true],
    ['a job that failed', entry('job', { status: 'failed', name: 'email' }), true],
    ['a schedule that failed', entry('schedule', { status: 'failed', name: 'nightly' }), true],
    ['an error log', entry('log', { level: 'error', message: 'x' }), true],
    ['a request that worked', entry('request', { statusCode: 200, path: '/a' }), false],
    ['a request the caller got wrong', entry('request', { statusCode: 404, path: '/a' }), false],
    ['a query the caller got wrong', entry('graphql', { hasErrors: true, statusCode: 400 }), false],
    ['an operation that worked', entry('graphql', { hasErrors: false, statusCode: 200 }), false],
    ['a job that completed', entry('job', { status: 'completed', name: 'email' }), false],
    ['an ordinary log line', entry('log', { level: 'info', message: 'x' }), false],
    ['a query', entry('query', { query: 'SELECT 1', duration: 2 }), false],
  ])('%s: announced = %s', async (_name, candidate, expected) => {
    expect(await announced('failures', candidate)).toBe(expected);
  });

  it('leaves a list of types working as it did', async () => {
    expect(await announced(['query'], entry('query', { query: 'SELECT 1', duration: 2 }))).toBe(
      true,
    );
    expect(await announced(['query'], entry('exception', { name: 'Error', message: 'x' }))).toBe(
      false,
    );
  });

  it('still defaults to exceptions', async () => {
    const posted: string[] = [];
    const original = global.fetch;
    global.fetch = (async (url: string) => {
      posted.push(String(url));
      return { ok: true, status: 200 } as Response;
    }) as unknown as typeof fetch;

    const stream = new Subject<Entry>();
    const service = new AlertingService(
      { entryStream$: stream.asObservable() } as unknown as CollectorService,
      { alerting: { enabled: true, webhooks: [{ url: WEBHOOK }] } } as unknown as NestLensConfig,
    );
    service.onModuleInit();
    stream.next(entry('exception', { name: 'Error', message: 'boom' }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    service.onModuleDestroy();
    global.fetch = original;

    expect(posted).toEqual([WEBHOOK]);
  });
});
