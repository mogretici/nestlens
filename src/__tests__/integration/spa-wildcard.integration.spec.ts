/**
 * The SPA catch-all, against both routers.
 *
 * `/nestlens/requests/42` is a route inside the dashboard, so the mount needs a
 * pattern that matches any depth — and the two routers spell that differently.
 * Express 5 dropped the bare star that Fastify requires; NestJS accepts it,
 * rewrites it, and prints a deprecation notice about our route into the host
 * application's log on every boot. Naming the wildcard the way Express 5 wants
 * is what stops the notice, and is exactly what stopped Fastify booting at all
 * in 0.8.0.
 *
 * These boot real applications on both adapters and check both halves: the
 * warning is gone, and deep links still resolve. The unit tests below cover the
 * versions this machine cannot install; the compatibility matrix in CI runs the
 * whole thing on NestJS 9, 10 and 11.
 */
import { ConsoleLogger, INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { existsSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import { NestLensModule } from '../../nestlens.module';
import { DashboardController } from '../../api/dashboard.controller';
import { toSpaWildcard } from '../../api/spa-wildcard';

const dashboardPublic = join(process.cwd(), 'dist', 'dashboard', 'public');
const hasBuiltDashboard = existsSync(join(dashboardPublic, 'index.html'));

/** Collects what NestJS says while an application starts. */
class RecordingLogger extends ConsoleLogger {
  readonly warnings: string[] = [];

  warn(message: unknown): void {
    this.warnings.push(String(message));
  }

  log(): void {}
  debug(): void {}
  verbose(): void {}
}

@Module({ imports: [NestLensModule.forRoot({ enabled: true })] })
class AppModule {}

describe('toSpaWildcard', () => {
  /**
   * Express 4 reads `*path` as a star followed by the literal text `path`, so
   * NestJS 9 and 10 need the bare form — the case this machine cannot install
   * and CI's matrix does run.
   */
  it('keeps the bare star for Express 4', () => {
    expect(toSpaWildcard('express', 4)).toBe('*');
  });

  it('names the wildcard for Express 5', () => {
    expect(toSpaWildcard('express', 5)).toBe('*path');
  });

  it('keeps the bare star for Fastify, whatever Express is doing', () => {
    expect(toSpaWildcard('fastify', 5)).toBe('*');
    expect(toSpaWildcard('fastify', undefined)).toBe('*');
  });

  /**
   * An adapter that does not identify itself, or an Express whose version could
   * not be read, falls back to the form every router has always accepted.
   */
  it('falls back to the bare star when it cannot tell', () => {
    expect(toSpaWildcard(undefined, undefined)).toBe('*');
    expect(toSpaWildcard('express', undefined)).toBe('*');
  });
});

const describeWithDashboard = hasBuiltDashboard ? describe : describe.skip;

describeWithDashboard('the mounted catch-all', () => {
  let app: INestApplication;
  let logger: RecordingLogger;

  afterEach(async () => {
    await app?.close();
  });

  it('serves deep links on Express without a deprecation notice', async () => {
    // Arrange
    logger = new RecordingLogger();

    // Act
    app = await NestFactory.create(AppModule, new ExpressAdapter(), { logger });
    // Under ts-jest the controller resolves the bundle relative to `src/`; the
    // build puts it under `dist/`.
    (app.get(DashboardController) as unknown as { dashboardPath: string }).dashboardPath =
      dashboardPublic;
    await app.init();

    // Assert
    const routeComplaints = logger.warnings.filter((line) => line.includes('route path'));
    expect(routeComplaints).toEqual([]);

    const deepLink = await request(app.getHttpServer()).get('/nestlens/requests/42');
    expect(deepLink.status).toBe(200);
    expect(deepLink.headers['content-type']).toContain('text/html');
  });

  it('still boots on Fastify and serves the same deep link', async () => {
    // Arrange
    logger = new RecordingLogger();

    // Act - 0.8.0 died here: Fastify rejects anything after the star
    const fastifyApp = await NestFactory.create<NestFastifyApplication>(
      AppModule,
      new FastifyAdapter(),
      { logger },
    );
    app = fastifyApp;
    (fastifyApp.get(DashboardController) as unknown as { dashboardPath: string }).dashboardPath =
      dashboardPublic;
    await fastifyApp.init();
    await fastifyApp.getHttpAdapter().getInstance().ready();

    // Assert
    const deepLink = await fastifyApp.inject({ method: 'GET', url: '/nestlens/requests/42' });
    expect(deepLink.statusCode).toBe(200);
    expect(deepLink.headers['content-type']).toContain('text/html');
    expect(logger.warnings.filter((line) => line.includes('route path'))).toEqual([]);
  });
});
