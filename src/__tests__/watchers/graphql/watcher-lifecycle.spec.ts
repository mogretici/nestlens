/**
 * What the watcher says when it cannot start.
 *
 * It had two initialisers running the same eight steps, one `async` and one
 * not, and they had drifted: the lazy one — reached through `getPlugin()`,
 * which is how a project wires the plugin by hand — returned silently when no
 * GraphQL server could be found. The caller got an empty plugin object and no
 * reason for it, which presents as "the watcher is enabled and records
 * nothing".
 */
import { Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { CollectorService } from '../../../core/collector.service';
import { GraphQLWatcher } from '../../../watchers/graphql/graphql.watcher';
import { NestLensConfig } from '../../../nestlens.config';

const collector = {
  collect: async () => undefined,
  collectImmediate: async () => null,
} as unknown as CollectorService;

const moduleRef = { get: () => undefined } as unknown as ModuleRef;

const build = (config: Partial<NestLensConfig> = {}): GraphQLWatcher =>
  new GraphQLWatcher(
    collector,
    { watchers: { graphql: true }, ...config } as NestLensConfig,
    moduleRef,
  );

/** Captures what the watcher logged, at every level. */
const captureLogs = (): { lines: string[]; restore: () => void } => {
  const lines: string[] = [];
  const spies = (['log', 'warn', 'error', 'debug'] as const).map((level) =>
    jest.spyOn(Logger.prototype, level).mockImplementation((...args: unknown[]) => {
      lines.push(String(args[0]));
    }),
  );

  return { lines, restore: () => spies.forEach((spy) => spy.mockRestore()) };
};

describe('starting the GraphQL watcher', () => {
  let logs: ReturnType<typeof captureLogs>;

  beforeEach(() => {
    logs = captureLogs();
  });

  afterEach(() => {
    logs.restore();
  });

  it('says which server it found', () => {
    const watcher = build();

    watcher.onModuleInit();

    expect(watcher.isInitialized()).toBe(true);
    expect(logs.lines.join('\n')).toMatch(/initialized with (apollo|mercurius) adapter/);
    watcher.destroy();
  });

  it('says it is disabled when it is', () => {
    const watcher = build({ watchers: { graphql: false } });

    watcher.onModuleInit();

    expect(watcher.isInitialized()).toBe(false);
    expect(logs.lines.join('\n')).toContain('disabled');
  });

  describe('when no server can be found', () => {
    const noServer = { watchers: { graphql: { server: 'none' as never } } };

    it('says so on startup', () => {
      build(noServer as Partial<NestLensConfig>).onModuleInit();

      expect(logs.lines.join('\n')).toContain('No GraphQL server detected');
    });

    it('says so through getPlugin too, rather than returning nothing quietly', () => {
      // This is the path a manual integration takes.
      const watcher = build(noServer as Partial<NestLensConfig>);

      expect(watcher.getPlugin()).toEqual({});
      expect(logs.lines.join('\n')).toContain('No GraphQL server detected');
    });
  });

  it('starts once, however many times it is asked', () => {
    const watcher = build();

    watcher.onModuleInit();
    watcher.getPlugin();
    watcher.getPlugin();

    const started = logs.lines.filter((line) => line.includes('initialized with'));
    expect(started).toHaveLength(1);
    watcher.destroy();
  });

  it('starts from getPlugin when nothing else has started it', () => {
    const watcher = build();

    watcher.getPlugin();

    expect(watcher.isInitialized()).toBe(true);
    expect(watcher.getAdapter()).toBeDefined();
    watcher.destroy();
  });

  it('gives everything back when destroyed', () => {
    const watcher = build();
    watcher.onModuleInit();

    watcher.destroy();

    expect(watcher.isInitialized()).toBe(false);
    expect(watcher.getAdapter()).toBeUndefined();
    expect(watcher.getSubscriptionTracker()).toBeUndefined();
  });

  it('can be destroyed without having started', () => {
    expect(() => build().destroy()).not.toThrow();
  });

  it('reports what it is doing', () => {
    const watcher = build();
    watcher.onModuleInit();

    const stats = watcher.getStats();

    expect(stats.initialized).toBe(true);
    expect(stats.adapterType).toMatch(/apollo|mercurius/);
    expect(stats.registrationMode).toBe('pending');
    watcher.destroy();
  });
});
