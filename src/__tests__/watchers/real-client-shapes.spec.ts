/**
 * The guards, against the packages themselves.
 *
 * Every fake in the watcher specs is written by hand, so it encodes what the
 * author believed a client looks like. Two of those beliefs were wrong and
 * neither test noticed:
 *
 *   axios          `axios.create()` is a *function*, and the guard began
 *                  `typeof value !== 'object'` — so every real client was
 *                  refused with `Invalid axios instance provided` and the
 *                  watcher recorded nothing, ever.
 *   Apollo         `willSendResponse` receives formatted errors with no
 *                  `originalError`, so nothing a resolver threw was recorded.
 *
 * Both were found from outside. These take the shapes from the installed
 * packages instead, which is the only way a fake cannot drift.
 */
import axios from 'axios';
import { HttpService } from '@nestjs/axios';
import { Test } from '@nestjs/testing';
import { CollectorService } from '../../core/collector.service';
import { NESTLENS_CONFIG, NestLensConfig } from '../../nestlens.config';
import { HttpClientWatcher, NESTLENS_HTTP_CLIENT } from '../../watchers/http-client.watcher';
import { CacheWatcher } from '../../watchers/cache.watcher';

const watcherOver = async <T>(
  token: symbol | string,
  client: unknown,
  Watcher: new (...args: never[]) => T,
  config: NestLensConfig,
): Promise<T> => {
  const module = await Test.createTestingModule({
    providers: [
      Watcher,
      { provide: CollectorService, useValue: { collect: jest.fn(), collectImmediate: jest.fn() } },
      { provide: NESTLENS_CONFIG, useValue: config },
      { provide: token, useValue: client },
    ],
  }).compile();

  return module.get(Watcher);
};

describe('the HTTP client watcher, against axios', () => {
  const enabled: NestLensConfig = { watchers: { httpClient: { enabled: true } } };

  it('an axios instance is callable, which is what broke this', () => {
    // The fact the guard got wrong, stated as a fact.
    expect(typeof axios.create()).toBe('function');
    expect(typeof new HttpService().axiosRef).toBe('function');
  });

  it('installs its interceptors on a real instance', async () => {
    const client = axios.create();
    const before = {
      request: (client.interceptors.request as unknown as { handlers: unknown[] }).handlers.length,
      response: (client.interceptors.response as unknown as { handlers: unknown[] }).handlers
        .length,
    };

    const watcher = await watcherOver(NESTLENS_HTTP_CLIENT, client, HttpClientWatcher, enabled);
    watcher.onModuleInit();

    expect(
      (client.interceptors.request as unknown as { handlers: unknown[] }).handlers.length,
    ).toBe(before.request + 1);
    expect(
      (client.interceptors.response as unknown as { handlers: unknown[] }).handlers.length,
    ).toBe(before.response + 1);

    watcher.onModuleDestroy();
  });

  it('takes them off again', async () => {
    const client = axios.create();
    const watcher = await watcherOver(NESTLENS_HTTP_CLIENT, client, HttpClientWatcher, enabled);

    watcher.onModuleInit();
    watcher.onModuleDestroy();

    const handlers = (client.interceptors.request as unknown as { handlers: (unknown | null)[] })
      .handlers;

    expect(handlers.filter(Boolean)).toHaveLength(0);
  });

  it('reaches the instance behind @nestjs/axios', async () => {
    const service = new HttpService();
    const watcher = await watcherOver(NESTLENS_HTTP_CLIENT, service, HttpClientWatcher, enabled);

    watcher.onModuleInit();

    expect(
      (service.axiosRef.interceptors.request as unknown as { handlers: unknown[] }).handlers.length,
    ).toBe(1);

    watcher.onModuleDestroy();
  });
});

describe('the cache watcher, against cache-manager', () => {
  it('wraps a real cache and gives it back', async () => {
    const { createCache } = (await import('cache-manager')) as unknown as {
      createCache: () => Record<string, unknown>;
    };
    const cache = createCache();
    const before = { get: cache.get, set: cache.set };

    const watcher = await watcherOver('CACHE_MANAGER', cache, CacheWatcher, {
      watchers: { cache: { enabled: true } },
    });

    watcher.onModuleInit();
    expect(cache.get).not.toBe(before.get);

    watcher.onModuleDestroy();
    expect(cache.get).toBe(before.get);
    expect(cache.set).toBe(before.set);
  });

  it('records a read and passes the value through', async () => {
    const { createCache } = (await import('cache-manager')) as unknown as {
      createCache: () => {
        get: (k: string) => Promise<unknown>;
        set: (k: string, v: unknown) => Promise<unknown>;
      };
    };
    const cache = createCache();
    const collected: unknown[] = [];

    const module = await Test.createTestingModule({
      providers: [
        CacheWatcher,
        {
          provide: CollectorService,
          useValue: {
            collect: (_type: string, payload: unknown) => void collected.push(payload),
            collectImmediate: jest.fn(),
          },
        },
        { provide: NESTLENS_CONFIG, useValue: { watchers: { cache: { enabled: true } } } },
        { provide: 'CACHE_MANAGER', useValue: cache },
      ],
    }).compile();

    const watcher = module.get(CacheWatcher);
    watcher.onModuleInit();

    await cache.set('k', 'v');
    await expect(cache.get('k')).resolves.toBe('v');

    expect(collected).toHaveLength(2);
    watcher.onModuleDestroy();
  });
});
