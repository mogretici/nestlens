/**
 * A configured duration has to survive being handed to a timer.
 *
 * `setInterval` and `setTimeout` keep their delay in a signed 32-bit integer,
 * and Node's answer to anything larger is to fire after 1ms — every time. Two
 * settings are written in units that invite a large number:
 *
 * ```text
 * pruning.interval: 43200 minutes   ->  39 prunes in 50ms, each a full scan
 * alerting.timeoutMs: 3e9           ->  every delivery aborted after 1ms
 * ```
 *
 * The first is a self-inflicted outage on the application's own database; the
 * second silently stops every alert.
 */
import { Logger } from '@nestjs/common';
import { AlertingService } from '../../core/alerting.service';
import { CollectorService } from '../../core/collector.service';
import { PruningService } from '../../core/pruning.service';
import { NestLensConfig } from '../../nestlens.config';
import { StorageInterface } from '../../core/storage/storage.interface';

/** The delay each timer was actually given. */
const recordDelays = (): { intervals: number[]; timeouts: number[]; restore: () => void } => {
  const intervals: number[] = [];
  const timeouts: number[] = [];
  const realInterval = global.setInterval;
  const realTimeout = global.setTimeout;

  global.setInterval = ((handler: () => void, delay?: number) => {
    intervals.push(Number(delay));
    return { unref: () => undefined, ref: () => undefined } as unknown as NodeJS.Timeout;
  }) as unknown as typeof global.setInterval;

  global.setTimeout = ((handler: () => void, delay?: number) => {
    timeouts.push(Number(delay));
    return { unref: () => undefined, ref: () => undefined } as unknown as NodeJS.Timeout;
  }) as unknown as typeof global.setTimeout;

  return {
    intervals,
    timeouts,
    restore: () => {
      global.setInterval = realInterval;
      global.setTimeout = realTimeout;
    },
  };
};

const MAX_DELAY = 2 ** 31 - 1;

const storage = (): StorageInterface => ({ prune: async () => 0 }) as unknown as StorageInterface;

describe('a pruning interval longer than a timer can hold', () => {
  let timers: ReturnType<typeof recordDelays>;
  let warnings: string[];
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    timers = recordDelays();
    warnings = [];
    warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation((message: unknown) => void warnings.push(String(message)));
  });

  afterEach(() => {
    timers.restore();
    warnSpy.mockRestore();
  });

  const start = (interval: number): void => {
    new PruningService(
      { pruning: { enabled: true, interval } } as NestLensConfig,
      storage(),
    ).onModuleInit();
  };

  it('is scheduled at a delay the timer can hold', () => {
    start(43_200);

    expect(timers.intervals).toHaveLength(1);
    expect(timers.intervals[0]).toBeLessThanOrEqual(MAX_DELAY);
  });

  it('still prunes as rarely as it can rather than hourly', () => {
    start(43_200);

    // Falling back to the sixty-minute default would be the opposite of what
    // was asked for.
    expect(timers.intervals[0]).toBeGreaterThan(24 * 60 * 60 * 1000);
  });

  it('says what it did', () => {
    start(43_200);

    expect(warnings.join('\n')).toContain('pruning.interval');
  });

  it('leaves an ordinary interval alone', () => {
    start(60);

    expect(timers.intervals[0]).toBe(60 * 60 * 1000);
    expect(warnings).toHaveLength(0);
  });
});

describe('an alerting timeout longer than a timer can hold', () => {
  let timers: ReturnType<typeof recordDelays>;
  let fetched: number;

  beforeEach(() => {
    fetched = 0;
    global.fetch = (async () => {
      fetched += 1;
      return { ok: true, status: 200 } as Response;
    }) as unknown as typeof fetch;
    timers = recordDelays();
  });

  afterEach(() => {
    timers.restore();
  });

  const dispatch = async (timeoutMs: number): Promise<void> => {
    const service = new AlertingService(
      {
        entryStream$: { subscribe: () => ({ unsubscribe: () => undefined }) },
      } as unknown as CollectorService,
      {
        alerting: {
          enabled: true,
          timeoutMs,
          webhooks: [{ url: 'http://alerts.test/hook', type: 'generic', events: ['exception'] }],
        },
      } as unknown as NestLensConfig,
    );

    await (service as unknown as { dispatch: (entry: unknown) => Promise<void> }).dispatch({
      id: 1,
      type: 'exception',
      payload: { name: 'Error', message: 'x' },
    });
  };

  it('is given a delay the timer can hold', async () => {
    await dispatch(3_000_000_000);

    expect(timers.timeouts.every((delay) => delay <= MAX_DELAY)).toBe(true);
  });

  it('still delivers the alert', async () => {
    await dispatch(3_000_000_000);

    expect(fetched).toBe(1);
  });

  it('leaves an ordinary timeout alone', async () => {
    await dispatch(5_000);

    expect(timers.timeouts).toContain(5_000);
  });
});
