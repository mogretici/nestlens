/**
 * The @Plugin() provider works whichever hook runs first.
 *
 * Apollo starts inside GraphQLModule's onModuleInit and calls the plugin's
 * serverWillStart there. On NestJS 11 and 12 global modules run their hooks
 * first, so the provider's own onModuleInit had already set it up; on NestJS
 * 10.4 they get no such distance, and with GraphQLModule imported before
 * NestLensModule Apollo started first. The provider then had no plugin yet,
 * returned without marking anything, and the watcher reported `waiting` while
 * it recorded. Measured on @nestjs/core 10.4.22 with @nestjs/apollo 12.2.2.
 *
 * Following AAA (Arrange-Act-Assert).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Logger } from '@nestjs/common';
import { ApolloServer, ApolloServerPlugin } from '@apollo/server';
import { ModuleRef } from '@nestjs/core';
import { GraphQLWatcher } from '../../../watchers/graphql';
import { NestLensApolloPlugin } from '../../../watchers/graphql/adapters';
import { CollectorService } from '../../../core/collector.service';
import { NestLensConfig } from '../../../nestlens.config';

describe('the Apollo @Plugin() provider', () => {
  it('registers and records when Apollo starts before any onModuleInit has run', async () => {
    // Arrange: nothing has been initialised, as when Apollo starts first.
    const collect = vi.fn(async () => undefined);
    const collectImmediate = vi.fn(async () => null);
    const collector = { collect, collectImmediate } as unknown as CollectorService;
    const config: NestLensConfig = { watchers: { graphql: true } };
    const watcher = new GraphQLWatcher(collector, config, {} as ModuleRef);
    const provider = new NestLensApolloPlugin(watcher);

    const server = new ApolloServer({
      typeDefs: 'type Query { hello: String }',
      resolvers: { Query: { hello: () => 'hi' } },
      plugins: [provider as unknown as ApolloServerPlugin],
    });

    // Act
    await server.start();
    await server.executeOperation({ query: '{ hello }' });
    await server.stop();

    // Assert
    expect(watcher.getRegistrationMode()).toBe('auto');
    expect(watcher.watcherStatus().state).toBe('recording');
    const types = [...collect.mock.calls, ...collectImmediate.mock.calls].map(
      (call) => (call as unknown[])[0],
    );
    expect(types).toContain('graphql');
  });

  const build = (
    config: NestLensConfig,
  ): { watcher: GraphQLWatcher; provider: NestLensApolloPlugin } => {
    const collector = {
      collect: vi.fn(async () => undefined),
      collectImmediate: vi.fn(async () => null),
    } as unknown as CollectorService;
    const watcher = new GraphQLWatcher(collector, config, {} as ModuleRef);
    return { watcher, provider: new NestLensApolloPlugin(watcher) };
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('looks for a server once, however many requests arrive, when none is found', async () => {
    // Arrange: detection that finds nothing, asked from every request.
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(GraphQLWatcher.prototype, 'detectServer').mockReturnValue('none');
    const { watcher, provider } = build({ watchers: { graphql: true } });

    // Act
    for (let request = 0; request < 5; request += 1) await provider.requestDidStart({});

    // Assert
    const detections = warn.mock.calls.filter(([message]) =>
      String(message).includes('No GraphQL server detected'),
    );
    expect(detections).toHaveLength(1);
    expect(watcher.getAdapter()).toBeUndefined();
  });

  it('builds nothing again once the watcher has been destroyed', async () => {
    const { watcher } = build({ watchers: { graphql: true } });
    expect(watcher.ensureAdapter()).toBeDefined();

    watcher.destroy();

    expect(watcher.ensureAdapter()).toBeUndefined();
    expect(watcher.getSubscriptionTracker()).toBeUndefined();
  });
});
