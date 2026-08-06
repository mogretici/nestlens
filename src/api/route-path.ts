import { DEFAULT_CONFIG } from '../nestlens.config';

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
