/**
 * The application still starts, whatever the watchers are set to.
 *
 * `watchers: { log: false }` did not start it. The module exported
 * `NestLensLogger` unconditionally while providing it only when the log watcher
 * was on, and Nest refuses to boot a module that exports a provider it does not
 * hold — `UnknownExportException`, before the first request, for turning off one
 * watcher.
 *
 * Cheap to check and easy to break again: the exports list is written a long
 * way from the conditions that fill the providers list, and every new watcher
 * adds another chance for the two to disagree. So every watcher is switched off
 * on its own here, rather than the one that happened to be broken.
 */
import { Test } from '@nestjs/testing';
import { NestLensModule } from '../../nestlens.module';
import { DEFAULT_CONFIG, NestLensConfig } from '../../nestlens.config';

const WATCHERS = Object.keys(DEFAULT_CONFIG.watchers ?? {});

const boots = async (config: NestLensConfig): Promise<void> => {
  const moduleRef = await Test.createTestingModule({
    imports: [NestLensModule.forRoot(config)],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  await app.close();
};

describe('watcher combinations', () => {
  jest.setTimeout(60_000);

  it('has a watcher list to work from', () => {
    expect(WATCHERS.length).toBeGreaterThanOrEqual(18);
  });

  it.each(WATCHERS)('starts with %s switched off', async (watcher) => {
    await expect(boots({ watchers: { [watcher]: false } })).resolves.toBeUndefined();
  });

  it.each(WATCHERS)('starts with %s given settings', async (watcher) => {
    // A settings block reaches a different branch than `true` does, and it is
    // the branch nobody tests by hand.
    await expect(boots({ watchers: { [watcher]: { enabled: true } } })).resolves.toBeUndefined();
  });

  it('starts with every watcher off', async () => {
    const off = Object.fromEntries(WATCHERS.map((name) => [name, false]));

    await expect(boots({ watchers: off })).resolves.toBeUndefined();
  });

  it('starts with every watcher on', async () => {
    const on = Object.fromEntries(WATCHERS.map((name) => [name, true]));

    await expect(boots({ watchers: on })).resolves.toBeUndefined();
  });

  /**
   * Closing and reopening, which is what a test suite and `nest start --hmr`
   * do all day. Eight watchers replace something on an object the application
   * owns; five of them never put it back, so each round stacked on the last —
   * three lifecycles against one axios instance left three request
   * interceptors, and one render through a view engine recorded three entries.
   *
   * `watchers-give-back.spec.ts` checks the shape of the code; this checks that
   * the application survives it, with everything switched on.
   */
  it('starts and closes three times over with every watcher on', async () => {
    const on = Object.fromEntries(WATCHERS.map((name) => [name, true]));

    for (let round = 0; round < 3; round += 1) {
      await expect(boots({ watchers: on })).resolves.toBeUndefined();
    }
  });

  it('leaves no timer holding the event loop', async () => {
    // A debugging tool is never the reason a process stays alive.
    const on = Object.fromEntries(WATCHERS.map((name) => [name, true]));
    await boots({ watchers: on });

    const holding = (
      process as unknown as {
        _getActiveHandles: () => { constructor: { name: string }; hasRef?: () => boolean }[];
      }
    )
      ._getActiveHandles()
      .filter((handle) => handle.constructor.name === 'Timeout' && handle.hasRef?.());

    expect(holding).toHaveLength(0);
  });

  it('starts when NestLens is disabled outright', async () => {
    await expect(boots({ enabled: false })).resolves.toBeUndefined();
  });
});
