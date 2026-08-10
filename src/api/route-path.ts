import { DEFAULT_CONFIG, NESTLENS_API_PREFIX } from '../nestlens.config';

/**
 * Normalizes a configured `path` into a Nest controller prefix.
 *
 * Nest controller prefixes carry no leading or trailing slash, so the user's
 * `path` — which the docs write as `/nestlens` or `/admin/monitoring` — has to
 * be stripped before it can be used as a route prefix.
 */
export const toRoutePrefix = (path: string | undefined): string => {
  const candidate = (path ?? DEFAULT_CONFIG.path ?? '').trim();

  return candidate
    .split('/')
    .filter((segment) => segment.length > 0)
    .join('/');
};

/**
 * Browser-facing form of the configured path: a leading slash and no trailing
 * slash, e.g. `/admin/monitoring`. Mounting at the server root yields `''`.
 */
export const toBaseHref = (path: string | undefined): string => {
  const prefix = toRoutePrefix(path);
  return prefix.length > 0 ? `/${prefix}` : '';
};

/** Normalizes Nest's global prefix into `/api` form, or `''` when unset. */
export const toGlobalPrefix = (globalPrefix: string | undefined): string => {
  const trimmed = (globalPrefix ?? '').replace(/^\/|\/$/g, '');
  return trimmed.length > 0 ? `/${trimmed}` : '';
};

/**
 * Whether a request belongs to NestLens itself — its dashboard, its API or its
 * event stream.
 *
 * Watchers use this to skip their own traffic. `config.path` alone is not
 * enough: `app.setGlobalPrefix('api')` moves every NestLens route to
 * `/api/nestlens/...`, and a check that only looks for `/nestlens` stops
 * matching. NestLens then records its own dashboard polling, which both buries
 * real entries and keeps generating new ones on every refresh.
 */
export const isNestLensRequest = (
  requestPath: string,
  configuredPath: string | undefined,
  globalPrefix?: string,
): boolean => {
  const prefix = toGlobalPrefix(globalPrefix);
  const dashboard = `${prefix}${toBaseHref(configuredPath)}`;
  const api = `${prefix}/${NESTLENS_API_PREFIX}`;

  return requestPath.startsWith(dashboard) || requestPath.startsWith(api);
};
