declare global {
  interface Window {
    /** Mount point injected into index.html by DashboardController. */
    __NESTLENS_BASE__?: string;
  }
}

/**
 * Where NestLens is mounted, e.g. `/nestlens` or `/admin/monitoring`.
 *
 * The server injects this at request time because the bundle is built once but
 * mounted wherever `NestLensConfig.path` points. Under the Vite dev server
 * nothing is injected and NestLens is proxied from the origin root, so the
 * empty string is the correct fallback.
 */
export const getBasePath = (): string => window.__NESTLENS_BASE__ ?? '';

/** Absolute URL for a NestLens internal endpoint, e.g. `/api/entries`. */
export const nestlensUrl = (endpoint: string): string =>
  `${window.location.origin}${getBasePath()}/__nestlens__${endpoint}`;
