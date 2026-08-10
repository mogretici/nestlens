/**
 * Reverse proxy support.
 *
 * When a proxy strips a path segment before forwarding — nginx
 * `location /tools/ { proxy_pass http://app:3000/; }`, or a Kubernetes ingress
 * rewrite — the application sees `/nestlens` while the browser is at
 * `/tools/nestlens`. Nothing inside the application can tell; the only signal
 * is the `X-Forwarded-Prefix` header the proxy sets.
 *
 * Get this wrong and the dashboard's `<base href>` points at `/nestlens/assets/*`,
 * which the proxy does not serve: every asset 404s and the page renders blank.
 *
 * The header is attacker-controlled, so it is honoured only under
 * `trustProxy: true` and only when it is a plain absolute path. These tests
 * cover both halves over real HTTP.
 */
import { INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { join } from 'path';
import { existsSync } from 'fs';
import request from 'supertest';
import { NestLensModule } from '../../nestlens.module';
import { DashboardController } from '../../api/dashboard.controller';
import { NestLensConfig } from '../../nestlens.config';

type AdapterName = 'Express' | 'Fastify';

const realDashboardPublic = join(process.cwd(), 'dist', 'dashboard', 'public');
const hasBuiltDashboard = existsSync(join(realDashboardPublic, 'index.html'));

async function createApp(
  adapter: AdapterName,
  config: NestLensConfig,
  globalPrefix?: string,
): Promise<INestApplication> {
  @Module({ imports: [NestLensModule.forRoot(config)] })
  class AppModule {}

  const app =
    adapter === 'Fastify'
      ? await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
          logger: false,
        })
      : await NestFactory.create(AppModule, new ExpressAdapter(), { logger: false });

  if (globalPrefix) app.setGlobalPrefix(globalPrefix);

  const dashboard = app.get(DashboardController);
  (dashboard as unknown as { dashboardPath: string }).dashboardPath = realDashboardPublic;

  await app.init();
  if (adapter === 'Fastify') {
    await (app as NestFastifyApplication).getHttpAdapter().getInstance().ready();
  }
  return app;
}

const describeWithBundle = hasBuiltDashboard ? describe : describe.skip;

describeWithBundle.each<AdapterName>(['Express', 'Fastify'])(
  'X-Forwarded-Prefix on %s adapter',
  (adapter) => {
    describe('with trustProxy enabled', () => {
      let app: INestApplication;

      beforeAll(async () => {
        app = await createApp(adapter, { trustProxy: true });
      });

      afterAll(async () => {
        await app.close();
      });

      it('serves the dashboard for the browser-visible path', async () => {
        const res = await request(app.getHttpServer())
          .get('/nestlens')
          .set('X-Forwarded-Prefix', '/tools');

        expect(res.status).toBe(200);
        expect(res.text).toContain('<base href="/tools/nestlens/" />');
        expect(res.text).toContain('window.__NESTLENS_BASE__="/tools/nestlens"');
      });

      it('applies the prefix to SPA routes too', async () => {
        const res = await request(app.getHttpServer())
          .get('/nestlens/requests/abc-123')
          .set('X-Forwarded-Prefix', '/tools');

        expect(res.status).toBe(200);
        expect(res.text).toContain('<base href="/tools/nestlens/" />');
      });

      it('falls back to the mount point when the proxy sends no header', async () => {
        const res = await request(app.getHttpServer()).get('/nestlens');

        expect(res.status).toBe(200);
        expect(res.text).toContain('<base href="/nestlens/" />');
      });

      // Anyone can send this header. Reflecting it unchecked would repoint every
      // asset and API call the dashboard makes at another origin — and a shared
      // cache in front of the application could serve that to other users.
      it.each([
        ['//evil.com'],
        ['https://evil.com'],
        ['/tools/../../etc'],
        ['/tools"onload="alert(1)'],
      ])('ignores a hostile prefix (%s)', async (hostile) => {
        const res = await request(app.getHttpServer())
          .get('/nestlens')
          .set('X-Forwarded-Prefix', hostile);

        expect(res.status).toBe(200);
        expect(res.text).toContain('<base href="/nestlens/" />');
        expect(res.text).not.toContain('evil.com');
      });
    });

    describe('with trustProxy enabled behind a global prefix', () => {
      let app: INestApplication;

      beforeAll(async () => {
        app = await createApp(adapter, { trustProxy: true }, 'api');
      });

      afterAll(async () => {
        await app.close();
      });

      // The browser sees the proxy's segment first, then everything the
      // application prepends.
      it('orders the proxy prefix in front of the global prefix', async () => {
        const res = await request(app.getHttpServer())
          .get('/api/nestlens')
          .set('X-Forwarded-Prefix', '/tools');

        expect(res.status).toBe(200);
        expect(res.text).toContain('<base href="/tools/api/nestlens/" />');
      });
    });

    describe('with trustProxy disabled (the default)', () => {
      let app: INestApplication;

      beforeAll(async () => {
        app = await createApp(adapter, {});
      });

      afterAll(async () => {
        await app.close();
      });

      it('ignores the header entirely', async () => {
        const res = await request(app.getHttpServer())
          .get('/nestlens')
          .set('X-Forwarded-Prefix', '/tools');

        expect(res.status).toBe(200);
        expect(res.text).toContain('<base href="/nestlens/" />');
      });
    });
  },
);
