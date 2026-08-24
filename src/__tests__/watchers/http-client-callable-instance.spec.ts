/**
 * The shape a real axios instance actually has.
 *
 * `axios.create()` returns a *callable* — `typeof` reports `'function'`, and
 * the interceptor managers hang off it as properties. `HttpService.axiosRef`
 * returns that same function.
 *
 * The watcher's guard began `typeof value !== 'object'`, so it refused every
 * real client it was ever handed, answered `Invalid axios instance provided`,
 * and recorded nothing. It survived a full spec file because every fake in it
 * is a plain object literal — the mocks agreed with each other and neither
 * agreed with axios.
 *
 * So this one is callable, like the real thing, and would fail against the
 * guard as it was written.
 */
import { Test } from '@nestjs/testing';
import { CollectorService } from '../../core/collector.service';
import { NESTLENS_CONFIG, NestLensConfig } from '../../nestlens.config';
import { HttpClientWatcher, NESTLENS_HTTP_CLIENT } from '../../watchers/http-client.watcher';

/** A function carrying `interceptors`, which is what axios hands back. */
const callableAxios = () => {
  const instance = Object.assign(jest.fn(), {
    interceptors: {
      request: { use: jest.fn(() => 0), eject: jest.fn() },
      response: { use: jest.fn(() => 1), eject: jest.fn() },
    },
  });

  return instance;
};

describe('a callable axios instance is accepted', () => {
  const build = async (client: unknown): Promise<HttpClientWatcher> => {
    const config: NestLensConfig = { watchers: { httpClient: { enabled: true } } };

    const module = await Test.createTestingModule({
      providers: [
        HttpClientWatcher,
        { provide: CollectorService, useValue: { collect: jest.fn() } },
        { provide: NESTLENS_CONFIG, useValue: config },
        { provide: NESTLENS_HTTP_CLIENT, useValue: client },
      ],
    }).compile();

    return module.get(HttpClientWatcher);
  };

  it('installs its interceptors on a function, as axios returns', async () => {
    const axios = callableAxios();
    const watcher = await build(axios);

    watcher.onModuleInit();

    expect(axios.interceptors.request.use).toHaveBeenCalled();
    expect(axios.interceptors.response.use).toHaveBeenCalled();
  });

  it('reaches the instance behind an `axiosRef` wrapper', async () => {
    // What `@nestjs/axios` hands over: the wrapper is an object, the client
    // behind it is not.
    const axios = callableAxios();
    const watcher = await build({ axiosRef: axios });

    watcher.onModuleInit();

    expect(axios.interceptors.request.use).toHaveBeenCalled();
  });

  it('still refuses something with no interceptors at all', async () => {
    const notAClient = Object.assign(jest.fn(), { interceptors: {} });
    const watcher = await build(notAClient);

    // Arrange-free: the assertion is that nothing throws and nothing installs.
    expect(() => watcher.onModuleInit()).not.toThrow();
  });
});
