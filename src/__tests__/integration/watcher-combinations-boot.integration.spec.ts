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

  it('starts when NestLens is disabled outright', async () => {
    await expect(boots({ enabled: false })).resolves.toBeUndefined();
  });
});
