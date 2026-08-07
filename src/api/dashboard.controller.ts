import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { createReadStream, existsSync, readFileSync } from 'fs';
import { extname, join, resolve, sep } from 'path';
import { ApplicationConfig } from '@nestjs/core';
import { NestLensConfig, NESTLENS_CONFIG } from '../nestlens.config';
import { NestLensGuard } from './api.guard';
import { toBaseHref } from './route-path';

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

  constructor(
    @Inject(NESTLENS_CONFIG)
    private readonly config: NestLensConfig,
    private readonly applicationConfig: ApplicationConfig,
  ) {
    // Dashboard static files are bundled in dist/dashboard/public
    this.dashboardPath = join(__dirname, '..', 'dashboard', 'public');
  }

  // Dashboard root. The built index.html references all assets with absolute
  // `/nestlens/...` URLs, so no trailing-slash redirect is needed — keeping this
  // a plain handler makes it work identically on Express and Fastify.
  @Get()
  serveDashboard(): StreamableFile {
    return this.serveIndexHtml();
  }

  @Get('assets/:filename')
  serveAssets(@Param('filename') filename: string): StreamableFile {
    return this.streamFile(join('assets', filename), 'Asset not found');
  }

  // Serve static files like favicon
  @Get(':filename.svg')
  serveStaticFile(@Param('filename') filename: string): StreamableFile {
    return this.streamFile(`${filename}.svg`, 'File not found');
  }

  // SPA routes - serve index.html for client-side routing
  @Get('requests')
  serveRequestsRoute(): StreamableFile {
    return this.serveIndexHtml();
  }

  @Get('queries')
  serveQueriesRoute(): StreamableFile {
    return this.serveIndexHtml();
  }

  @Get('exceptions')
  serveExceptionsRoute(): StreamableFile {
    return this.serveIndexHtml();
  }

  @Get('logs')
  serveLogsRoute(): StreamableFile {
    return this.serveIndexHtml();
  }

  @Get('entries/:id')
  serveEntryDetailRoute(): StreamableFile {
    return this.serveIndexHtml();
  }

  @Get('events')
  serveEventsRoute(): StreamableFile {
    return this.serveIndexHtml();
  }

  @Get('events/:id')
  serveEventDetailRoute(): StreamableFile {
    return this.serveIndexHtml();
  }

  @Get('jobs')
  serveJobsRoute(): StreamableFile {
    return this.serveIndexHtml();
  }

  @Get('jobs/:id')
  serveJobDetailRoute(): StreamableFile {
    return this.serveIndexHtml();
  }

  @Get('cache')
  serveCacheRoute(): StreamableFile {
    return this.serveIndexHtml();
  }

  @Get('cache/:id')
  serveCacheDetailRoute(): StreamableFile {
    return this.serveIndexHtml();
  }

  @Get('mail')
  serveMailRoute(): StreamableFile {
    return this.serveIndexHtml();
  }

  @Get('mail/:id')
  serveMailDetailRoute(): StreamableFile {
    return this.serveIndexHtml();
  }

  @Get('schedule')
  serveScheduleRoute(): StreamableFile {
    return this.serveIndexHtml();
  }

  @Get('schedule/:id')
  serveScheduleDetailRoute(): StreamableFile {
    return this.serveIndexHtml();
  }

  @Get('http-client')
  serveHttpClientRoute(): StreamableFile {
    return this.serveIndexHtml();
  }

  @Get('http-client/:id')
  serveHttpClientDetailRoute(): StreamableFile {
    return this.serveIndexHtml();
  }

  @Get('requests/:id')
  serveRequestDetailRoute(): StreamableFile {
    return this.serveIndexHtml();
  }

  @Get('queries/:id')
  serveQueryDetailRoute(): StreamableFile {
    return this.serveIndexHtml();
  }

  @Get('exceptions/:id')
  serveExceptionDetailRoute(): StreamableFile {
    return this.serveIndexHtml();
  }

  @Get('logs/:id')
  serveLogDetailRoute(): StreamableFile {
    return this.serveIndexHtml();
  }

  // New Advanced Routes
  @Get('redis')
  serveRedisRoute(): StreamableFile {
    return this.serveIndexHtml();
  }

  @Get('redis/:id')
  serveRedisDetailRoute(): StreamableFile {
    return this.serveIndexHtml();
  }

  @Get('models')
  serveModelsRoute(): StreamableFile {
    return this.serveIndexHtml();
  }

  @Get('models/:id')
  serveModelDetailRoute(): StreamableFile {
    return this.serveIndexHtml();
  }

  @Get('notifications')
  serveNotificationsRoute(): StreamableFile {
    return this.serveIndexHtml();
  }

  @Get('notifications/:id')
  serveNotificationDetailRoute(): StreamableFile {
    return this.serveIndexHtml();
  }

  @Get('views')
  serveViewsRoute(): StreamableFile {
    return this.serveIndexHtml();
  }

  @Get('views/:id')
  serveViewDetailRoute(): StreamableFile {
    return this.serveIndexHtml();
  }

  @Get('commands')
  serveCommandsRoute(): StreamableFile {
    return this.serveIndexHtml();
  }

  @Get('commands/:id')
  serveCommandDetailRoute(): StreamableFile {
    return this.serveIndexHtml();
  }

  @Get('gates')
  serveGatesRoute(): StreamableFile {
    return this.serveIndexHtml();
  }

  @Get('gates/:id')
  serveGateDetailRoute(): StreamableFile {
    return this.serveIndexHtml();
  }

  @Get('batches')
  serveBatchesRoute(): StreamableFile {
    return this.serveIndexHtml();
  }

  @Get('batches/:id')
  serveBatchDetailRoute(): StreamableFile {
    return this.serveIndexHtml();
  }

  @Get('dumps')
  serveDumpsRoute(): StreamableFile {
    return this.serveIndexHtml();
  }

  @Get('dumps/:id')
  serveDumpDetailRoute(): StreamableFile {
    return this.serveIndexHtml();
  }

  @Get('graphql')
  serveGraphQLRoute(): StreamableFile {
    return this.serveIndexHtml();
  }

  @Get('graphql/:id')
  serveGraphQLDetailRoute(): StreamableFile {
    return this.serveIndexHtml();
  }

  /**
   * The dashboard bundle is built once but can be mounted anywhere, so the
   * mount point is injected into `index.html` at request time: `<base>` resolves
   * the bundle's relative asset URLs, and `window.__NESTLENS_BASE__` tells the
   * SPA where to put its router basename and API calls.
   */
  private serveIndexHtml(): StreamableFile {
    const absolutePath = this.resolveDashboardFile('index.html', 'Dashboard not found');
    const html = readFileSync(absolutePath, 'utf8');

    return new StreamableFile(Buffer.from(this.injectBasePath(html), 'utf8'), {
      type: MIME_TYPES['.html'] as string,
    });
  }

  /**
   * Where the dashboard actually lives, from the browser's point of view.
   *
   * `config.path` alone is not enough: `app.setGlobalPrefix('api')` shifts every
   * NestLens route to `/api/nestlens` without the module knowing, and the
   * injected `<base href>` would then point the bundle at `/nestlens/assets/*` —
   * a 404 for every asset, leaving a blank page while the API kept working.
   */
  private mountPoint(): string {
    const dashboardPath = toBaseHref(this.config.path);
    const globalPrefix = this.applicationConfig.getGlobalPrefix().replace(/^\/|\/$/g, '');

    if (!globalPrefix) return dashboardPath;

    // A route listed under `exclude` keeps the global prefix off, so the
    // dashboard stays where `config.path` put it.
    const exclusions = this.applicationConfig.getGlobalPrefixOptions().exclude ?? [];
    const isExcluded = exclusions.some((route) =>
      route.pathRegex?.test(dashboardPath.length > 0 ? dashboardPath : '/'),
    );

    return isExcluded ? dashboardPath : `/${globalPrefix}${dashboardPath}`;
  }

  private injectBasePath(html: string): string {
    const baseHref = this.mountPoint();
    const injection =
      `<base href="${escapeHtmlAttribute(`${baseHref}/`)}" />` +
      `<script>window.__NESTLENS_BASE__=${JSON.stringify(baseHref)}</script>`;

    return html.replace('<head>', `<head>${injection}`);
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

  /** Stream a dashboard file. Adapter-agnostic via StreamableFile. */
  private streamFile(relativePath: string, notFoundMessage: string): StreamableFile {
    const absolutePath = this.resolveDashboardFile(relativePath, notFoundMessage);
    return new StreamableFile(createReadStream(absolutePath), {
      type: this.contentTypeFor(absolutePath),
    });
  }
}
