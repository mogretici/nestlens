/**
 * A watcher that borrows something has to give it back.
 *
 * Eight of them replace a method, install an interceptor or add a listener on
 * an object the application owns and keeps. Without a destroy hook a closed
 * application goes on recording through a collector that is gone, and a process
 * that builds the module more than once against the same object — tests,
 * `nest start --hmr` — stacks each round on the last. Measured at three
 * lifecycles, before this was closed:
 *
 *     axios instance      3 request and 3 response interceptors
 *     view engine         one render recorded 3 entries
 *     TypeORM subscriber  `afterLoad` never restored
 *     Bull queue          5 listeners per round
 *     EventEmitter2       one `onAny` per round
 *
 * It has been fixed three times now — five watchers in 0.8.11, three more, then
 * these five — because each round fixed the watchers somebody thought of. This
 * checks all of them at once, so the next watcher that borrows something is
 * caught by the suite rather than by a fourth round.
 */
import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

const WATCHERS = resolve(__dirname, '..', '..', 'watchers');

const watcherFiles = (): string[] =>
  readdirSync(WATCHERS).filter((file) => file.endsWith('.watcher.ts'));

/**
 * Whether a watcher writes to something it was handed.
 *
 * The shapes it can take: assigning to a property of an injected object,
 * adding an event listener, installing an axios interceptor, or going through
 * `WrappedMethods` — which exists for exactly this and is the preferred form.
 */
const borrowsFromHost = (source: string): boolean =>
  /new WrappedMethods\(/.test(source) ||
  /\.interceptors\.(?:request|response)\.use\(/.test(source) ||
  /\bonAny\(/.test(source) ||
  /this\.listen\(/.test(source) ||
  /\b\w+\.on\('/.test(source);

const declaresDestroy = (source: string): boolean =>
  /onModuleDestroy\s*\(/.test(source) && /implements[^{]*OnModuleDestroy/.test(source);

describe('watchers that borrow', () => {
  it('has watchers to check', () => {
    expect(watcherFiles().length).toBeGreaterThan(10);
  });

  it('every one that writes to a host object gives it back', () => {
    const borrowers = watcherFiles().filter((file) =>
      borrowsFromHost(readFileSync(join(WATCHERS, file), 'utf8')),
    );

    // If this drops to nothing the detector has stopped detecting.
    expect(borrowers.length).toBeGreaterThan(4);

    const withoutDestroy = borrowers.filter(
      (file) => !declaresDestroy(readFileSync(join(WATCHERS, file), 'utf8')),
    );

    expect(withoutDestroy).toEqual([]);
  });

  it('names the ones it is watching', () => {
    // Recorded so a reader can see the check is looking at real files rather
    // than at an empty list.
    const borrowers = watcherFiles().filter((file) =>
      borrowsFromHost(readFileSync(join(WATCHERS, file), 'utf8')),
    );

    expect(borrowers.sort()).toEqual(
      expect.arrayContaining([
        'batch.watcher.ts',
        'dump.watcher.ts',
        'event.watcher.ts',
        'gate.watcher.ts',
        'http-client.watcher.ts',
        'job.watcher.ts',
        'mail.watcher.ts',
        'model.watcher.ts',
        'schedule.watcher.ts',
        'view.watcher.ts',
      ]),
    );
  });
});
