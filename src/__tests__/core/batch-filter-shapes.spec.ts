/**
 * What a `filterBatch` that is written wrongly costs.
 *
 * It is documented as failing open — "errors are logged but don't block
 * collection" — and a callback returning the wrong thing did the opposite. The
 * buffer is emptied before the callback runs, so `entries` became `undefined`,
 * reading its length threw out of `flush()`, and the whole batch was gone.
 * Measured on four shapes anyone might write: `undefined`, `null`, a single
 * entry, and a promise of `undefined` — every one recorded nothing, and kept
 * recording nothing for as long as the callback stayed.
 *
 * `forEach` where `filter` was meant returns `undefined`, which is how this
 * arrives in an application.
 */
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CollectorService } from '../../core/collector.service';
import { DataMaskerService } from '../../core/data-masker.service';
import { STORAGE, StorageInterface } from '../../core/storage/storage.interface';
import { NESTLENS_CONFIG, NestLensConfig } from '../../nestlens.config';
import { Entry } from '../../types';

const collectorWith = async (
  filterBatch: unknown,
): Promise<{ collector: CollectorService; saved: Entry[] }> => {
  const saved: Entry[] = [];

  const storage: Partial<StorageInterface> = {
    save: jest.fn(async (entry: Entry) => ({ ...entry, id: saved.length + 1 })),
    saveBatch: jest.fn(async (entries: Entry[]) => {
      saved.push(...entries);
      return entries.map((entry, index) => ({ ...entry, id: saved.length + index }));
    }),
    updateFamilyHash: jest.fn(),
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      CollectorService,
      { provide: STORAGE, useValue: storage },
      {
        provide: NESTLENS_CONFIG,
        useValue: { enabled: true, filterBatch } as NestLensConfig,
      },
      { provide: DataMaskerService, useValue: new DataMaskerService() },
    ],
  }).compile();

  return { collector: moduleRef.get(CollectorService), saved };
};

/** The message a log entry carries, whatever the union says about payloads. */
const messageOf = (entry: Entry): string => (entry.payload as { message: string }).message;

const record = async (collector: CollectorService, count = 1): Promise<void> => {
  for (let i = 0; i < count; i += 1) {
    await collector.collect('log', { level: 'info', message: `m${i}` } as never);
  }
  await collector.flush();
};

describe('a batch filter that does not return a list', () => {
  let warnings: string[];
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnings = [];
    warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation((message: unknown) => void warnings.push(String(message)));
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it.each([
    ['undefined', () => undefined],
    ['null', () => null],
    ['a single entry', (entries: Entry[]) => entries[0]],
    ['a promise of undefined', async () => undefined],
    ['a string', () => 'everything'],
  ])('keeps the entries when it returns %s', async (_shape, filterBatch) => {
    const { collector, saved } = await collectorWith(filterBatch);

    await record(collector, 3);

    expect(saved).toHaveLength(3);
    await collector.onModuleDestroy();
  });

  it('does not reject the flush', async () => {
    const { collector } = await collectorWith(() => undefined);

    await collector.collect('log', { level: 'info', message: 'x' } as never);

    await expect(collector.flush()).resolves.toBeUndefined();
    await collector.onModuleDestroy();
  });

  it('says what is wrong, once', async () => {
    const { collector } = await collectorWith(() => undefined);

    await record(collector);
    await record(collector);
    await record(collector);

    const reported = warnings.filter((warning) => warning.includes('filterBatch'));

    expect(reported).toHaveLength(1);
    expect(reported[0]).toContain('array of entries');
    await collector.onModuleDestroy();
  });

  it('still drops what a working filter drops', async () => {
    const { collector, saved } = await collectorWith((entries: Entry[]) =>
      entries.filter((entry) => messageOf(entry) !== 'm1'),
    );

    await record(collector, 3);

    expect(saved.map(messageOf)).toEqual(['m0', 'm2']);
    await collector.onModuleDestroy();
  });

  it('still keeps nothing when it returns an empty list', async () => {
    // An empty array is a decision, not a mistake, and is honoured.
    const { collector, saved } = await collectorWith(() => []);

    await record(collector, 3);

    expect(saved).toHaveLength(0);
    await collector.onModuleDestroy();
  });
});
