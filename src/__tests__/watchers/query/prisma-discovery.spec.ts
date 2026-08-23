/**
 * The Prisma client a Nest application actually has.
 *
 * The query watcher looked at `global.prisma` and nowhere else — the singleton
 * pattern a Next.js application uses. A Nest application holds its client as a
 * provider: `PrismaService extends PrismaClient`, which is what this library's
 * own documentation and Prisma's Nest guide both show. That client was never
 * found, so *Database queries (TypeORM/Prisma auto-detected)* recorded
 * TypeORM's queries and none of Prisma's.
 *
 * The container knows every provider, and a client is recognisable by the
 * methods the watcher is about to call — which is how the TypeORM half has
 * always found its DataSources.
 */
import { DiscoveryService } from '@nestjs/core';
import { CollectorService } from '../../../core/collector.service';
import { NESTLENS_CONFIG, NestLensConfig } from '../../../nestlens.config';
import { QueryWatcher } from '../../../watchers/query/query.watcher';
import { Test } from '@nestjs/testing';

type Middleware = (
  params: { model?: string; action: string; args?: unknown },
  next: (params: unknown) => Promise<unknown>,
) => Promise<unknown>;

/** A `PrismaService extends PrismaClient`, as a Nest application registers it. */
const prismaService = () => {
  const middlewares: Middleware[] = [];

  return {
    client: {
      $use: (middleware: Middleware) => middlewares.push(middleware),
      $on: () => undefined,
    },
    run: async (model: string, action: string) => {
      for (const middleware of middlewares) {
        await middleware({ model, action, args: { where: { id: 1 } } }, async () => ({ id: 1 }));
      }
    },
    count: () => middlewares.length,
  };
};

const build = async (providers: unknown[]) => {
  const recorded: { query: string; source: string }[] = [];

  const collector = {
    collect: async (_type: string, payload: { query: string; source: string }) =>
      void recorded.push(payload),
    collectImmediate: async () => null,
  } as unknown as CollectorService;

  const moduleRef = await Test.createTestingModule({
    providers: [
      QueryWatcher,
      { provide: CollectorService, useValue: collector },
      { provide: NESTLENS_CONFIG, useValue: { watchers: { query: true } } as NestLensConfig },
      {
        provide: DiscoveryService,
        useValue: { getProviders: () => providers.map((instance) => ({ instance })) },
      },
    ],
  }).compile();

  const watcher = moduleRef.get(QueryWatcher);
  watcher.onApplicationBootstrap();

  return { watcher, recorded };
};

describe('a Prisma client registered as a provider', () => {
  it('is found', async () => {
    const service = prismaService();

    await build([service.client]);

    expect(service.count()).toBe(1);
  });

  it('records the queries that go through it', async () => {
    const service = prismaService();
    const { recorded } = await build([service.client]);

    await service.run('User', 'findMany');

    expect(recorded).toEqual([
      expect.objectContaining({ query: 'User.findMany', source: 'prisma' }),
    ]);
  });

  it('is attached once however many providers hold it', async () => {
    const service = prismaService();

    await build([service.client, service.client, { unrelated: true }]);

    expect(service.count()).toBe(1);
  });

  it('leaves a provider that is not a client alone', async () => {
    const service = prismaService();

    await build([{ save: () => undefined }, service.client]);

    expect(service.count()).toBe(1);
  });

  it('still finds a client on the global, as it always did', async () => {
    const service = prismaService();
    (global as Record<string, unknown>).prisma = service.client;

    try {
      await build([]);

      expect(service.count()).toBe(1);
    } finally {
      delete (global as Record<string, unknown>).prisma;
    }
  });

  it('does not attach twice when the global is also a provider', async () => {
    const service = prismaService();
    (global as Record<string, unknown>).prisma = service.client;

    try {
      await build([service.client]);

      expect(service.count()).toBe(1);
    } finally {
      delete (global as Record<string, unknown>).prisma;
    }
  });
});
