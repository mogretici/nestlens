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

/**
 * Path segments a forwarded prefix may contain. Anything else — a scheme, a
 * host, an authority (`//evil.com`), a query, a fragment or an encoded
 * traversal — is rejected outright rather than sanitised, since a prefix that
 * needs cleaning is not one worth trusting.
 */
const SAFE_FORWARDED_PREFIX = /^\/[A-Za-z0-9\-._~/]*$/;

/**
 * Normalizes an `X-Forwarded-Prefix` header into `/tools` form, or `''` when it
 * is absent or unusable.
 *
 * A reverse proxy that strips a path segment before forwarding (nginx
 * `location /tools/ { proxy_pass http://app:3000/; }`, or a Kubernetes ingress
 * rewrite) leaves the application seeing `/nestlens` while the browser is at
 * `/tools/nestlens`. The dashboard's `<base href>` has to describe the
 * browser's view, not the application's, or every asset 404s.
 *
 * The value is attacker-controlled — anyone can send this header — so it is
 * only consulted when `trustProxy` is explicitly enabled, and even then it must
 * be a plain absolute path. Reflecting an unvalidated value would let a request
 * point the dashboard's asset and API URLs at another origin, which a shared
 * cache in front of the application could then serve to other users.
 */
export const toForwardedPrefix = (header: string | string[] | undefined): string => {
  // Duplicated headers arrive as an array; a proxy chain disagreeing with
  // itself is not something to guess about.
  if (typeof header !== 'string') return '';

  const candidate = header.trim().replace(/\/+$/, '');

  if (candidate.length === 0) return '';
  if (!SAFE_FORWARDED_PREFIX.test(candidate)) return '';
  if (candidate.includes('//') || candidate.includes('..')) return '';

  return candidate;
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
