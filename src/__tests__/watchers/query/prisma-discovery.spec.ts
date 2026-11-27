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
import { describe, it, expect, vi } from 'vitest';
import { DiscoveryService } from '@nestjs/core';
import { CollectorService } from '../../../core/collector.service';
import { NESTLENS_CONFIG, NestLensConfig } from '../../../nestlens.config';
import { QueryWatcher } from '../../../watchers/query/query.watcher';
import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';

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

/**
 * Prisma 6.14.0 removed `$use` and 7 kept it removed, so the middleware above has
 * nothing to install into and the watcher recorded no Prisma query at all,
 * silently. What both majors still offer is the `query` log event — the SQL,
 * its parameters and its duration — which a client emits when it was built
 * with query logging. Measured against @prisma/client 6.19.3 and 7.10.1:
 *
 *     new PrismaClient()                                   no event, _engineConfig {}
 *     new PrismaClient({ log: ['query'] })                 event, logQueries: true
 *     new PrismaClient({ log: [{ emit: 'event', ... }] })  event, logQueries: true
 *
 * The shapes below are those clients'.
 */
const prismaSixClient = (logQueries: boolean) => {
  const listeners: Array<(event: unknown) => void> = [];

  return {
    client: {
      $on: (event: string, listener: (event: unknown) => void) => {
        if (event === 'query') listeners.push(listener);
      },
      $extends: () => ({}),
      _engineConfig: logQueries ? { logQueries: true } : {},
    },
    emit: (event: unknown) => listeners.forEach((listener) => listener(event)),
    count: () => listeners.length,
  };
};

describe('a Prisma 6.14+ or 7 client, which has no $use', () => {
  it('is recorded from its query events', async () => {
    const prisma = prismaSixClient(true);
    const { recorded } = await build([prisma.client]);

    prisma.emit({
      query: 'SELECT `main`.`User`.`id` FROM `main`.`User` WHERE `main`.`User`.`name` = ?',
      params: '["x"]',
      duration: 3,
      target: 'quaint::connector::metrics',
    });

    expect(recorded).toEqual([
      expect.objectContaining({
        query: 'SELECT `main`.`User`.`id` FROM `main`.`User` WHERE `main`.`User`.`name` = ?',
        parameters: ['x'],
        duration: 3,
        source: 'prisma',
      }),
    ]);
  });

  it('is subscribed to once however many providers hold it', async () => {
    const prisma = prismaSixClient(true);

    await build([prisma.client, prisma.client]);

    expect(prisma.count()).toBe(1);
  });

  it('says once, and exactly how, when the client was built without query logging', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    try {
      await build([prismaSixClient(false).client, prismaSixClient(false).client]);

      const said = warn.mock.calls.map(([message]) => String(message));
      expect(said).toHaveLength(1);
      expect(said[0]).toContain("log: [{ emit: 'event', level: 'query' }]");
      expect(said[0]).toContain('2 Prisma client');
    } finally {
      warn.mockRestore();
    }
  });

  it('says nothing about a client whose configuration it cannot read', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const prisma = prismaSixClient(false);
    delete (prisma.client as { _engineConfig?: unknown })._engineConfig;

    try {
      await build([prisma.client]);

      expect(warn).not.toHaveBeenCalled();
      expect(prisma.count()).toBe(1);
    } finally {
      warn.mockRestore();
    }
  });

  it('names both ways of turning query logging on', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    try {
      await build([prismaSixClient(false).client]);

      expect(String(warn.mock.calls[0]?.[0])).toContain("log: ['query']");
    } finally {
      warn.mockRestore();
    }
  });

  it('says nothing when query logging is on', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    try {
      await build([prismaSixClient(true).client]);

      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
