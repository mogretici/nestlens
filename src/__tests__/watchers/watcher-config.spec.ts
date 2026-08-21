/**
 * Configuring a watcher must not switch it off.
 *
 * Every watcher accepts `true`, `false` or a block of settings, and each one
 * used to unpack that with:
 *
 *     typeof configured === 'object' ? configured : { enabled: configured !== false }
 *
 * A settings block carries no `enabled`, so `enabled` came out `undefined` and
 * the watcher's opening `if (!this.config.enabled) return` sent it straight
 * home. `watchers: { request: { ignorePaths: ['/health'] } }` recorded nothing,
 * silently, and the four watchers that are on by default were all affected.
 *
 * The invariant these pin: only `false` and `{ enabled: false }` turn a watcher
 * off. Everything else leaves it running.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { LogWatcherConfig, QueryWatcherConfig, RequestWatcherConfig } from '../../nestlens.config';
import { resolveWatcherConfig } from '../../watchers/watcher-config';

describe('watcher configuration', () => {
  describe('resolveWatcherConfig', () => {
    it('runs when nothing is configured', () => {
      expect(resolveWatcherConfig(undefined).enabled).toBe(true);
    });

    it('runs when switched on', () => {
      expect(resolveWatcherConfig(true).enabled).toBe(true);
    });

    it('stops when switched off', () => {
      expect(resolveWatcherConfig(false).enabled).toBe(false);
    });

    it('runs when given settings and no verdict on running', () => {
      // The regression, in one line.
      expect(resolveWatcherConfig<RequestWatcherConfig>({ maxBodySize: 0 }).enabled).toBe(true);
    });

    it('stops when the settings say so', () => {
      expect(
        resolveWatcherConfig<RequestWatcherConfig>({ enabled: false, maxBodySize: 0 }).enabled,
      ).toBe(false);
    });

    it('keeps the settings it was given', () => {
      expect(
        resolveWatcherConfig<RequestWatcherConfig>({ maxBodySize: 0, captureBody: false }),
      ).toEqual({
        enabled: true,
        maxBodySize: 0,
        captureBody: false,
      });
    });

    it('keeps a watcher default that the settings do not mention', () => {
      // `minLevel` and `slowThreshold` used to be applied only on the boolean
      // path, so configuring anything else dropped them too.
      expect(
        resolveWatcherConfig<LogWatcherConfig & RequestWatcherConfig>(
          { ignorePaths: [] },
          { minLevel: 'log' },
        ),
      ).toEqual({
        enabled: true,
        ignorePaths: [],
        minLevel: 'log',
      });
    });

    it('lets the settings override a default', () => {
      expect(
        resolveWatcherConfig<LogWatcherConfig>({ minLevel: 'warn' }, { minLevel: 'log' }).minLevel,
      ).toBe('warn');
    });

    it('applies the defaults on the boolean path as well', () => {
      expect(resolveWatcherConfig<QueryWatcherConfig>(true, { slowThreshold: 100 })).toEqual({
        enabled: true,
        slowThreshold: 100,
      });
    });

    it('treats null as absent rather than as a settings block', () => {
      // `typeof null === 'object'`, which the hand-rolled version spread into
      // `{ ...null }` and then read `enabled` off.
      expect(resolveWatcherConfig(null as unknown as undefined).enabled).toBe(true);
    });
  });

  describe('every watcher resolves its config through it', () => {
    /**
     * Read from the source rather than exercised one watcher at a time.
     *
     * Sixteen watchers had the same bug because sixteen copies of the same
     * three lines drifted from the one that was right. A test that asserts on
     * one watcher would not have caught the other fifteen, and a new watcher
     * copied from an old one would reintroduce it. This fails the moment a
     * watcher unpacks its own config again.
     */
    const watcherDir = join(__dirname, '../../watchers');

    const watcherFiles = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = join(dir, entry.name);

        if (entry.isDirectory()) return watcherFiles(full);
        return entry.name.endsWith('.watcher.ts') ? [full] : [];
      });

    const files = watcherFiles(watcherDir);

    it('finds the watchers to check', () => {
      expect(files.length).toBeGreaterThanOrEqual(18);
    });

    it.each(files.map((file) => [file.slice(watcherDir.length + 1), file]))(
      '%s does not unpack `boolean | object` by hand',
      (_name, file) => {
        const source = readFileSync(file, 'utf8');

        expect(source).not.toMatch(/typeof\s+\w*[Cc]onfig\s*===\s*'object'\s*\?/);
      },
    );
  });
});
