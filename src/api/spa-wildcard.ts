import { Injectable, Optional } from '@nestjs/common';
import { PATH_METADATA_KEY } from '../core/nest-metadata-keys';
import { HttpAdapterHost } from '@nestjs/core';
import { dirname } from 'path';
import { DashboardController } from './dashboard.controller';

/**
 * The SPA fallback has to match any depth — `/nestlens/requests/42` is a route
 * inside the dashboard, not a file — and the two routers spell that differently.
 * Measured on NestJS 11, booting each syntax on each adapter:
 *
 * |           | Express                  | Fastify                     |
 * |-----------|--------------------------|-----------------------------|
 * | `*`       | serves, logs a warning   | serves                      |
 * | `*path`   | serves                   | fails to boot               |
 * | `{*path}` | serves                   | fails to boot               |
 *
 * Fastify's router rejects anything after the star ("Wildcard must be the last
 * character in the route"), so the bare form is the only one it takes. Express
 * 5 routes through path-to-regexp v8, which dropped the bare star: NestJS
 * accepts it, rewrites it, and says so on every boot —
 *
 *   [LegacyRouteConverter] Unsupported route path: "/nestlens/*" …
 *
 * — which is a deprecation notice about our route in someone else's log.
 * Express 4 (NestJS 9 and 10) is the other way round: it wants the bare star and
 * reads `*path` as a star followed by the literal text `path`, matching nothing.
 *
 * So the answer depends on the router, which is not known when `forRoot()` runs.
 * {@link SpaRouteRegistrar} settles it once the adapter exists.
 */
export const toSpaWildcard = (
  adapterType: string | undefined,
  expressMajor: number | undefined,
): string => {
  if (adapterType !== 'express') {
    return '*';
  }

  return (expressMajor ?? 0) >= 5 ? '*path' : '*';
};

/** Where `request` resolves from `paths`, or `undefined` when it does not. */
const resolveFrom = (request: string, paths: string[] | undefined): string | undefined => {
  try {
    return paths ? require.resolve(request, { paths }) : require.resolve(request);
  } catch {
    return undefined;
  }
};

/**
 * The major version of the Express that `@nestjs/platform-express` runs, or
 * `undefined` when it cannot be read.
 *
 * Resolved from the adapter's own directory, because that is the copy the
 * adapter loads. NestJS 9 and 10 bring Express 4, and when anything else in
 * the application wants Express 5 — `@modelcontextprotocol/sdk`, which
 * NestLens's own MCP server uses, is one — npm hoists 5 to the top of
 * node_modules and nests 4 under the adapter. Read from here, that answered 5
 * to an Express 4 router, which then took `*path` literally and 404'd every
 * deep link into the dashboard.
 *
 * The package, not the running application: an application can hand NestJS
 * its own Express, and every Express 4 release has `app.lazyrouter` where 5
 * does not, but no supported pairing needs it. Measured: the NestJS 11 and 12
 * adapters read `app.router`, which throws on Express 4 before NestLens is
 * reached, and on NestJS 10 an Express 5 application dies registering any
 * `forRoutes('*')` middleware — path-to-regexp 8's "Missing parameter name".
 * In every pairing that boots, the running Express has the adapter's major.
 *
 * Required lazily: Express is not a dependency of this package, and an
 * application on Fastify has no reason to have it installed. Only reached when
 * the adapter has already identified itself as Express. `paths` is where
 * resolution starts, for tests; by default it is this package's location.
 */
export const readExpressMajor = (paths?: string[]): number | undefined => {
  const adapter = resolveFrom('@nestjs/platform-express/package.json', paths);
  const manifest =
    (adapter ? resolveFrom('express/package.json', [dirname(adapter)]) : undefined) ??
    resolveFrom('express/package.json', paths);

  if (!manifest) {
    return undefined;
  }

  try {
    const { version } = require(manifest) as { version?: string };
    const major = Number.parseInt(version ?? '', 10);

    return Number.isNaN(major) ? undefined : major;
  } catch {
    return undefined;
  }
};

/**
 * Points the dashboard's catch-all at the syntax the running router accepts.
 *
 * A provider rather than a lifecycle hook on purpose: providers are constructed
 * while the application is being assembled, which is before Nest's
 * RoutesResolver reads the metadata — and by then `HttpAdapterHost` already
 * holds the real adapter. `forRoot()`, where the rest of the mount points are
 * decided, runs too early to know which one it will be.
 *
 * If it never runs, the decorator's own bare `*` stands, which every router has
 * always accepted.
 */
@Injectable()
export class SpaRouteRegistrar {
  constructor(@Optional() adapterHost?: HttpAdapterHost) {
    const adapter = adapterHost?.httpAdapter;
    if (!adapter) {
      return;
    }

    const adapterType = typeof adapter.getType === 'function' ? adapter.getType() : undefined;
    const handler = Object.getOwnPropertyDescriptor(DashboardController.prototype, 'serveSpaRoute')
      ?.value as object | undefined;

    if (!handler) {
      return;
    }

    Reflect.defineMetadata(
      PATH_METADATA_KEY,
      toSpaWildcard(adapterType, adapterType === 'express' ? readExpressMajor() : undefined),
      handler,
    );
  }
}
