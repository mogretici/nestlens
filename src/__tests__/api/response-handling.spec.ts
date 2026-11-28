/**
 * Every NestLens route must tell Nest that its response is already written.
 *
 * `NestLensApiResponseInterceptor` replies through the HTTP adapter so the host
 * application's global interceptors have nothing to rewrite. That only works if
 * the framework then stays out of the way, and the way a handler says so is by
 * declaring an `@Res()` parameter — even an unused one.
 *
 * Forget it on a new handler and nothing looks wrong on Nest 11 with Express 5,
 * which tolerates the second write. On Nest 9/10 with Express 4 the same route
 * throws `Cannot set headers after they are sent to the client` on every
 * request. This test is what makes that failure visible on the machine of
 * whoever adds the handler, rather than in a user's application.
 */
import { describe, it, expect } from 'vitest';
import 'reflect-metadata';
import { METHOD_METADATA, PATH_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import * as api from '../../api';

type Constructor = new (...args: never[]) => object;

/** Method names on a controller that Nest will expose as HTTP routes. */
const routeHandlers = (controller: Constructor): string[] =>
  Object.getOwnPropertyNames(controller.prototype).filter(
    (name) =>
      name !== 'constructor' &&
      Reflect.hasMetadata(
        METHOD_METADATA,
        (controller.prototype as Record<string, unknown>)[name] as object,
      ),
  );

/** Whether a handler declares an `@Res()` parameter. */
const declaresResponse = (controller: Constructor, handler: string): boolean => {
  const args =
    (Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, handler) as Record<
      string,
      unknown
    > | null) ?? {};

  return Object.keys(args).some((key) => key.startsWith(`${RouteParamtypes.RESPONSE}:`));
};

// NestLensStreamController is deliberately absent: it is an `@Sse()` route and
// does not use NestLensApiResponseInterceptor, so Nest owns that response and
// must be left to write it. Adding the interceptor there would break the stream.
//
// The rest are every controller `src/api` exports, so a new one is checked
// without being added here: a list kept by hand had already missed one.
const CONTROLLERS = Object.entries(api).filter(
  (entry): entry is [string, Constructor] =>
    typeof entry[1] === 'function' &&
    Reflect.hasMetadata(PATH_METADATA, entry[1]) &&
    entry[0] !== 'NestLensStreamController',
);

it('checks every controller it should', () => {
  expect(CONTROLLERS.map(([name]) => name).sort()).toEqual([
    'DashboardController',
    'NestLensApiController',
    'TagController',
    'WatcherStatusController',
  ]);
});

describe.each<[string, Constructor]>(CONTROLLERS)('%s', (_name, controller) => {
  const handlers = routeHandlers(controller);

  it('exposes at least one route', () => {
    expect(handlers.length).toBeGreaterThan(0);
  });

  it.each(handlers)('%s takes over the response', (handler) => {
    expect(declaresResponse(controller, handler)).toBe(true);
  });
});
