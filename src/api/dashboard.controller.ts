import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { createReadStream, existsSync } from 'fs';
import { extname, join, resolve, sep } from 'path';
import { NestLensConfig, NESTLENS_CONFIG } from '../nestlens.config';
import { NestLensGuard } from './api.guard';

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

@Controller('nestlens')
@UseGuards(NestLensGuard)
export class DashboardController {
  private readonly dashboardPath: string;

  constructor(
    @Inject(NESTLENS_CONFIG)
    private readonly config: NestLensConfig,
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

  private serveIndexHtml(): StreamableFile {
    return this.streamFile('index.html', 'Dashboard not found');
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
