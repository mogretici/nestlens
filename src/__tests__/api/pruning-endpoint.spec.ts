/**
 * The endpoint has to prune by the same rules as the timer.
 *
 * `POST pruning/run` computed its own window from `config.pruning.maxAge`,
 * which the service does not take at face value — a duration has to be
 * positive, and a non-positive one is a mistake it refuses and replaces with
 * the twenty-four hour default. The endpoint honoured it. Measured, against
 * five entries recorded two seconds earlier:
 *
 * ```text
 * maxAge: 0    ->  service keeps everything, endpoint deleted all five
 * maxAge: -5   ->  service keeps everything, endpoint deleted all five
 * ```
 *
 * `pruning/status` had the same split, reporting the written value rather than
 * the one in effect, and its `lastRun` was written by the endpoint alone: a
 * server that had pruned hourly for a month still reported that pruning had
 * never run.
 */
import { CollectorService } from '../../core/collector.service';
import { MemoryStorage } from '../../core/storage/memory.storage';
import { NestLensApiController } from '../../api/api.controller';
import { NestLensConfig } from '../../nestlens.config';
import { PruningService } from '../../core/pruning.service';
import { StorageInterface } from '../../core/storage/storage.interface';

const OLDER_THAN_A_MOMENT = 2_000;

const build = async (
  maxAge?: number,
  interval?: number,
): Promise<{ controller: NestLensApiController; storage: StorageInterface }> => {
  const storage = new MemoryStorage({});
  await storage.initialize();

  for (let i = 0; i < 5; i += 1) {
    await storage.save({
      type: 'log',
      payload: { level: 'info', message: `m${i}` },
      createdAt: new Date(Date.now() - OLDER_THAN_A_MOMENT).toISOString(),
    } as never);
  }

  const config = { pruning: { enabled: true, maxAge, interval } } as NestLensConfig;

  return {
    controller: new NestLensApiController(
      storage,
      config,
      new PruningService(config, storage),
      {} as CollectorService,
    ),
    storage,
  };
};

describe('running pruning from the API', () => {
  it.each([
    ['zero', 0],
    ['negative', -5],
  ])('keeps every entry when maxAge is %s', async (_name, maxAge) => {
    const { controller, storage } = await build(maxAge);

    await controller.runPruning();

    expect(await storage.count()).toBe(5);
    await storage.close();
  });

  it('still prunes what is past a real window', async () => {
    const { controller, storage } = await build(1 / 3600 / 2);

    const result = await controller.runPruning();

    expect(result.data.deleted).toBe(5);
    expect(await storage.count()).toBe(0);
    await storage.close();
  });

  it('keeps what is inside the window', async () => {
    const { controller, storage } = await build(24);

    await controller.runPruning();

    expect(await storage.count()).toBe(5);
    await storage.close();
  });

  it('reports when it ran and when it is next due', async () => {
    const { controller, storage } = await build(24);

    const result = await controller.runPruning();

    expect(result.data.lastRun).toEqual(expect.any(String));
    expect(new Date(result.data.nextRun as string).getTime()).toBeGreaterThan(Date.now());
    await storage.close();
  });
});

describe('the pruning status', () => {
  it('reports the window in effect rather than the one written', async () => {
    const { controller, storage } = await build(0);

    const status = await controller.getPruningStatus();

    expect(status.data.maxAge).toBe(24);
    await storage.close();
  });

  it('reports the interval in effect rather than the one written', async () => {
    // Longer than a timer can hold; the service prunes as rarely as it can.
    const { controller, storage } = await build(24, 43_200);

    const status = await controller.getPruningStatus();

    expect(status.data.interval).toBeLessThan(43_200);
    expect(status.data.interval).toBeGreaterThan(24 * 60);
    await storage.close();
  });

  it('reports a run the timer started, not only one the reader asked for', async () => {
    const { controller, storage } = await build(24);
    const service = (controller as unknown as { pruningService: PruningService }).pruningService;

    await service.pruneNow();
    const status = await controller.getPruningStatus();

    expect(status.data.lastRun).toEqual(expect.any(String));
    await storage.close();
  });
});
