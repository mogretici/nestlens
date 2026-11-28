/**
 * A watcher that is switched on and records nothing says so, and says why.
 *
 * Measured on a production application running 0.14.2: the Redis and HTTP
 * client tabs were empty for months, because neither client was handed over,
 * and the Logs tab was empty because the application called
 * `app.useLogger(levels)` and never installed `NestLensLogger`. Each watcher
 * logged the missing client at debug level; nothing said anything a reader
 * would see. These boot real applications and ask what each watcher reports,
 * what the startup warning says, and what the API answers.
 *
 * Following AAA (Arrange-Act-Assert).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Controller, Get, INestApplication, Logger, Module, Provider } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import axios from 'axios';
import { NestLensModule } from '../../nestlens.module';
import { NestLensConfig } from '../../nestlens.config';
import {
  HttpClientWatcher,
  NESTLENS_HTTP_CLIENT,
  NESTLENS_REDIS_CLIENT,
  NestLensLogger,
  GateWatcher,
  JobWatcher,
} from '../../index';
import { WatcherStatusReport, WatcherStatusService } from '../../watchers/watcher-status.service';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const opened: INestApplication[] = [];

afterEach(async () => {
  await Promise.all(opened.splice(0).map((app) => app.close()));
  vi.restoreAllMocks();
});

interface Booted {
  app: INestApplication;
  status: (type: string) => WatcherStatusReport;
  warnings: string[];
}

const boot = async (
  config: NestLensConfig,
  providers: Provider[] = [],
  before?: (app: INestApplication) => void,
): Promise<Booted> => {
  const warnings: string[] = [];
  vi.spyOn(Logger.prototype, 'warn').mockImplementation((message: unknown) => {
    warnings.push(String(message));
  });

  @Module({ imports: [NestLensModule.forRoot(config)], providers })
  class AppModule {}

  const app = await NestFactory.create(AppModule, new ExpressAdapter(), {
    logger: false,
    abortOnError: false,
  });
  opened.push(app);
  before?.(app);
  await app.init();

  const service = app.get(WatcherStatusService);
  const status = (type: string): WatcherStatusReport => {
    const found = service.statuses().find((report) => report.type === type);
    if (!found) throw new Error(`no status for ${type}`);
    return found;
  };

  return { app, status, warnings };
};

const waitingWarnings = (warnings: string[]): string[] =>
  warnings.filter((line) => line.includes('recording nothing'));

describe('a watcher with nothing handed over', () => {
  it('reports redis as waiting, then recording once a client is provided', async () => {
    // Arrange / Act
    const without = await boot({ watchers: { redis: true } });
    const withClient = await boot({ watchers: { redis: true } }, [
      { provide: NESTLENS_REDIS_CLIENT, useValue: { get: async () => 'v', set: async () => 'OK' } },
    ]);

    // Assert
    expect(without.status('redis')).toMatchObject({
      state: 'waiting',
      option: 'watchers.redis',
      docs: expect.stringContaining('/docs/watchers/redis#'),
    });
    expect(without.status('redis').reason).toContain('NESTLENS_REDIS_CLIENT');
    expect(withClient.status('redis').state).toBe('recording');
  });

  it('reports a Redis client with no command it records as waiting, not recording', async () => {
    const booted = await boot({ watchers: { redis: true } }, [
      { provide: NESTLENS_REDIS_CLIENT, useValue: { ping: async () => 'PONG' } },
    ]);

    expect(booted.status('redis').state).toBe('waiting');
  });

  it('reports the HTTP client as waiting, then recording through the token', async () => {
    const without = await boot({ watchers: { httpClient: true } });
    const withClient = await boot({ watchers: { httpClient: true } }, [
      { provide: NESTLENS_HTTP_CLIENT, useValue: axios.create() },
    ]);

    expect(without.status('http-client')).toMatchObject({
      state: 'waiting',
      option: 'watchers.httpClient',
    });
    expect(withClient.status('http-client').state).toBe('recording');
  });

  it('turns the HTTP client to recording the moment setupInterceptors is called', async () => {
    // Arrange
    const booted = await boot({ watchers: { httpClient: true } });
    expect(booted.status('http-client').state).toBe('waiting');

    // Act
    booted.app.get(HttpClientWatcher).setupInterceptors(axios.create());

    // Assert
    expect(booted.status('http-client').state).toBe('recording');
  });

  it('reports a job watcher with no queue registered as waiting', async () => {
    const booted = await boot({ watchers: { job: true } });

    expect(booted.status('job').state).toBe('waiting');

    booted.app.get(JobWatcher).setupQueue({ name: 'mail', on: () => undefined });
    expect(booted.status('job').state).toBe('recording');
  });

  it('reports a watcher whose manual API records call by call as manual, until it is called', async () => {
    const booted = await boot({ watchers: { gate: true } });

    expect(booted.status('gate').state).toBe('manual');

    booted.app.get(GateWatcher).trackCheck('posts', 'update', {}, true);
    expect(booted.status('gate').state).toBe('recording');
  });

  it('reports a Prisma client built without query logging as waiting, and says so', async () => {
    // From Prisma 6.14 a client reports queries only when built with query
    // logging; its engine configuration says whether it was.
    const prisma = { $on: () => undefined, _engineConfig: { logQueries: false } };

    const booted = await boot({}, [{ provide: 'PRISMA', useValue: prisma }]);

    expect(booted.status('query')).toMatchObject({
      state: 'waiting',
      reason: expect.stringContaining('without query logging'),
      docs: expect.stringContaining('/docs/integrations/prisma#'),
    });
  });

  it('reports GraphQL with Apollo installed and no GraphQLModule as waiting', async () => {
    // @apollo/server is installed here, so the adapter is created and its
    // plugin offered; without GraphQLModule there is no server to receive it.
    const booted = await boot({ watchers: { graphql: true } });

    expect(booted.status('graphql')).toMatchObject({
      state: 'waiting',
      reason: expect.stringContaining('No GraphQL schema was found'),
    });
  });

  it('reports a watcher that is switched off as off', async () => {
    const booted = await boot({ watchers: { request: false, redis: false, graphql: false } });

    expect(booted.status('request').state).toBe('off');
    expect(booted.status('redis').state).toBe('off');
    expect(booted.status('graphql').state).toBe('off');
  });
});

describe('the log watcher', () => {
  it('is waiting while NestLensLogger is not the application logger', async () => {
    // The production application: `useLogger(levels)` only.
    const booted = await boot({}, [], (app) => app.useLogger(['log', 'warn', 'error']));

    expect(booted.status('log')).toMatchObject({
      state: 'waiting',
      docs: expect.stringContaining('/docs/watchers/log#'),
    });
    expect(booted.status('log').reason).toContain('NestLensLogger');
  });

  it('is recording once app.useLogger installs it', async () => {
    const booted = await boot({}, [], (app) => app.useLogger(app.get(NestLensLogger)));

    // The reason, not only the state: Nest's own bootstrap logs have called it
    // by now, which alone would also read as recording.
    expect(booted.status('log')).toMatchObject({
      state: 'recording',
      reason: 'Installed as the application logger.',
    });
  });

  it('is recording once code that took it by injection calls it', async () => {
    const booted = await boot({});
    expect(booted.status('log').state).toBe('waiting');

    booted.app.get(NestLensLogger).log('Order placed', 'OrderService');

    expect(booted.status('log').state).toBe('recording');
  });

  it('says it is no longer the application logger once another replaces it', async () => {
    const booted = await boot({}, [], (app) => app.useLogger(app.get(NestLensLogger)));
    expect(booted.status('log').reason).toBe('Installed as the application logger.');

    booted.app.useLogger(false);

    // It did receive Nest's bootstrap logs, so it is not `waiting`; it says
    // they no longer reach it.
    expect(booted.status('log').reason).toContain('not the application logger');
  });
});

describe('the startup warning', () => {
  it('names each waiting watcher, its reason and its fix, once', async () => {
    const booted = await boot({ watchers: { redis: true, httpClient: true } });

    const lines = waitingWarnings(booted.warnings);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('watchers.redis:');
    expect(lines[0]).toContain('watchers.httpClient:');
    expect(lines[0]).toContain('watchers.log:');
    expect(lines[0]).toContain('https://nestlens-docs.vercel.app/docs/watchers/redis#');
    expect(lines[0]).toContain('/nestlens/__nestlens__/api/watchers');
  });

  it('says nothing about watchers that are recording', async () => {
    const booted = await boot({ watchers: { query: false } }, [], (app) =>
      app.useLogger(app.get(NestLensLogger)),
    );

    expect(waitingWarnings(booted.warnings)).toEqual([]);
  });

  it('does not name a watcher that is manual or off', async () => {
    const booted = await boot({ watchers: { gate: true, redis: false } });

    const [line] = waitingWarnings(booted.warnings);
    expect(line).not.toContain('watchers.gate');
    expect(line).not.toContain('watchers.redis');
  });

  it('waits for the query watcher, which attaches during bootstrap', async () => {
    // A DataSource the query watcher finds in its own `onApplicationBootstrap`,
    // which runs after NestLensModule's: a report from any single hook said
    // `query` was recording nothing in an application whose queries it records.
    class DataSource {
      subscribers: unknown[] = [];
      options = { type: 'postgres', name: 'default' };
      logger: unknown = undefined;
    }

    const booted = await boot({}, [{ provide: 'DATA_SOURCE', useValue: new DataSource() }]);

    expect(booted.status('query').state).toBe('recording');
    const [line] = waitingWarnings(booted.warnings);
    expect(line).not.toContain('watchers.query');
  });

  it('waits for the dashboard listener, which switches the logger off while it starts', async () => {
    // Read inside that window, the application logger looked replaced and the
    // log watcher was reported as waiting.
    const booted = await boot(
      { server: { host: '127.0.0.1', port: 0 }, watchers: { query: false } },
      [],
      (app) => app.useLogger(app.get(NestLensLogger)),
    );

    expect(waitingWarnings(booted.warnings)).toEqual([]);
  });

  it('is not printed when NestLens is switched off', async () => {
    const warnings: string[] = [];
    vi.spyOn(Logger.prototype, 'warn').mockImplementation((message: unknown) => {
      warnings.push(String(message));
    });

    @Module({ imports: [NestLensModule.forRoot({ enabled: false })] })
    class OffModule {}

    const app = await NestFactory.create(OffModule, new ExpressAdapter(), {
      logger: false,
      abortOnError: false,
    });
    opened.push(app);
    await app.init();

    expect(waitingWarnings(warnings)).toEqual([]);
  });
});

describe('GET __nestlens__/api/watchers', () => {
  @Controller('demo')
  class DemoController {
    @Get()
    ok(): string {
      return 'ok';
    }
  }

  const serve = async (config: NestLensConfig): Promise<{ app: INestApplication; url: string }> => {
    @Module({ imports: [NestLensModule.forRoot(config)], controllers: [DemoController] })
    class AppModule {}

    const app = await NestFactory.create(AppModule, new ExpressAdapter(), {
      logger: false,
      abortOnError: false,
    });
    opened.push(app);
    await app.listen(0, '127.0.0.1');

    return { app, url: `${await app.getUrl()}/nestlens/__nestlens__/api/watchers` };
  };

  it('answers every entry type with its state, reason and fix', async () => {
    // Arrange
    const { url } = await serve({ watchers: { redis: true } });

    // Act
    const response = await fetch(url);
    const body = (await response.json()) as { data: WatcherStatusReport[] };

    // Assert
    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(19);
    expect(body.data.find((report) => report.type === 'redis')).toMatchObject({
      option: 'watchers.redis',
      state: 'waiting',
      reason: expect.stringContaining('NESTLENS_REDIS_CLIENT'),
      docs: expect.stringMatching(/^https:\/\/nestlens-docs\.vercel\.app\/docs\/watchers\/redis/),
    });
  });

  it('is behind the same guard as the rest of the API', async () => {
    const { url } = await serve({ authorization: { canAccess: () => false } });

    const response = await fetch(url);

    expect(response.status).toBe(403);
  });
});
