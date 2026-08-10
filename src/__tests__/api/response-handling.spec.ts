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
import 'reflect-metadata';
import { METHOD_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { NestLensApiController } from '../../api/api.controller';
import { TagController } from '../../api/tag.controller';
import { DashboardController } from '../../api/dashboard.controller';

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
describe.each<[string, Constructor]>([
  ['NestLensApiController', NestLensApiController],
  ['TagController', TagController],
  ['DashboardController', DashboardController],
])('%s', (_name, controller) => {
  const handlers = routeHandlers(controller);

  it('exposes at least one route', () => {
    expect(handlers.length).toBeGreaterThan(0);
  });

  it.each(handlers)('%s takes over the response', (handler) => {
    expect(declaresResponse(controller, handler)).toBe(true);
  });
});
