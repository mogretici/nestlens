/**
 * `undefined` in a configuration means "not configured", everywhere.
 *
 * The defaults are spread under what the application wrote, and a key written
 * with no value replaces the default with `undefined`. In `watchers` that
 * switched a watcher on; elsewhere it unset the default:
 *
 *     storage: { driver: undefined }       driver was undefined, not 'memory'
 *     pruning: { maxAge: undefined }       maxAge was undefined, not 24
 *     path: process.env.NESTLENS_PATH      unset variable, no mount point
 *
 * The last is how it is usually written.
 */
import { describe, it, expect } from 'vitest';
import { NestLensModule } from '../nestlens.module';
import { DEFAULT_CONFIG, NestLensConfig } from '../nestlens.config';

const merged = (config: NestLensConfig): NestLensConfig =>
  (NestLensModule as unknown as { mergeConfig: (c: NestLensConfig) => NestLensConfig }).mergeConfig(
    config,
  );

describe('a configuration key written without a value', () => {
  it('leaves a top-level default in place', () => {
    expect(merged({ path: undefined }).path).toBe(DEFAULT_CONFIG.path);
  });

  it('leaves the storage defaults in place', () => {
    const config = merged({ storage: { driver: undefined, maxEntries: undefined } });

    expect(config.storage?.driver).toBe('memory');
    expect(config.storage?.maxEntries).toBe(DEFAULT_CONFIG.storage?.maxEntries);
  });

  it('leaves the pruning defaults in place', () => {
    const config = merged({ pruning: { maxAge: undefined, interval: undefined } });

    expect(config.pruning?.maxAge).toBe(24);
    expect(config.pruning?.interval).toBe(60);
  });

  it('is left out deeper down as well', () => {
    const config = merged({ storage: { driver: 'redis', redis: { url: undefined, db: 1 } } });

    expect(config.storage?.redis).toEqual({ db: 1 });
    expect(Object.keys(config.storage?.redis ?? {})).toEqual(['db']);
  });

  it('leaves what a preset sets in place too', () => {
    const config = merged({ preset: 'failures-only', sampling: { rate: undefined } });

    expect(config.sampling?.rate).toBe(0);
  });

  it('touches neither arrays nor objects of a class', () => {
    class Options {
      readonly host = 'h';
      readonly port: number | undefined = undefined;
    }
    const server = new Options();
    const headers = ['x-secret', undefined as unknown as string];
    const config = merged({
      server: server as unknown as NestLensConfig['server'],
      security: { dataMasking: { sensitiveHeaders: headers } },
    });

    expect(config.server).toBe(server);
    expect(config.security?.dataMasking?.sensitiveHeaders).toBe(headers);
  });
});
