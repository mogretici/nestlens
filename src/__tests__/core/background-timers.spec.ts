/**
 * NestLens must never be the reason a process stays alive.
 *
 * Two services run maintenance on a timer: the collector flushes its buffer,
 * the pruning service deletes old entries. Both used a plain `setInterval`,
 * which holds Node's event loop open — so an application that had finished its
 * work waited forever, and so did this test suite. In CI that meant a job with
 * no timeout billing GitHub's six-hour default instead of failing, repeatedly,
 * until it exhausted the account's minutes and queued every other repository
 * behind it. `--forceExit` hides this; unreferencing the timers fixes it.
 *
 * `hasRef()` is Node's own answer to "would this keep the process running".
 *
 * Following AAA (Arrange-Act-Assert).
 */
import { CollectorService } from '../../core/collector.service';
import { PruningService } from '../../core/pruning.service';
import { StorageInterface } from '../../core/storage/storage.interface';
import { NestLensConfig } from '../../nestlens.config';

const storage = {
  save: jest.fn().mockResolvedValue({}),
  saveBatch: jest.fn().mockResolvedValue([]),
  prune: jest.fn().mockResolvedValue(0),
  getStats: jest.fn().mockResolvedValue({ total: 0, byType: {} }),
} as unknown as StorageInterface;

const timerOf = (service: object, field: string): NodeJS.Timeout | undefined =>
  (service as unknown as Record<string, NodeJS.Timeout | undefined>)[field];

describe('background timers', () => {
  it("does not hold the process open for the collector's flush", () => {
    // Arrange & Act
    const collector = new CollectorService(storage, {} as NestLensConfig);

    // Assert
    const timer = timerOf(collector, 'flushTimer');
    expect(timer).toBeDefined();
    expect(timer?.hasRef()).toBe(false);
  });

  it('does not hold the process open for pruning', () => {
    // Arrange & Act
    const pruning = new PruningService(
      { pruning: { enabled: true, interval: 60 } } as NestLensConfig,
      storage,
    );
    (pruning as unknown as { onModuleInit: () => void }).onModuleInit();

    // Assert
    const timer = timerOf(pruning, 'intervalId');
    expect(timer).toBeDefined();
    expect(timer?.hasRef()).toBe(false);

    (pruning as unknown as { onModuleDestroy: () => void }).onModuleDestroy();
  });
});
