/**
 * Choosing the adapter by what the application runs, not by what it installed.
 *
 * Detection was the package list, first match wins, with Apollo first. An
 * application carrying both — a monorepo, a dependency left behind,
 * `@nestjs/apollo` beside a Fastify app — got the Apollo adapter, whose hooks
 * were installed on a server nobody was using: not one operation recorded, and
 * nothing said why.
 *
 * This repository put itself in that state the moment `@apollo/server` was
 * added so the suite could see the real thing, and the Mercurius suite went
 * from nine passing tests to nine failing ones. That is the shape a monorepo
 * hands an application.
 *
 * Mercurius runs on Fastify and nowhere else, which is the one signal
 * available when the choice has to be made — the driver the application
 * registered is not resolvable from the container, measured.
 */
import { Test } from '@nestjs/testing';
import { HttpAdapterHost } from '@nestjs/core';
import { CollectorService } from '../../../core/collector.service';
import { NESTLENS_CONFIG, NestLensConfig } from '../../../nestlens.config';
import { GraphQLWatcher } from '../../../watchers/graphql/graphql.watcher';

const watcherOn = async (
  platform: string | undefined,
  config: NestLensConfig = { watchers: { graphql: true } },
): Promise<GraphQLWatcher> => {
  const module = await Test.createTestingModule({
    providers: [
      GraphQLWatcher,
      { provide: CollectorService, useValue: { collect: jest.fn(), collectImmediate: jest.fn() } },
      { provide: NESTLENS_CONFIG, useValue: config },
      {
        provide: HttpAdapterHost,
        useValue: platform ? { httpAdapter: { getType: () => platform } } : {},
      },
    ],
  }).compile();

  return module.get(GraphQLWatcher);
};

describe('which GraphQL server the watcher decides it is watching', () => {
  it('chooses Mercurius on Fastify, though Apollo is installed too', async () => {
    const watcher = await watcherOn('fastify');

    expect(watcher.detectServer()).toBe('mercurius');
  });

  it('chooses Apollo on Express, where Mercurius cannot run', async () => {
    const watcher = await watcherOn('express');

    expect(watcher.detectServer()).toBe('apollo');
  });

  it('falls back to the package list when the platform is unknown', async () => {
    // A watcher built without an HTTP adapter, as a unit test does.
    const watcher = await watcherOn(undefined);

    expect(watcher.detectServer()).toBe('apollo');
  });

  it('does not decide at all when the application said which', async () => {
    // `server` is honoured before any of this runs; the setting exists for the
    // application on Fastify that really is running Apollo.
    const watcher = await watcherOn('fastify', {
      watchers: { graphql: { enabled: true, server: 'apollo' } },
    });

    expect(watcher.getConfig().server).toBe('apollo');
  });
});
