/**
 * The ceiling an application configured is the ceiling the store gets.
 *
 * `storage.maxEntries` bounds every driver by size, and it did nothing at all.
 * The defaults carried a `storage.memory.maxEntries` of 10,000, the merge is
 * shallow, so that block was present for every application whether or not
 * anyone wrote it — and `resolveMaxEntries` prefers it, because it was the only
 * place the ceiling could be set before there was a driver-wide one. The
 * default therefore won against the option it is the default for:
 *
 *   { driver: 'sqlite', maxEntries: 100_000 }  ->  10,000
 *   { driver: 'redis',  maxEntries: 250_000 }  ->  10,000
 *   { maxEntries: 0 }  (documented as "keep everything")  ->  10,000
 *
 * Nothing said so. The store simply held ten thousand entries and the reader
 * wondered where the rest had gone.
 */
import { NestLensModule } from '../../../nestlens.module';
import { NESTLENS_CONFIG, NestLensConfig } from '../../../nestlens.config';
import { resolveMaxEntries } from '../../../core/storage/storage.factory';

/** The configuration the module actually provides, defaults merged in. */
const asProvided = (config: NestLensConfig): NestLensConfig => {
  const dynamic = NestLensModule.forRoot(config);
  const providers = [
    ...(dynamic.providers ?? []),
    ...(dynamic.imports ?? []).flatMap(
      (imported) => (imported as { providers?: unknown[] }).providers ?? [],
    ),
  ];

  const provided = providers.find(
    (provider) => (provider as { provide?: unknown }).provide === NESTLENS_CONFIG,
  ) as { useValue: NestLensConfig } | undefined;

  if (!provided) throw new Error('NestLens provided no configuration');

  return provided.useValue;
};

const ceilingFor = (config: NestLensConfig): number =>
  resolveMaxEntries(asProvided(config).storage ?? {});

describe('the configured entry ceiling', () => {
  it.each([
    ['sqlite', 100_000],
    ['memory', 100_000],
    ['redis', 250_000],
  ])('reaches the %s driver', (driver, maxEntries) => {
    expect(ceilingFor({ storage: { driver: driver as never, maxEntries } })).toBe(maxEntries);
  });

  it('keeps everything at zero rather than falling back to the default', () => {
    expect(ceilingFor({ storage: { driver: 'sqlite', maxEntries: 0 } })).toBe(0);
  });

  it('still honours the place it could be set before', () => {
    // `storage.memory.maxEntries` is years older than the driver-wide option
    // and still means the same thing, so an application that set it there is
    // not overruled.
    expect(ceilingFor({ storage: { memory: { maxEntries: 777 } } })).toBe(777);
  });

  it('defaults to ten thousand when nothing is configured', () => {
    expect(ceilingFor({})).toBe(10_000);
  });

  it('leaves the rest of the storage defaults alone', () => {
    const storage = asProvided({ storage: { maxEntries: 5 } }).storage ?? {};

    expect(storage.driver).toBe('memory');
    expect(storage.sqlite?.filename).toBe('.cache/nestlens.db');
    expect(storage.redis?.port).toBe(6379);
  });
});
