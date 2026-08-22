/**
 * A BullMQ job that is removed when it completes still has to be recorded.
 *
 * `removeOnComplete` is the ordinary production setting: BullMQ deletes the
 * job as it finishes, and the `completed` event arrives after that. The
 * watcher fetched the job to build its entry, found nothing, and returned —
 * so nothing past `active` was ever recorded:
 *
 * ```text
 * 100 jobs run to completion  ->  100 active entries, 0 completed
 * ```
 *
 * Every job on the page sat unfinished forever, and the map remembering when
 * each started was never emptied either — one entry per job, for the life of
 * the process.
 */
import { CollectorService } from '../../core/collector.service';
import { JobWatcher } from '../../watchers/job.watcher';
import { NestLensConfig } from '../../nestlens.config';

interface Listener {
  (args: unknown): void | Promise<void>;
}

/** A BullMQ queue whose jobs are gone the moment they finish. */
const removingQueue = () => {
  const jobs = new Map<string, { id: string; name: string; data: unknown }>();
  const listeners = new Map<string, Listener[]>();

  return {
    queue: {
      name: 'orders',
      getJob: async (id: string) => jobs.get(id) ?? null,
    },
    events: {
      on(event: string, listener: Listener) {
        listeners.set(event, [...(listeners.get(event) ?? []), listener]);
        return this;
      },
      off() {
        return this;
      },
    },
    async run(id: string, name: string): Promise<void> {
      jobs.set(id, { id, name, data: { order: id } });

      for (const listener of listeners.get('active') ?? []) await listener({ jobId: id });

      // BullMQ removes the job, then announces that it finished.
      jobs.delete(id);

      for (const listener of listeners.get('completed') ?? []) {
        await listener({ jobId: id, returnvalue: '{"ok":true}' });
      }
    },
    /** A job that starts and never reports an end: stalled, or an event lost. */
    async start(id: string, name: string): Promise<void> {
      jobs.set(id, { id, name, data: { order: id } });

      for (const listener of listeners.get('active') ?? []) await listener({ jobId: id });
    },
    async fail(id: string, name: string): Promise<void> {
      jobs.set(id, { id, name, data: { order: id } });

      for (const listener of listeners.get('active') ?? []) await listener({ jobId: id });

      jobs.delete(id);

      for (const listener of listeners.get('failed') ?? []) {
        await listener({ jobId: id, failedReason: 'card declined' });
      }
    },
  };
};

const build = () => {
  const collected: { status: string; name: string; duration?: number }[] = [];
  const collector = {
    collect: async (_type: string, payload: { status: string; name: string; duration?: number }) =>
      void collected.push(payload),
    collectImmediate: async () => null,
  } as unknown as CollectorService;

  const watcher = new JobWatcher(collector, {
    watchers: { job: true },
  } as unknown as NestLensConfig);

  return { watcher, collected };
};

describe('a job BullMQ removes as it completes', () => {
  it('is recorded as completed', async () => {
    const { watcher, collected } = build();
    const bull = removingQueue();
    watcher.setupQueueWithEvents(bull.queue, bull.events, 'orders');

    await bull.run('1', 'send-receipt');

    expect(collected.map((entry) => entry.status)).toEqual(['active', 'completed']);
  });

  it('keeps the name it had when it started', async () => {
    const { watcher, collected } = build();
    const bull = removingQueue();
    watcher.setupQueueWithEvents(bull.queue, bull.events, 'orders');

    await bull.run('1', 'send-receipt');

    expect(collected[1].name).toBe('send-receipt');
  });

  it('carries a duration', async () => {
    const { watcher, collected } = build();
    const bull = removingQueue();
    watcher.setupQueueWithEvents(bull.queue, bull.events, 'orders');

    await bull.run('1', 'send-receipt');

    expect(collected[1].duration).toEqual(expect.any(Number));
  });

  it('is recorded as failed when it fails', async () => {
    const { watcher, collected } = build();
    const bull = removingQueue();
    watcher.setupQueueWithEvents(bull.queue, bull.events, 'orders');

    await bull.fail('1', 'charge-card');

    expect(collected.map((entry) => entry.status)).toEqual(['active', 'failed']);
  });

  it('remembers nothing about it afterwards', async () => {
    const { watcher } = build();
    const bull = removingQueue();
    watcher.setupQueueWithEvents(bull.queue, bull.events, 'orders');

    for (let i = 0; i < 100; i += 1) await bull.run(String(i), 'send-receipt');

    const tracking = (watcher as unknown as { jobTracking: Map<string, unknown> }).jobTracking;
    expect(tracking.size).toBe(0);
  });
});

describe('jobs that never report an end', () => {
  it('does not remember them without limit', async () => {
    const { watcher } = build();
    const bull = removingQueue();
    watcher.setupQueueWithEvents(bull.queue, bull.events, 'orders');

    const tracking = (watcher as unknown as { jobTracking: Map<string, unknown> }).jobTracking;

    // Stalled, removed, or an event lost with a connection.
    for (let i = 0; i < 10_050; i += 1) {
      await bull.start(`stalled-${i}`, 'x');
    }

    expect(tracking.size).toBeLessThanOrEqual(10_000);
  });
});
