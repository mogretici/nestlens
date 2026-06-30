/**
 * Adapter compatibility integration tests.
 *
 * Boots a real NestJS application on BOTH the Express and Fastify adapters and
 * exercises the NestLens request interceptor, exception filter and dashboard
 * controller over real HTTP. This is the regression guard for issue #8
 * ("Not working with Fastify adapter": `response.status(...).json is not a function`).
 */
import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  INestApplication,
  Module,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { join } from 'path';
import { existsSync } from 'fs';
import request from 'supertest';
import { NestLensModule } from '../../nestlens.module';
import { DashboardController } from '../../api/dashboard.controller';
import { REQUEST_ID_HEADER } from '../../watchers/request.watcher';

@Controller('test')
class TestController {
  @Get('ok')
  ok(): { ok: boolean } {
    return { ok: true };
  }

  @Get('http-error')
  httpError(): never {
    throw new HttpException(
      { statusCode: HttpStatus.I_AM_A_TEAPOT, message: 'teapot', error: "I'm a teapot" },
      HttpStatus.I_AM_A_TEAPOT,
    );
  }

  @Get('generic-error')
  genericError(): never {
    throw new Error('boom');
  }
}

@Module({
  imports: [NestLensModule.forRoot({ watchers: { request: true, exception: true } })],
  controllers: [TestController],
})
class AppModule {}

type AdapterName = 'Express' | 'Fastify';

const realDashboardPublic = join(process.cwd(), 'dist', 'dashboard', 'public');
const hasBuiltDashboard = existsSync(join(realDashboardPublic, 'index.html'));

async function createApp(adapter: AdapterName): Promise<INestApplication> {
  const app =
    adapter === 'Fastify'
      ? await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
          logger: false,
        })
      : await NestFactory.create(AppModule, new ExpressAdapter(), { logger: false });

  // Point the dashboard controller at the actually-built static assets.
  const dashboard = app.get(DashboardController);
  (dashboard as unknown as { dashboardPath: string }).dashboardPath = realDashboardPublic;

  await app.init();
  if (adapter === 'Fastify') {
    await (app as NestFastifyApplication).getHttpAdapter().getInstance().ready();
  }
  return app;
}

describe.each<AdapterName>(['Express', 'Fastify'])('NestLens on %s adapter', (adapter) => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    app = await createApp(adapter);
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('RequestWatcher', () => {
    it('responds 200 and attaches the request id header (adapter-agnostic setHeader)', async () => {
      const res = await request(server).get('/test/ok');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(res.headers[REQUEST_ID_HEADER]).toBeDefined();
    });
  });

  describe('ExceptionWatcher', () => {
    it('returns the HttpException as JSON (no "json is not a function")', async () => {
      const res = await request(server).get('/test/http-error');

      expect(res.status).toBe(HttpStatus.I_AM_A_TEAPOT);
      expect(res.body).toMatchObject({ message: 'teapot' });
    });

    it('returns generic errors as a 500 JSON payload', async () => {
      const res = await request(server).get('/test/generic-error');

      expect(res.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(res.body).toMatchObject({ statusCode: 500 });
    });
  });

  describe('DashboardController', () => {
    const maybe = hasBuiltDashboard ? it : it.skip;

    maybe('serves index.html as text/html on the dashboard root (StreamableFile)', async () => {
      const res = await request(server).get('/nestlens');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).toContain('<');
    });

    maybe('serves a SPA route as index.html', async () => {
      const res = await request(server).get('/nestlens/requests');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
    });

    maybe('returns 404 for a missing asset (NotFoundException)', async () => {
      const res = await request(server).get('/nestlens/assets/does-not-exist.js');

      expect(res.status).toBe(404);
    });
  });
});
