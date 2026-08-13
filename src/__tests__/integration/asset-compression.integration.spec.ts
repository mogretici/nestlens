/**
 * The dashboard bundle over real HTTP, on both adapters.
 *
 * NestLens writes its own responses so that a host application's global
 * interceptors cannot rewrite them. The price is that nothing else in the
 * pipeline touches them either: for as long as the controller ignored
 * `Accept-Encoding`, every dashboard load transferred the bundle uncompressed
 * whether or not the application had compression middleware installed.
 *
 * A unit test can check the negotiation rules; only this can check that the
 * bytes on the wire are fewer than the bytes on disk and still decode back to
 * exactly the file — the same class of mistake as the Buffer→JSON regression,
 * which passed every status and content-type assertion.
 *
 * Following AAA (Arrange-Act-Assert).
 */
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Module } from '@nestjs/common';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import { NestLensModule } from '../../nestlens.module';
import { DashboardController } from '../../api/dashboard.controller';

@Module({ imports: [NestLensModule.forRoot({ watchers: {} })] })
class AppModule {}

type AdapterName = 'Express' | 'Fastify';

const dashboardPublic = join(process.cwd(), 'dist', 'dashboard', 'public');
const assetsDir = join(dashboardPublic, 'assets');
const hasBuiltDashboard = existsSync(join(dashboardPublic, 'index.html')) && existsSync(assetsDir);

/** The largest script in the bundle: the one whose transfer size matters. */
const largestScript = (): string =>
  readdirSync(assetsDir)
    .filter((name) => name.endsWith('.js'))
    .sort(
      (a, b) => statSync(join(assetsDir, b)).size - statSync(join(assetsDir, a)).size,
    )[0] as string;

async function createApp(adapter: AdapterName): Promise<INestApplication> {
  const app =
    adapter === 'Fastify'
      ? await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
          logger: false,
        })
      : await NestFactory.create(AppModule, new ExpressAdapter(), { logger: false });

  (app.get(DashboardController) as unknown as { dashboardPath: string }).dashboardPath =
    dashboardPublic;

  await app.init();
  if (adapter === 'Fastify') {
    await (app as NestFastifyApplication).getHttpAdapter().getInstance().ready();
  }

  return app;
}

const describeIfBuilt = hasBuiltDashboard ? describe : describe.skip;

describeIfBuilt.each<AdapterName>(['Express', 'Fastify'])(
  'dashboard asset compression on %s',
  (adapter) => {
    let app: INestApplication;
    let server: ReturnType<INestApplication['getHttpServer']>;
    let script: string;
    let onDisk: Buffer;

    beforeAll(async () => {
      app = await createApp(adapter);
      server = app.getHttpServer();
      script = largestScript();
      onDisk = readFileSync(join(assetsDir, script));
    });

    afterAll(async () => {
      await app.close();
    });

    /**
     * `content-length` is what the client actually downloads; the decoded body
     * is what it ends up with. Both have to be right — a truncated body would
     * still be smaller, and an uncompressed one would still decode.
     */
    it.each([
      ['gzip, deflate', 'gzip'],
      ['br', 'br'],
      ['gzip, deflate, br', 'br'],
    ])('answers "%s" with %s and a body that decodes to the file', async (accept, expected) => {
      const res = await request(server)
        .get(`/nestlens/assets/${script}`)
        .set('Accept-Encoding', accept);

      expect(res.status).toBe(200);
      expect(res.headers['content-encoding']).toBe(expected);
      expect(Number(res.headers['content-length'])).toBeLessThan(onDisk.length);
      // supertest decodes the body, so this compares the file the browser ends
      // up with against the file on disk.
      expect(Buffer.from(res.text, 'utf8').equals(onDisk)).toBe(true);
    });

    it('leaves the body alone for a client that accepts no encoding', async () => {
      const res = await request(server)
        .get(`/nestlens/assets/${script}`)
        .set('Accept-Encoding', 'identity');

      expect(res.status).toBe(200);
      expect(res.headers['content-encoding']).toBeUndefined();
      expect(Number(res.headers['content-length'])).toBe(onDisk.length);
    });

    it('refuses to compress with an encoding the client rejected', async () => {
      const res = await request(server)
        .get(`/nestlens/assets/${script}`)
        .set('Accept-Encoding', 'br;q=0, gzip;q=0');

      expect(res.headers['content-encoding']).toBeUndefined();
    });

    /**
     * The asset responses are `immutable` for a year. Without this header a
     * shared cache would store one encoding and serve it to every client after,
     * including the ones that cannot read it.
     */
    it.each(['gzip', 'identity'])('varies on Accept-Encoding (%s)', async (accept) => {
      const res = await request(server)
        .get(`/nestlens/assets/${script}`)
        .set('Accept-Encoding', accept);

      expect(res.headers['vary']).toContain('Accept-Encoding');
    });

    it('serves the same bytes on a repeat request, from the compression cache', async () => {
      const first = await request(server)
        .get(`/nestlens/assets/${script}`)
        .set('Accept-Encoding', 'br');
      const second = await request(server)
        .get(`/nestlens/assets/${script}`)
        .set('Accept-Encoding', 'br');

      expect(second.headers['content-encoding']).toBe('br');
      expect(second.headers['content-length']).toBe(first.headers['content-length']);
      expect(Buffer.from(second.text, 'utf8').equals(onDisk)).toBe(true);
    });

    /**
     * Both are a few hundred bytes, where compression costs more than it saves.
     */
    it.each([
      ['/nestlens', 'index.html'],
      ['/nestlens/nestlens-icon.svg', 'the icon'],
    ])('does not compress %s (%s is below the threshold)', async (path) => {
      const res = await request(server).get(path).set('Accept-Encoding', 'gzip, br');

      expect(res.status).toBe(200);
      expect(res.headers['content-encoding']).toBeUndefined();
    });
  },
);
