import { Injectable, Optional } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { HttpAdapterHost } from '@nestjs/core';
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

/**
 * Express's major version, or `undefined` when it cannot be read.
 *
 * Required lazily: Express is not a dependency of this package, and an
 * application on Fastify has no reason to have it installed. Only reached when
 * the adapter has already identified itself as Express.
 */
export const readExpressMajor = (): number | undefined => {
  try {
    const { version } = require('express/package.json') as { version?: string };
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
      PATH_METADATA,
      toSpaWildcard(adapterType, adapterType === 'express' ? readExpressMajor() : undefined),
      handler,
    );
  }
}
