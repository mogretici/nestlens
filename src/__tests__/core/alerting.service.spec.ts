import { Subject } from 'rxjs';
import { AlertingService } from '../../core/alerting.service';
import { CollectorService } from '../../core/collector.service';
import { AlertingConfig, NestLensConfig } from '../../nestlens.config';
import { Entry, ExceptionEntry } from '../../types';

describe('AlertingService', () => {
  let stream: Subject<Entry>;
  let fetchMock: jest.Mock;
  let clock: number;

  const exceptionEntry = (overrides: Partial<ExceptionEntry['payload']> = {}): ExceptionEntry =>
    ({
      id: 1,
      type: 'exception',
      requestId: 'req-1',
      createdAt: new Date('2026-01-01').toISOString(),
      payload: {
        name: 'TypeError',
        message: 'boom',
        request: { method: 'GET', url: '/users' },
        ...overrides,
      },
    }) as ExceptionEntry;

  const createService = (alerting: AlertingConfig): AlertingService => {
    const collector = { entryStream$: stream.asObservable() } as unknown as CollectorService;
    const config: NestLensConfig = { alerting };
    return new AlertingService(collector, config, () => clock);
  };

  beforeEach(() => {
    stream = new Subject<Entry>();
    clock = 1_000_000;
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });

    (global as any).fetch = fetchMock;
  });

  afterEach(() => {
    stream.complete();
    jest.clearAllMocks();
  });

  const flush = (): Promise<void> => new Promise((r) => setImmediate(r));

  it('does not subscribe when alerting is disabled', () => {
    const service = createService({ enabled: false, webhooks: [{ url: 'https://x' }] });
    service.onModuleInit();

    stream.next(exceptionEntry());

    expect(fetchMock).not.toHaveBeenCalled();
    service.onModuleDestroy();
  });

  it('does not subscribe when there are no webhooks', () => {
    const service = createService({ enabled: true, webhooks: [] });
    service.onModuleInit();

    stream.next(exceptionEntry());

    expect(fetchMock).not.toHaveBeenCalled();
    service.onModuleDestroy();
  });

  it('posts a Slack-formatted payload on an exception', async () => {
    const service = createService({
      enabled: true,
      webhooks: [{ url: 'https://hooks.slack.com/x', type: 'slack' }],
    });
    service.onModuleInit();

    stream.next(exceptionEntry());
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://hooks.slack.com/x');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.text).toContain('TypeError');
    expect(body.text).toContain('boom');
    service.onModuleDestroy();
  });

  it('posts a Discord-formatted payload', async () => {
    const service = createService({
      enabled: true,
      webhooks: [{ url: 'https://discord/x', type: 'discord' }],
    });
    service.onModuleInit();

    stream.next(exceptionEntry());
    await flush();

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.content).toContain('TypeError');
    service.onModuleDestroy();
  });

  it('posts a generic structured payload by default', async () => {
    const service = createService({ enabled: true, webhooks: [{ url: 'https://generic/x' }] });
    service.onModuleInit();

    stream.next(exceptionEntry());
    await flush();

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.event).toBe('exception');
    expect(body.entry).toMatchObject({ id: 1, type: 'exception', title: 'TypeError' });
    service.onModuleDestroy();
  });

  it('ignores entry types not in the webhook events list', async () => {
    const service = createService({
      enabled: true,
      webhooks: [{ url: 'https://x', events: ['exception'] }],
    });
    service.onModuleInit();

    stream.next({ id: 2, type: 'request', payload: {} } as unknown as Entry);
    await flush();

    expect(fetchMock).not.toHaveBeenCalled();
    service.onModuleDestroy();
  });

  it('throttles repeated identical exceptions within the window', async () => {
    const service = createService({
      enabled: true,
      webhooks: [{ url: 'https://x', type: 'slack', throttleMs: 60_000 }],
    });
    service.onModuleInit();

    stream.next(exceptionEntry());
    await flush();
    // Same exception 10s later → throttled
    clock += 10_000;
    stream.next(exceptionEntry());
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    // After the window passes → sent again
    clock += 60_000;
    stream.next(exceptionEntry());
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    service.onModuleDestroy();
  });

  it('treats different exception messages as separate dedup keys', async () => {
    const service = createService({
      enabled: true,
      webhooks: [{ url: 'https://x', type: 'slack' }],
    });
    service.onModuleInit();

    stream.next(exceptionEntry({ message: 'first' }));
    stream.next(exceptionEntry({ message: 'second' }));
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    service.onModuleDestroy();
  });

  it('never throws into collection when a webhook delivery fails', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    const service = createService({
      enabled: true,
      webhooks: [{ url: 'https://x', type: 'slack' }],
    });
    service.onModuleInit();

    expect(() => stream.next(exceptionEntry())).not.toThrow();
    await flush();
    expect(fetchMock).toHaveBeenCalled();
    service.onModuleDestroy();
  });

  it('stops delivering after onModuleDestroy', async () => {
    const service = createService({
      enabled: true,
      webhooks: [{ url: 'https://x', type: 'slack' }],
    });
    service.onModuleInit();
    service.onModuleDestroy();

    stream.next(exceptionEntry());
    await flush();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
