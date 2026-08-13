import {
  Controller,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { extname, join, resolve, sep } from 'path';
import { ApplicationConfig, HttpAdapterHost } from '@nestjs/core';
import { NestLensConfig, NESTLENS_CONFIG } from '../nestlens.config';
import { NestLensGuard } from './api.guard';
import { toBaseHref, toForwardedPrefix } from './route-path';
import { compress, ContentEncoding, isCompressible, negotiateEncoding } from './content-encoding';

/** Set by reverse proxies that serve the application under a stripped path. */
const FORWARDED_PREFIX_HEADER = 'x-forwarded-prefix';
const ACCEPT_ENCODING_HEADER = 'accept-encoding';

/**
 * Cache policies for the bundled dashboard.
 *
 * Vite fingerprints everything under `assets/` (`index-Bu05f2IL.js`), so a
 * changed file always arrives under a new URL and the old one can be kept
 * forever. Everything else — `index.html` and the root-level icons — keeps its
 * name across releases, and `index.html` additionally carries a mount point
 * injected per request, so it must be revalidated every time.
 */
const IMMUTABLE = 'public, max-age=31536000, immutable';
const NO_CACHE = 'no-cache';

const escapeHtmlAttribute = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Content-Type lookup for the static dashboard assets.
 * Kept explicit so file serving stays adapter-agnostic (no reliance on
 * Express' `res.sendFile`, which Fastify does not implement).
 */
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.txt': 'text/plain; charset=utf-8',
};

// The prefix here is only the default; `NestLensModule.forRoot()` rewrites it
// from `config.path` before Nest resolves routes.
@Controller('nestlens')
@UseGuards(NestLensGuard)
export class DashboardController {
  private readonly dashboardPath: string;
  private readonly fileCache = new Map<string, Buffer>();
  /**
   * Compressed asset bodies, keyed by file and encoding.
   *
   * Only files read off disk are cached here. `index.html` is rebuilt per
   * request with the mount point injected, and under `trustProxy` that mount
   * point comes from a header — caching by its value would let a caller grow
   * this map without limit. It stays below the compression threshold anyway.
   */
  private readonly compressedCache = new Map<string, Buffer>();
  /** Bundled directories, listed once: the bundle cannot change while the process runs. */
  private readonly directoryListings = new Map<string, Map<string, string>>();

  constructor(
    @Inject(NESTLENS_CONFIG)
    private readonly config: NestLensConfig,
    private readonly applicationConfig: ApplicationConfig,
    private readonly httpAdapterHost: HttpAdapterHost,
  ) {
    // Dashboard static files are bundled in dist/dashboard/public
    this.dashboardPath = join(__dirname, '..', 'dashboard', 'public');
  }

  /**
   * What a bundled file may be called.
   *
   * Vite emits `index-Bu05f2IL.js`, `nestlens-icon.svg` and nothing stranger.
   * Checking the name before it reaches `resolve()` means a traversal attempt
   * never becomes a path at all — the containment check below stays as the
   * second line, not the only one.
   */
  private static readonly SAFE_FILENAME = /^[A-Za-z0-9._-]+$/;

  @Get('assets/:filename')
  serveAssets(
    @Param('filename') filename: string,
    @Res() res: unknown,
    @Headers(ACCEPT_ENCODING_HEADER) acceptEncoding?: string,
  ): Promise<void> {
    return this.sendResolvedFile(
      res,
      this.bundledFile('assets', filename, 'Asset not found'),
      IMMUTABLE,
      acceptEncoding,
    );
  }

  // Favicon and other root-level static files.
  @Get(':filename.svg')
  serveStaticFile(
    @Param('filename') filename: string,
    @Res() res: unknown,
    @Headers(ACCEPT_ENCODING_HEADER) acceptEncoding?: string,
  ): Promise<void> {
    return this.sendResolvedFile(
      res,
      this.bundledFile('', `${filename}.svg`, 'File not found'),
      NO_CACHE,
      acceptEncoding,
    );
  }

  @Get()
  serveDashboard(
    @Res() res: unknown,
    @Headers(FORWARDED_PREFIX_HEADER) forwarded?: string,
    @Headers(ACCEPT_ENCODING_HEADER) acceptEncoding?: string,
  ): Promise<void> {
    return this.sendIndexHtml(res, forwarded, acceptEncoding);
  }

  /**
   * Every other path under the mount point belongs to the SPA's client-side
   * router, so it gets index.html and React decides what to render — including
   * its own not-found page. Declared last so the asset and SVG routes above win.
   *
   * The bare `*` here is the fallback, not the final answer: it is the one form
   * every router has always accepted, and Express 5 takes it only under protest,
   * logging a deprecation notice about our route on every boot.
   * {@link SpaRouteRegistrar} replaces it with whichever form the adapter in use
   * actually wants, before Nest resolves routes.
   */
  @Get('*')
  serveSpaRoute(
    @Res() res: unknown,
    @Headers(FORWARDED_PREFIX_HEADER) forwarded?: string,
    @Headers(ACCEPT_ENCODING_HEADER) acceptEncoding?: string,
  ): Promise<void> {
    return this.sendIndexHtml(res, forwarded, acceptEncoding);
  }

  /**
   * The dashboard bundle is built once but can be mounted anywhere, so the
   * mount point is injected into `index.html` at request time: `<base>` resolves
   * the bundle's relative asset URLs, and `window.__NESTLENS_BASE__` tells the
   * SPA where to put its router basename and API calls.
   */
  private sendIndexHtml(
    res: unknown,
    forwardedPrefix?: string,
    acceptEncoding?: string,
  ): Promise<void> {
    const absolutePath = this.resolveDashboardFile('index.html', 'Dashboard not found');
    const html = this.injectBasePath(
      this.readCached(absolutePath).toString('utf8'),
      forwardedPrefix,
    );

    return this.send(res, html, MIME_TYPES['.html'] as string, NO_CACHE, acceptEncoding);
  }

  private sendResolvedFile(
    res: unknown,
    absolutePath: string,
    cacheControl: string,
    acceptEncoding?: string,
  ): Promise<void> {
    return this.send(
      res,
      this.readCached(absolutePath),
      this.contentTypeFor(absolutePath),
      cacheControl,
      acceptEncoding,
      absolutePath,
    );
  }

  /**
   * Reads a bundled file once and keeps it in memory.
   *
   * Writing the response ourselves means handing the adapter a complete body
   * rather than a stream, so without this the whole ~1 MB bundle would be read
   * synchronously on every dashboard load — 34 files, blocking the event loop
   * of the application NestLens is supposed to be observing.
   *
   * The bundle ships inside the package and cannot change while the process is
   * running, so caching it is safe. Existence is still checked per request, so
   * a deleted file still 404s.
   */
  private readCached(absolutePath: string): Buffer {
    const cached = this.fileCache.get(absolutePath);
    if (cached) return cached;

    // A file that vanished after the listing was taken is a 404, not a 500:
    // the bundle ships inside the package and is not supposed to move, but an
    // upgrade that replaces it under a running process should not surface as a
    // server error.
    try {
      const contents = readFileSync(absolutePath);
      this.fileCache.set(absolutePath, contents);

      return contents;
    } catch {
      throw new NotFoundException('File not found');
    }
  }

  /**
   * Writes the response directly instead of returning it.
   *
   * A value returned from a handler passes through the host application's
   * global interceptors, and a typical "wrap every response" interceptor turns
   * this HTML into JSON — the dashboard then loads nothing. Taking over the
   * response keeps NestLens's own surface out of that pipeline.
   */
  private async send(
    res: unknown,
    body: string | Buffer,
    contentType: string,
    cacheControl: string,
    acceptEncoding?: string,
    cacheKey?: string,
  ): Promise<void> {
    const adapter = this.httpAdapterHost.httpAdapter;
    const raw = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
    const encoding = isCompressible(contentType, raw.length)
      ? negotiateEncoding(acceptEncoding)
      : undefined;
    const payload = encoding ? await this.compressed(raw, encoding, cacheKey) : raw;

    adapter.setHeader(res, 'Content-Type', contentType);
    adapter.setHeader(res, 'Cache-Control', cacheControl);
    // Set whether or not this particular response was compressed: the body a
    // shared cache stores depends on the request's Accept-Encoding either way,
    // and `immutable` tells that cache to keep it for a year.
    adapter.setHeader(res, 'Vary', 'Accept-Encoding');
    if (encoding) adapter.setHeader(res, 'Content-Encoding', encoding);
    // A raw Buffer cannot go through `reply()`: Express treats any object as
    // JSON and serialises it to `{"type":"Buffer","data":[...]}`, which turns
    // every script and font into garbage. StreamableFile is the shape both
    // adapters special-case for binary payloads.
    adapter.reply(res, new StreamableFile(payload, { length: payload.length }), 200);
  }

  private async compressed(
    raw: Buffer,
    encoding: ContentEncoding,
    cacheKey?: string,
  ): Promise<Buffer> {
    if (!cacheKey) return compress(raw, encoding);

    const key = `${cacheKey}|${encoding}`;
    const cached = this.compressedCache.get(key);
    if (cached) return cached;

    const compressedBody = await compress(raw, encoding);
    this.compressedCache.set(key, compressedBody);

    return compressedBody;
  }

  /**
   * Where the dashboard actually lives, from the browser's point of view.
   *
   * `config.path` alone is not enough: `app.setGlobalPrefix('api')` shifts every
   * NestLens route to `/api/nestlens` without the module knowing, and the
   * injected `<base href>` would then point the bundle at `/nestlens/assets/*` —
   * a 404 for every asset, leaving a blank page while the API kept working.
   *
   * A reverse proxy that strips a path segment adds a second discrepancy, and it
   * sits outside the application entirely: `X-Forwarded-Prefix` is the only
   * signal that the browser is really at `/tools/nestlens`. It goes in front of
   * the global prefix, because that is the order the browser sees — the proxy's
   * segment, then everything the application itself adds.
   */
  private mountPoint(forwardedPrefix?: string): string {
    const proxyPrefix = this.config.trustProxy ? toForwardedPrefix(forwardedPrefix) : '';
    const dashboardPath = toBaseHref(this.config.path);
    const globalPrefix = this.applicationConfig.getGlobalPrefix().replace(/^\/|\/$/g, '');

    if (!globalPrefix) return `${proxyPrefix}${dashboardPath}`;

    // A route listed under `exclude` keeps the global prefix off, so the
    // dashboard stays where `config.path` put it. The proxy prefix is not part
    // of what Nest matched against, so it is excluded from this test.
    const exclusions = this.applicationConfig.getGlobalPrefixOptions().exclude ?? [];
    const isExcluded = exclusions.some((route) =>
      route.pathRegex?.test(dashboardPath.length > 0 ? dashboardPath : '/'),
    );

    return isExcluded
      ? `${proxyPrefix}${dashboardPath}`
      : `${proxyPrefix}/${globalPrefix}${dashboardPath}`;
  }

  private injectBasePath(html: string, forwardedPrefix?: string): string {
    const baseHref = this.mountPoint(forwardedPrefix);
    const injection =
      `<base href="${escapeHtmlAttribute(`${baseHref}/`)}" />` +
      `<script>window.__NESTLENS_BASE__=${JSON.stringify(baseHref)}</script>`;

    return html.replace('<head>', `<head>${injection}`);
  }

  /**
   * The name of a bundled file, or a 404.
   *
   * The request selects from what is on disk rather than describing a path: the
   * directory is listed once, and the value returned here is the entry from
   * that listing, not the string the caller sent. A traversal cannot be
   * expressed, because nothing the caller writes is ever joined to a directory.
   *
   * The containment check below stays as the second line — this is the first.
   */
  private bundledFile(directory: string, filename: string, notFoundMessage: string): string {
    if (!DashboardController.SAFE_FILENAME.test(filename) || filename.includes('..')) {
      throw new NotFoundException(notFoundMessage);
    }

    let listing = this.directoryListings.get(directory);
    if (!listing) {
      const root = resolve(this.dashboardPath);
      const absoluteDirectory = directory === '' ? root : join(root, directory);
      listing = new Map(
        (existsSync(absoluteDirectory) ? readdirSync(absoluteDirectory) : []).map((name) => [
          name,
          join(absoluteDirectory, name),
        ]),
      );
      this.directoryListings.set(directory, listing);
    }

    const found = listing.get(filename);
    if (!found) {
      throw new NotFoundException(notFoundMessage);
    }

    return found;
  }

  /**
   * Resolve a path inside the dashboard directory, rejecting anything that
   * escapes it (path traversal) or does not exist.
   */
  private resolveDashboardFile(relativePath: string, notFoundMessage: string): string {
    const root = resolve(this.dashboardPath);
    const absolutePath = resolve(root, relativePath);

    if (absolutePath !== root && !absolutePath.startsWith(root + sep)) {
      throw new NotFoundException(notFoundMessage);
    }

    if (!existsSync(absolutePath)) {
      throw new NotFoundException(notFoundMessage);
    }

    return absolutePath;
  }

  private contentTypeFor(absolutePath: string): string {
    return MIME_TYPES[extname(absolutePath).toLowerCase()] ?? 'application/octet-stream';
  }
}
