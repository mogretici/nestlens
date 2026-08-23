/**
 * Recording Prisma on the Prisma people are running.
 *
 * The integration was written against `$use`, the middleware API of Prisma 5
 * and earlier. Prisma removed it in 6.0 — the package does not carry it at all;
 * in 7 the name survives only in a list of words a model may not be called —
 * and client extensions took its place. So the setup this project documents
 * recorded nothing on either current major, and said `Invalid Prisma client
 * provided` about a client that was perfectly valid.
 *
 * The clients here are the two shapes rather than the real thing: `@prisma/client`
 * needs a generated schema to instantiate, and what is under test is which API
 * the watcher reaches for and what it does with the answer.
 */
import { Logger } from '@nestjs/common';
import { CollectorService } from '../../core/collector.service';
import { NestLensConfig } from '../../nestlens.config';
import { ModelEntry } from '../../types';
import { ModelWatcher } from '../../watchers/model.watcher';

interface Recorded {
  entries: ModelEntry['payload'][];
}

const watcherFor = (config: NestLensConfig = { watchers: { model: true } }) => {
  const recorded: Recorded = { entries: [] };

  const collector = {
    collect: async (_type: string, payload: ModelEntry['payload']) => {
      recorded.entries.push(payload);
    },
    collectImmediate: async () => null,
  } as unknown as CollectorService;

  return { watcher: new ModelWatcher(collector, config), recorded };
};

/** Prisma 6 and 7: `$extends`, no `$use`. */
const extensibleClient = () => {
  const calls: { args: unknown }[] = [];

  // The models exist before the extension as well as after it: a client
  // extension adds behaviour to the same API, and the type the watcher hands
  // back says so.
  const base = {
    user: {
      findMany: async (_args?: unknown): Promise<unknown> => [],
      create: async (_args?: unknown): Promise<unknown> => ({}),
    },
  };

  return {
    ...base,
    calls,
    $extends(extension: {
      query: {
        $allModels: {
          $allOperations: (operation: {
            model?: string;
            operation: string;
            args?: unknown;
            query: (args: unknown) => Promise<unknown>;
          }) => Promise<unknown>;
        };
      };
    }) {
      const hook = extension.query.$allModels.$allOperations;

      return {
        ...base,
        extended: true,
        user: {
          findMany: (args: unknown) =>
            hook({
              model: 'User',
              operation: 'findMany',
              args: args as { where?: unknown },
              query: async (passed: unknown) => {
                calls.push({ args: passed });
                return [{ id: 1 }, { id: 2 }];
              },
            }),
          create: (args: unknown) =>
            hook({
              model: 'User',
              operation: 'create',
              args: args as { where?: unknown },
              query: async () => {
                throw new Error('unique constraint');
              },
            }),
        },
      };
    },
  };
};

/** Prisma 5 and earlier: `$use`. */
const middlewareClient = () => {
  const installed: ((
    params: unknown,
    next: (p: unknown) => Promise<unknown>,
  ) => Promise<unknown>)[] = [];

  return {
    installed,
    $use(
      middleware: (params: unknown, next: (p: unknown) => Promise<unknown>) => Promise<unknown>,
    ) {
      installed.push(middleware);
    },
    run: (params: unknown, result: unknown) => installed[0](params, async () => result),
  };
};

describe('Prisma 6 and later, where middleware is gone', () => {
  it('records an operation', async () => {
    const { watcher, recorded } = watcherFor();
    const client = watcher.setupPrismaClient(extensibleClient());

    await client.user.findMany({ where: { id: 1 } });

    expect(recorded.entries).toHaveLength(1);
    expect(recorded.entries[0]).toMatchObject({
      source: 'prisma',
      entity: 'User',
      action: 'find',
      recordCount: 2,
    });
  });

  it('hands back the extended client, which is the one that records', async () => {
    const { watcher } = watcherFor();

    const client = watcher.setupPrismaClient(extensibleClient());

    expect((client as unknown as { extended?: boolean }).extended).toBe(true);
  });

  it('passes the query through untouched', async () => {
    const { watcher } = watcherFor();
    const original = extensibleClient();
    const client = watcher.setupPrismaClient(original);

    const rows = await client.user.findMany({ where: { id: 1 } });

    expect(rows).toEqual([{ id: 1 }, { id: 2 }]);
    expect(original.calls).toEqual([{ args: { where: { id: 1 } } }]);
  });

  it('records a failure and rethrows it', async () => {
    const { watcher, recorded } = watcherFor();
    const client = watcher.setupPrismaClient(extensibleClient());

    await expect(client.user.create({ data: {} })).rejects.toThrow('unique constraint');

    expect(recorded.entries[0]).toMatchObject({
      action: 'create',
      entity: 'User',
      error: 'unique constraint',
    });
  });

  it('leaves an ignored entity alone', async () => {
    const { watcher, recorded } = watcherFor({
      watchers: { model: { enabled: true, ignoreEntities: ['User'] } },
    });
    const client = watcher.setupPrismaClient(extensibleClient());

    await client.user.findMany({});

    expect(recorded.entries).toHaveLength(0);
  });
});

describe('Prisma 5 and earlier, where middleware is what there is', () => {
  it('still installs the middleware', async () => {
    const { watcher, recorded } = watcherFor();
    const client = middlewareClient();

    const returned = watcher.setupPrismaClient(client);

    expect(client.installed).toHaveLength(1);
    // The middleware goes into the client it was given, so that is the client.
    expect(returned).toBe(client);

    await client.run({ model: 'Order', action: 'update', args: { where: { id: 3 } } }, { id: 3 });

    expect(recorded.entries[0]).toMatchObject({ entity: 'Order', action: 'update' });
  });
});

describe('something that is neither', () => {
  it('says what it looked for instead of blaming the client', () => {
    const warnings: string[] = [];
    const spy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation((message: unknown) => void warnings.push(String(message)));

    const { watcher } = watcherFor();
    const plain = { user: {} };

    expect(watcher.setupPrismaClient(plain)).toBe(plain);
    expect(warnings.join('\n')).toContain('$extends');

    spy.mockRestore();
  });
});
