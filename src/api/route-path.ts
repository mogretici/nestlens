import { DEFAULT_CONFIG, NESTLENS_API_PREFIX } from '../nestlens.config';

/**
 * Normalizes a configured `path` into a Nest controller prefix.
 *
 * Nest controller prefixes carry no leading or trailing slash, so the user's
 * `path` — which the docs write as `/nestlens` or `/admin/monitoring` — has to
 * be stripped before it can be used as a route prefix.
 */
/**
 * What a mount path may be made of.
 *
 * The same alphabet the forwarding header is held to, minus the leading slash,
 * which `toRoutePrefix` strips anyway. A path outside it cannot be a URL path,
 * and NestLens puts this value into an HTML document and a route pattern, so
 * "cannot" has to be enforced rather than assumed.
 */
const SAFE_PATH_SEGMENT = /^[A-Za-z0-9\-._~]+$/;

/**
 * The configured mount path, as route prefix.
 *
 * An unusable path is refused rather than passed on. It is the application's
 * own configuration and not a caller's, so this is not a security boundary —
 * but `path` is exactly the kind of setting that comes out of an environment
 * variable, and what it produced when it was wrong was a dashboard that served
 * a broken page with nothing said about why. Refusing at startup names the
 * setting instead.
 */
export const toRoutePrefix = (path: string | undefined): string => {
  const candidate = (path ?? DEFAULT_CONFIG.path ?? '').trim();

  const segments = candidate.split('/').filter((segment) => segment.length > 0);

  for (const segment of segments) {
    // `.` and `..` are made of allowed characters and are still not a place to
    // mount something; the forwarding header refuses them for the same reason.
    if (!SAFE_PATH_SEGMENT.test(segment) || segment === '.' || segment === '..') {
      throw new Error(
        `NestLens: \`path\` must be a URL path made of letters, digits, "-", ".", "_" or "~" ` +
          `separated by "/". Received ${JSON.stringify(path)}.`,
      );
    }
  }

  return segments.join('/');
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
 * Longest header value worth examining.
 *
 * A mount prefix is a path segment or two; nothing legitimate approaches this.
 * The cap exists because everything below runs on a value anyone can send, and
 * a header can carry kilobytes: trimming and stripping trailing slashes on
 * megabytes of input is work done on behalf of the sender.
 */
const MAX_FORWARDED_PREFIX_LENGTH = 256;

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
  if (header.length > MAX_FORWARDED_PREFIX_LENGTH) return '';

  // Trailing slashes are stripped by index rather than by regex: `/\/+$/` walks
  // backwards from every position on a value made of slashes, which is quadratic
  // in the length of a header the caller chooses.
  const trimmed = header.trim();
  let end = trimmed.length;
  while (end > 0 && trimmed[end - 1] === '/') end -= 1;
  const candidate = trimmed.slice(0, end);

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
 * Whether a path is the given mount point or something under it.
 *
 * Compared segment by segment rather than by `startsWith`, which has no idea
 * where a path segment ends: `/nestlens` also prefixes `/nestlens-admin`, an
 * ordinary route name for an application to have, and matching it meant the
 * application's own traffic was silently left unrecorded.
 *
 * An empty base matches nothing. `''` prefixes every string there is, and the
 * caller below relies on this: mounted at the server root, NestLens has no path
 * of its own to recognise, and reading `''` as a prefix made every request in
 * the application count as NestLens's own — nothing was recorded at all.
 */
const isUnder = (requestPath: string, base: string): boolean =>
  base.length > 0 && (requestPath === base || requestPath.startsWith(`${base}/`));

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
  const dashboardPath = toBaseHref(configuredPath);
  // An empty mount path is the whole server, so there is no prefix that
  // identifies NestLens by position: only the API is still ours. Composing it
  // with the global prefix anyway would make `/api` the dashboard's path and
  // hide every route the application serves under it.
  const dashboard = dashboardPath.length > 0 ? `${prefix}${dashboardPath}` : '';
  const api = `${prefix}/${NESTLENS_API_PREFIX}`;

  return isUnder(requestPath, api) || isUnder(requestPath, dashboard);
};
