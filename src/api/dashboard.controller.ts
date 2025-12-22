import {
  Controller,
  Get,
  Inject,
  Param,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { join } from 'path';
import { existsSync } from 'fs';
import { NestLensConfig, NESTLENS_CONFIG } from '../nestlens.config';
import { NestLensGuard } from './api.guard';

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

  @Get()
  serveDashboard(@Req() req: Request, @Res() res: Response) {
    // Redirect /nestlens to /nestlens/ for SPA routing consistency
    if (!req.originalUrl.endsWith('/')) {
      return res.redirect(301, req.originalUrl + '/');
    }

    const indexPath = join(this.dashboardPath, 'index.html');
    if (existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).json({ error: 'Dashboard not found' });
    }
  }

  @Get('assets/:filename')
  serveAssets(@Param('filename') filename: string, @Res() res: Response) {
    const assetPath = join(this.dashboardPath, 'assets', filename);
    if (existsSync(assetPath)) {
      res.sendFile(assetPath);
    } else {
      res.status(404).json({ error: 'Asset not found' });
    }
  }

  // Serve static files like favicon
  @Get(':filename.svg')
  serveStaticFile(@Param('filename') filename: string, @Res() res: Response) {
    const filePath = join(this.dashboardPath, `${filename}.svg`);
    if (existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).json({ error: 'File not found' });
    }
  }

  // SPA routes - serve index.html for client-side routing
  @Get('requests')
  serveRequestsRoute(@Res() res: Response) {
    this.serveIndexHtml(res);
  }

  @Get('queries')
  serveQueriesRoute(@Res() res: Response) {
    this.serveIndexHtml(res);
  }

  @Get('exceptions')
  serveExceptionsRoute(@Res() res: Response) {
    this.serveIndexHtml(res);
  }

  @Get('logs')
  serveLogsRoute(@Res() res: Response) {
    this.serveIndexHtml(res);
  }

  @Get('entries/:id')
  serveEntryDetailRoute(@Res() res: Response) {
    this.serveIndexHtml(res);
  }

  @Get('events')
  serveEventsRoute(@Res() res: Response) {
    this.serveIndexHtml(res);
  }

  @Get('events/:id')
  serveEventDetailRoute(@Res() res: Response) {
    this.serveIndexHtml(res);
  }

  @Get('jobs')
  serveJobsRoute(@Res() res: Response) {
    this.serveIndexHtml(res);
  }

  @Get('jobs/:id')
  serveJobDetailRoute(@Res() res: Response) {
    this.serveIndexHtml(res);
  }

  @Get('cache')
  serveCacheRoute(@Res() res: Response) {
    this.serveIndexHtml(res);
  }

  @Get('cache/:id')
  serveCacheDetailRoute(@Res() res: Response) {
    this.serveIndexHtml(res);
  }

  @Get('mail')
  serveMailRoute(@Res() res: Response) {
    this.serveIndexHtml(res);
  }

  @Get('mail/:id')
  serveMailDetailRoute(@Res() res: Response) {
    this.serveIndexHtml(res);
  }

  @Get('schedule')
  serveScheduleRoute(@Res() res: Response) {
    this.serveIndexHtml(res);
  }

  @Get('schedule/:id')
  serveScheduleDetailRoute(@Res() res: Response) {
    this.serveIndexHtml(res);
  }

  @Get('http-client')
  serveHttpClientRoute(@Res() res: Response) {
    this.serveIndexHtml(res);
  }

  @Get('http-client/:id')
  serveHttpClientDetailRoute(@Res() res: Response) {
    this.serveIndexHtml(res);
  }

  @Get('requests/:id')
  serveRequestDetailRoute(@Res() res: Response) {
    this.serveIndexHtml(res);
  }

  @Get('queries/:id')
  serveQueryDetailRoute(@Res() res: Response) {
    this.serveIndexHtml(res);
  }

  @Get('exceptions/:id')
  serveExceptionDetailRoute(@Res() res: Response) {
    this.serveIndexHtml(res);
  }

  @Get('logs/:id')
  serveLogDetailRoute(@Res() res: Response) {
    this.serveIndexHtml(res);
  }

  // New Advanced Routes
  @Get('redis')
  serveRedisRoute(@Res() res: Response) {
    this.serveIndexHtml(res);
  }

  @Get('redis/:id')
  serveRedisDetailRoute(@Res() res: Response) {
    this.serveIndexHtml(res);
  }

  @Get('models')
  serveModelsRoute(@Res() res: Response) {
    this.serveIndexHtml(res);
  }

  @Get('models/:id')
  serveModelDetailRoute(@Res() res: Response) {
    this.serveIndexHtml(res);
  }

  @Get('notifications')
  serveNotificationsRoute(@Res() res: Response) {
    this.serveIndexHtml(res);
  }

  @Get('notifications/:id')
  serveNotificationDetailRoute(@Res() res: Response) {
    this.serveIndexHtml(res);
  }

  @Get('views')
  serveViewsRoute(@Res() res: Response) {
    this.serveIndexHtml(res);
  }

  @Get('views/:id')
  serveViewDetailRoute(@Res() res: Response) {
    this.serveIndexHtml(res);
  }

  @Get('commands')
  serveCommandsRoute(@Res() res: Response) {
    this.serveIndexHtml(res);
  }

  @Get('commands/:id')
  serveCommandDetailRoute(@Res() res: Response) {
    this.serveIndexHtml(res);
  }

  @Get('gates')
  serveGatesRoute(@Res() res: Response) {
    this.serveIndexHtml(res);
  }

  @Get('gates/:id')
  serveGateDetailRoute(@Res() res: Response) {
    this.serveIndexHtml(res);
  }

  @Get('batches')
  serveBatchesRoute(@Res() res: Response) {
    this.serveIndexHtml(res);
  }

  @Get('batches/:id')
  serveBatchDetailRoute(@Res() res: Response) {
    this.serveIndexHtml(res);
  }

  @Get('dumps')
  serveDumpsRoute(@Res() res: Response) {
    this.serveIndexHtml(res);
  }

  @Get('dumps/:id')
  serveDumpDetailRoute(@Res() res: Response) {
    this.serveIndexHtml(res);
  }

  private serveIndexHtml(res: Response): void {
    const indexPath = join(this.dashboardPath, 'index.html');
    if (existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).json({ error: 'Dashboard not found' });
    }
  }
}
