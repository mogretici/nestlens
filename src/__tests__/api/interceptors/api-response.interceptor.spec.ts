/**
 * NestLensApiResponseInterceptor
 *
 * The interceptor writes the response envelope to the transport itself so the
 * host application's global interceptors have no value to rewrite. These tests
 * cover the envelope shape, the status code it picks on the framework's behalf,
 * and the fact that nothing is emitted downstream.
 */
import { CallHandler, ExecutionContext, HttpCode, HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { HttpAdapterHost } from '@nestjs/core';
import { lastValueFrom, of, throwError } from 'rxjs';
import { defaultIfEmpty, toArray } from 'rxjs/operators';
import { NestLensApiResponseInterceptor } from '../../../api/interceptors/api-response.interceptor';
import { ApiResponse } from '../../../api/dto';

interface Written {
  body: ApiResponse<unknown> | undefined;
  status: number;
  calls: number;
}

const NOT_EMITTED = Symbol('not emitted');

const createInterceptor = (): {
  interceptor: NestLensApiResponseInterceptor<unknown>;
  written: Written;
} => {
  const written: Written = { body: undefined, status: 0, calls: 0 };

  const httpAdapter = {
    reply: (_res: unknown, body: ApiResponse<unknown>, status: number) => {
      written.body = body;
      written.status = status;
      written.calls += 1;
    },
  };

  return {
    interceptor: new NestLensApiResponseInterceptor({
      httpAdapter,
    } as unknown as HttpAdapterHost),
    written,
  };
};

const createContext = (
  method = 'GET',
  handler: (...args: unknown[]) => unknown = function get(): void {},
): ExecutionContext => {
  const request: Record<string, unknown> = { method };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
    }),
    getHandler: () => handler,
  } as unknown as ExecutionContext;
};

/** Runs the interceptor and reports what, if anything, reached the caller. */
const run = async (
  interceptor: NestLensApiResponseInterceptor<unknown>,
  context: ExecutionContext,
  handlerResult: unknown,
): Promise<unknown> => {
  const next: CallHandler = { handle: () => of(handlerResult) };

  return lastValueFrom(interceptor.intercept(context, next).pipe(defaultIfEmpty(NOT_EMITTED)));
};

