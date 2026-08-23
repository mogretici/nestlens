/**
 * Throttling has to key on what happened, not on which entry it was.
 *
 * `dedupKey` fell back to `${type}:${entry.id}` for everything except
 * exceptions. Ids are unique by construction, so every alert got a key of its
 * own and a sixty-second throttle discarded nothing: a destination configured
 * for `request` events received one delivery per request, and the map holding
 * the keys grew by one per request with nothing ever removing them.
 *
 * Measured before: 200 identical requests, 200 webhook calls, 201 keys kept.
 */
import { Subject } from 'rxjs';
import { AlertingService } from '../../core/alerting.service';
import { CollectorService } from '../../core/collector.service';
import { NestLensConfig } from '../../nestlens.config';
import { Entry } from '../../types';

/** Records deliveries instead of making them. */
const captureDeliveries = (): { urls: string[]; restore: () => void } => {
  const urls: string[] = [];
  const original = global.fetch;

  global.fetch = (async (url: string) => {
    urls.push(String(url));
    return { ok: true, status: 200 } as Response;
  }) as unknown as typeof fetch;

  return { urls, restore: () => (global.fetch = original) };
};

const WEBHOOK = 'http://alerts.test/hook';

const build = (events: string[], throttleMs = 60_000, now = () => Date.now()) => {
  const stream = new Subject<Entry>();
  const collector = { entryStream$: stream.asObservable() } as unknown as CollectorService;

  const service = new AlertingService(
    collector,
    {
      alerting: {
        enabled: true,
        webhooks: [{ url: WEBHOOK, type: 'generic', events, throttleMs }],
      },
    } as unknown as NestLensConfig,
    now,
  );

  service.onModuleInit();
  return { stream, service };
};

const request = (id: number, path = '/orders', statusCode = 500): Entry =>
  ({
    id,
    type: 'request',
    requestId: `r${id}`,
    payload: { method: 'GET', path, url: path, statusCode },
  }) as unknown as Entry;

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('alert throttling', () => {
  let deliveries: ReturnType<typeof captureDeliveries>;

  beforeEach(() => {
    deliveries = captureDeliveries();
  });

  afterEach(() => {
    deliveries.restore();
  });

  it('sends the first alert', async () => {
    const { stream, service } = build(['request']);

    stream.next(request(1));
    await settle();

    expect(deliveries.urls).toHaveLength(1);
    service.onModuleDestroy();
  });

  it('holds back the same alert arriving again', async () => {
    const { stream, service } = build(['request']);

    for (let i = 1; i <= 50; i += 1) {
      stream.next(request(i));
    }
    await settle();

    // Fifty failures of one endpoint are one thing worth being told about.
    expect(deliveries.urls).toHaveLength(1);
    service.onModuleDestroy();
  });

  it('still sends an alert about a different route', async () => {
    const { stream, service } = build(['request']);

    stream.next(request(1, '/orders'));
    stream.next(request(2, '/payments'));
    await settle();

    expect(deliveries.urls).toHaveLength(2);
    service.onModuleDestroy();
  });

  it('still sends an alert about a different outcome', async () => {
    const { stream, service } = build(['request']);

    stream.next(request(1, '/orders', 500));
    stream.next(request(2, '/orders', 503));
    await settle();

    expect(deliveries.urls).toHaveLength(2);
    service.onModuleDestroy();
  });

  it('sends again once the window has passed', async () => {
    let clock = 1_000;
    const { stream, service } = build(['request'], 60_000, () => clock);

    stream.next(request(1));
    await settle();

    clock += 61_000;
    stream.next(request(2));
    await settle();

    expect(deliveries.urls).toHaveLength(2);
    service.onModuleDestroy();
  });

  it('groups by family hash when the entry has one', async () => {
    const { stream, service } = build(['query']);

    // Two different queries, same family — one alert.
    stream.next({ id: 1, type: 'query', familyHash: 'fam-a', payload: {} } as unknown as Entry);
    stream.next({ id: 2, type: 'query', familyHash: 'fam-a', payload: {} } as unknown as Entry);
    stream.next({ id: 3, type: 'query', familyHash: 'fam-b', payload: {} } as unknown as Entry);
    await settle();

    expect(deliveries.urls).toHaveLength(2);
    service.onModuleDestroy();
  });

  it('does not accumulate a key per alert', async () => {
    const { stream, service } = build(['request']);

    for (let i = 1; i <= 300; i += 1) {
      stream.next(request(i));
    }
    await settle();

    const keys = (service as unknown as { lastSent: Map<string, number> }).lastSent;

    // One route, one outcome, one key — not three hundred.
    expect(keys.size).toBe(1);
    service.onModuleDestroy();
  });

  it('forgets keys whose window has closed', async () => {
    let clock = 1_000;
    const { stream, service } = build(['request'], 1_000, () => clock);
    const keys = (service as unknown as { lastSent: Map<string, number> }).lastSent;

    // Enough distinct routes to pass the sweep threshold.
    for (let i = 0; i < 5_100; i += 1) {
      stream.next(request(i, `/route-${i}`));
    }
    await settle();

    const beforeSweep = keys.size;

    // Move past every window, then send one more to trigger the sweep.
    clock += 10_000;
    stream.next(request(999_999, '/one-more'));
    await settle();

    expect(beforeSweep).toBeGreaterThan(0);
    expect(keys.size).toBeLessThan(beforeSweep);
    service.onModuleDestroy();
  }, 20_000);

  it('never grows past its ceiling', async () => {
    const { stream, service } = build(['request'], 600_000);
    const keys = (service as unknown as { lastSent: Map<string, number> }).lastSent;

    // Every key live, all distinct, more than the ceiling allows.
    for (let i = 0; i < 6_000; i += 1) {
      stream.next(request(i, `/route-${i}`));
    }
    await settle();

    expect(keys.size).toBeLessThanOrEqual(5_000);
    service.onModuleDestroy();
  }, 20_000);
});
