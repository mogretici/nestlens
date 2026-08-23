/**
 * A hook's answer counts whether or not it arrived in a native promise.
 *
 * `instanceof Promise` answers a narrower question than the one being asked: a
 * promise from Bluebird, from Prisma's fluent API or from another realm is a
 * thenable that is not an instance of this realm's `Promise`. TypeScript
 * accepts every one of them where `Promise<boolean>` is declared, because the
 * type is structural — so the declared contract permits exactly the values the
 * check missed, and the object itself was used as the answer:
 *
 * ```text
 * canAccess:   () => thenable(false)     ->  access granted
 * filterBatch: () => thenable([entry])   ->  TypeError, then nothing recorded
 * ```
 *
 * The first is an authorization hook answering the opposite of what it was
 * written to say. The second assigned the thenable itself and handed it to the
 * storage: `entries is not iterable`, which the collector reads as storage
 * being down — so one batch filter written that way stopped recording
 * altogether.
 *
 * Where the value is *returned* from an `async` function the mistake is
 * invisible, because that resolves a thenable on the way out. `filter` is of
 * that kind and was never wrong; it is checked here so it stays that way.
 */
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { CollectorService } from '../../core/collector.service';
import { MemoryStorage } from '../../core/storage/memory.storage';
import { NestLensConfig } from '../../nestlens.config';
import { NestLensGuard } from '../../api/api.guard';

/** What Bluebird and Prisma hand back: a thenable that is not a `Promise`. */
const thenable = <T>(value: T): PromiseLike<T> => ({
  then: <R>(resolve?: ((value: T) => R | PromiseLike<R>) | null): PromiseLike<R> =>
    thenable(resolve ? (resolve(value) as R) : (undefined as R)),
});

const context = (): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ headers: {}, ip: '127.0.0.1', socket: {} }),
    }),
  }) as unknown as ExecutionContext;

const guardWith = (canAccess: () => unknown): NestLensGuard =>
  new NestLensGuard({
    authorization: { canAccess },
  } as unknown as NestLensConfig);

describe('an authorization hook that answers through a thenable', () => {
  it('refuses when it says no', async () => {
    const guard = guardWith(() => thenable(false));

    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows when it says yes', async () => {
    const guard = guardWith(() => thenable(true));

    await expect(guard.canActivate(context())).resolves.toBe(true);
  });

  it('takes a user object it resolves to', async () => {
    const guard = guardWith(() => thenable({ id: 1, roles: ['admin'] }));

    await expect(guard.canActivate(context())).resolves.toBe(true);
  });

  it('still refuses a plain false', async () => {
    const guard = guardWith(() => false);

    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('still allows a native promise', async () => {
    const guard = guardWith(async () => true);

    await expect(guard.canActivate(context())).resolves.toBe(true);
  });
});

describe('a batch filter that answers through a thenable', () => {
  const recordBatch = async (filterBatch: (entries: unknown[]) => unknown): Promise<number> => {
    const storage = new MemoryStorage({});
    await storage.initialize();

    const collector = new CollectorService(storage, { filterBatch } as unknown as NestLensConfig);
    for (let i = 0; i < 5; i += 1) {
      await collector.collect('log', { level: 'info', message: `m${i}` } as never);
    }
    await collector.flush();

    const count = await storage.count();
    await collector.onModuleDestroy();
    await storage.close();

    return count;
  };

  it('records what it kept', async () => {
    expect(await recordBatch((entries) => thenable(entries.slice(0, 1)))).toBe(1);
  });

  it('records nothing when it keeps nothing', async () => {
    expect(await recordBatch(() => thenable([]))).toBe(0);
  });

  it('still records everything a plain array keeps', async () => {
    expect(await recordBatch((entries) => entries)).toBe(5);
  });
});

describe('an entry filter that answers through a thenable', () => {
  const record = async (filter: () => unknown): Promise<number> => {
    const storage = new MemoryStorage({});
    await storage.initialize();

    const collector = new CollectorService(storage, { filter } as unknown as NestLensConfig);
    await collector.collect('log', { level: 'info', message: 'x' } as never);
    await collector.flush();

    const count = await storage.count();
    await collector.onModuleDestroy();
    await storage.close();

    return count;
  };

  it('keeps the entry out when it says no', async () => {
    expect(await record(() => thenable(false))).toBe(0);
  });

  it('lets the entry through when it says yes', async () => {
    expect(await record(() => thenable(true))).toBe(1);
  });

  it('still honours a plain false', async () => {
    expect(await record(() => false)).toBe(0);
  });

  it('still honours a native promise', async () => {
    expect(await record(async () => false)).toBe(0);
  });
});
