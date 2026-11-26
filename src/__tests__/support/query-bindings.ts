/**
 * How NestLens' controllers read a request, from their route metadata.
 *
 * The query guards are only as good as the list of routes they look at, and a
 * hand-written list falls behind the first time a controller or a route is
 * added. This reads the controllers NestLens registers and the ones `src/api`
 * exports, and every route argument on them, and reports what it cannot see
 * into rather than skipping it.
 */
import 'reflect-metadata';
import { DynamicModule, RequestMethod, Type } from '@nestjs/common';
import {
  CUSTOM_ROUTE_ARGS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import * as api from '../../api';
import { NestLensDashboardModule } from '../../api/dashboard-server';
import { NestLensModule } from '../../nestlens.module';

type Dto = Type<object>;

type ModuleLike = Dto | DynamicModule | Promise<DynamicModule> | undefined;

const isClass = (value: unknown): value is Dto =>
  typeof value === 'function' && /^class\s/.test(Function.prototype.toString.call(value));

/**
 * Every controller NestLens registers: on the host's application, and on the
 * listener of its own when `server` is configured.
 */
export const registeredControllers = (): Set<Dto> => {
  const controllers = new Set<Dto>();
  const seen = new Set<unknown>();

  const visit = (module: ModuleLike): void => {
    if (module === undefined || module instanceof Promise || seen.has(module)) return;
    seen.add(module);

    const dynamic = typeof module === 'function' ? undefined : module;
    const target = dynamic?.module ?? (module as Dto);
    const declared = [
      ...((Reflect.getMetadata('controllers', target) ?? []) as Dto[]),
      ...((dynamic?.controllers ?? []) as Dto[]),
    ];
    declared.forEach((controller) => controllers.add(controller));

    [
      ...((Reflect.getMetadata('imports', target) ?? []) as ModuleLike[]),
      ...((dynamic?.imports ?? []) as ModuleLike[]),
    ].forEach(visit);
  };

  visit(NestLensModule.forRoot({}));
  visit(NestLensDashboardModule.forRoot([]));
  return controllers;
};

/** Every controller `src/api` exports. */
export const exportedControllers = (): Set<Dto> =>
  new Set(
    Object.values(api)
      .filter(isClass)
      .filter((value) => Reflect.hasMetadata(PATH_METADATA, value)),
  );

/** One route that parses its query string into a DTO. */
export interface QueryRoute {
  readonly controller: Dto;
  readonly handler: string;
  readonly method: RequestMethod;
  readonly dto: Dto;
}

/**
 * Every route that binds `@Query()` to a DTO, and anything bound some other
 * way the guards cannot see into: a named `@Query('x')`, which no DTO
 * validates, or a `createParamDecorator` argument.
 */
export const queryRoutes = (): { routes: QueryRoute[]; unknown: string[] } => {
  const routes: QueryRoute[] = [];
  const unknown: string[] = [];

  for (const controller of new Set([...registeredControllers(), ...exportedControllers()])) {
    for (const handler of Object.getOwnPropertyNames(controller.prototype)) {
      const args = (Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, handler) ?? {}) as Record<
        string,
        { index: number; data?: unknown }
      >;
      const types = (Reflect.getMetadata('design:paramtypes', controller.prototype, handler) ??
        []) as Dto[];
      const method = Reflect.getMetadata(
        METHOD_METADATA,
        (controller.prototype as Record<string, unknown>)[handler] as object,
      ) as RequestMethod;

      for (const [key, arg] of Object.entries(args)) {
        const kind = key.split(':')[0];
        const where = `${controller.name}.${handler}, argument ${arg.index}`;

        if (kind.includes(CUSTOM_ROUTE_ARGS_METADATA)) {
          unknown.push(`${where}: a custom parameter decorator`);
        } else if (!/^\d+$/.test(kind)) {
          unknown.push(`${where}: route argument "${key}"`);
        } else if (kind === String(RouteParamtypes.QUERY)) {
          if (arg.data !== undefined) {
            unknown.push(`${where}: @Query(${JSON.stringify(arg.data)}) outside a DTO`);
          } else if (method === undefined) {
            unknown.push(`${where}: @Query() on a method that is not a route`);
          } else {
            routes.push({ controller, handler, method, dto: types[arg.index] });
          }
        }
      }
    }
  }

  return { routes, unknown };
};

/** The DTOs a URL is parsed into. */
export const boundToQuery = (): { bound: Set<Dto>; unknown: string[] } => {
  const { routes, unknown } = queryRoutes();
  return { bound: new Set(routes.map((route) => route.dto)), unknown };
};

/**
 * The query DTOs of routes that change something — anything but GET. Their
 * parameters narrow what is changed, so a blank one must not widen it.
 */
export const mutatingQueryRoutes = (): QueryRoute[] =>
  queryRoutes().routes.filter((route) => route.method !== RequestMethod.GET);
