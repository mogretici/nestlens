/**
 * Isolation from the host application's global response pipeline.
 *
 * Global interceptors always sit outside controller-scoped ones, so any value a
 * NestLens handler *returns* passes through them. In an application with the
 * common "wrap every response" interceptor that meant:
 *
 *   - the dashboard's HTML came back as a JSON string — a blank page;
 *   - the API envelope was buried one level deeper — every dashboard fetch
 *     read `undefined`.
 *
 * Both surfaces now write to the transport themselves, leaving the host's
 * interceptors with nothing to map over. This boots a real application on both
 * adapters with such an interceptor installed and checks the host's own routes
 * are still wrapped — otherwise the test would pass just as well if the
 * interceptor never ran.
 */
import {
  CallHandler,
  Controller,
  ExecutionContext,
  Get,
  INestApplication,
  Injectable,
  Module,
  NestInterceptor,
  Post,
} from '@nestjs/common';
import { APP_INTERCEPTOR, NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { join } from 'path';
import { existsSync } from 'fs';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import request from 'supertest';
import { NestLensModule } from '../../nestlens.module';
import { DashboardController } from '../../api/dashboard.controller';

/** The interceptor pattern that broke NestLens before 0.8.0. */
@Injectable()
class HostWrapInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data) => ({ hostWrapped: true, payload: data })));
  }
}

@Controller('host')
class HostController {
  @Get('ping')
  ping(): { pong: boolean } {
    return { pong: true };
  }
}

@Module({
  imports: [NestLensModule.forRoot({ watchers: { request: true } })],
  controllers: [HostController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: HostWrapInterceptor }],
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

  const dashboard = app.get(DashboardController);
  (dashboard as unknown as { dashboardPath: string }).dashboardPath = realDashboardPublic;

  await app.init();
  if (adapter === 'Fastify') {
    await (app as NestFastifyApplication).getHttpAdapter().getInstance().ready();
  }
  return app;
}

describe.each<AdapterName>(['Express', 'Fastify'])(
  'Host global interceptor on %s adapter',
  (adapter) => {
    let app: INestApplication;
    let server: ReturnType<INestApplication['getHttpServer']>;

    beforeAll(async () => {
      app = await createApp(adapter);
      server = app.getHttpServer();
    });

    afterAll(async () => {
      await app.close();
    });

    // Negative control: proves the interceptor is actually installed and running,
    // so the assertions below mean something.
    it("still wraps the host application's own routes", async () => {
      const res = await request(server).get('/host/ping');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ hostWrapped: true, payload: { pong: true } });
    });

    it('does not wrap the NestLens API envelope', async () => {
      const res = await request(server).get('/nestlens/__nestlens__/api/entries');

      expect(res.status).toBe(200);
      expect(res.body).not.toHaveProperty('hostWrapped');
      expect(res.body).toMatchObject({ success: true, error: null });
      expect(res.body.data).toEqual(expect.any(Array));
    });

    it('preserves the status code Nest would have applied to a POST', async () => {
      const res = await request(server).post('/nestlens/__nestlens__/api/recording/pause').send({});

      expect(res.status).toBe(201);
      expect(res.body).not.toHaveProperty('hostWrapped');
    });

    it('renders NestLens API errors through its own filter', async () => {
      const res = await request(server).get('/nestlens/__nestlens__/api/entries/999999');

      expect(res.status).toBe(404);
      expect(res.body).not.toHaveProperty('hostWrapped');
      expect(res.body).toMatchObject({ success: false, data: null });
    });

    const maybe = hasBuiltDashboard ? it : it.skip;

    maybe('serves the dashboard as HTML rather than a JSON string', async () => {
      const res = await request(server).get('/nestlens');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).toContain('<base href="/nestlens/" />');
      expect(res.text).not.toContain('hostWrapped');
    });

    maybe('serves dashboard SPA routes as HTML', async () => {
      const res = await request(server).get('/nestlens/requests/abc-123');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).not.toContain('hostWrapped');
    });
  },
);