describe('NestLensApiResponseInterceptor', () => {
  let interceptor: NestLensApiResponseInterceptor<unknown>;
  let written: Written;

  beforeEach(() => {
    ({ interceptor, written } = createInterceptor());
  });

  describe('isolation from the host application', () => {
    // The envelope goes to the transport, not downstream: a value returned from
    // the handler passes through the host's global interceptors, and a "wrap
    // every response" interceptor would bury it one level deeper.
    it('keeps the envelope out of the downstream value', async () => {
      const emitted = await run(interceptor, createContext(), { total: 1 });

      expect(emitted).toBeUndefined();
    });

    // Completing empty would be tidier, but Nest 9/10 take the last value off
    // this stream without a fallback and throw `EmptyError` when there is none.
    it('still emits a value so the framework has something to take', async () => {
      const emitted = await run(interceptor, createContext(), { total: 1 });

      expect(emitted).not.toBe(NOT_EMITTED);
    });

    it('writes the response to the adapter exactly once', async () => {
      await run(interceptor, createContext(), { total: 1 });

      expect(written.calls).toBe(1);
    });

    it('leaves errors to the exception filter', async () => {
      const failure = new Error('storage unavailable');
      const next: CallHandler = { handle: () => throwError(() => failure) };

      await expect(
        lastValueFrom(interceptor.intercept(createContext(), next).pipe(toArray())),
      ).rejects.toBe(failure);
      expect(written.calls).toBe(0);
    });
  });

  describe('status codes', () => {
    it('uses 200 for GET', async () => {
      await run(interceptor, createContext('GET'), {});

      expect(written.status).toBe(HttpStatus.OK);
    });

    // Nest defaults POST to 201; taking over the write means reproducing that,
    // otherwise every POST in the API silently downgrades to 200.
    it('uses 201 for POST', async () => {
      await run(interceptor, createContext('POST'), {});

      expect(written.status).toBe(HttpStatus.CREATED);
    });

    it('honours an explicit @HttpCode()', async () => {
      class Controller {
        @HttpCode(HttpStatus.ACCEPTED)
        run(): void {}
      }

      const handler = Controller.prototype.run;
      await run(interceptor, createContext('POST', handler), {});

      expect(written.status).toBe(HttpStatus.ACCEPTED);
    });

    // The interceptor inlines Nest's metadata key rather than importing it from
    // a non-public subpath. If the framework ever renames it, this fails here
    // instead of silently returning the wrong status for every route.
    it('matches the framework metadata key it relies on', () => {
      expect(HTTP_CODE_METADATA).toBe('__httpCode__');
    });
  });

  describe('envelope', () => {
    it('wraps a plain value', async () => {
      await run(interceptor, createContext(), [1, 2, 3]);

      expect(written.body).toMatchObject({ success: true, data: [1, 2, 3], error: null });
      expect(written.body?.meta?.timestamp).toEqual(expect.any(String));
      expect(written.body?.meta?.duration).toEqual(expect.any(Number));
    });

    it('unwraps a structured { data, meta } response', async () => {
      await run(interceptor, createContext(), {
        data: [{ id: 1 }],
        meta: { total: 42 },
      });

      expect(written.body).toMatchObject({
        success: true,
        data: [{ id: 1 }],
        error: null,
      });
      expect(written.body?.meta).toMatchObject({ total: 42 });
    });

    it('keeps extra properties when no data key is present', async () => {
      await run(interceptor, createContext(), { meta: { total: 0 }, related: { tags: [] } });

      expect(written.body?.data).toMatchObject({ related: { tags: [] } });
    });

    it('passes an existing envelope through, refreshing only the timing', async () => {
      await run(interceptor, createContext(), {
        success: false,
        data: null,
        error: { code: 'NOT_FOUND', message: 'missing' },
        meta: { timestamp: '2020-01-01T00:00:00.000Z' },
      });

      expect(written.body).toMatchObject({
        success: false,
        data: null,
        error: { code: 'NOT_FOUND', message: 'missing' },
      });
      expect(written.body?.meta?.timestamp).toBe('2020-01-01T00:00:00.000Z');
      expect(written.body?.meta?.duration).toEqual(expect.any(Number));
    });

    it('wraps null', async () => {
      await run(interceptor, createContext(), null);

      expect(written.body).toMatchObject({ success: true, data: null, error: null });
    });
  });

  describe('request timing', () => {
    // The exception filter reads `_startTime` off the request to report the
    // duration on failures, so the interceptor has to set it before delegating.
    it('stamps the request so the exception filter can measure duration', async () => {
      const context = createContext();
      const request = context.switchToHttp().getRequest<{ _startTime?: number }>();

      await run(interceptor, context, {});

      expect(request._startTime).toEqual(expect.any(Number));
    });
  });
});

/**
 * Properties a controller sends alongside `data`.
 *
 * `getEntry` looks up the queries, logs and exceptions a request produced and
 * returns them as `related` next to the entry. The envelope destructured them
 * out and dropped them, so the dashboard — which reads `response.related` —
 * always showed nothing, and the lookup ran on every request detail view for
 * no one. The comment above the code said "any additional properties (like
 * 'related')" the whole time.
 */
describe('NestLensResponseInterceptor extra properties', () => {
  it('carries what the controller sent alongside data', async () => {
    // Arrange
    const { interceptor, written } = createInterceptor();
    const related = [{ id: 2, type: 'query' }];

    // Act
    await run(interceptor, createContext(), { data: { id: 1, type: 'request' }, related });

    // Assert
    expect(written.body).toMatchObject({
      success: true,
      data: { id: 1, type: 'request' },
      related,
    });
  });

  it('still answers a bare object as the data itself', async () => {
    // Arrange - no `data` key: the whole object is the payload
    const { interceptor, written } = createInterceptor();

    // Act
    await run(interceptor, createContext(), { total: 3, byType: { request: 3 } });

    // Assert
    expect(written.body).toMatchObject({
      success: true,
      data: { total: 3, byType: { request: 3 } },
    });
  });
});
