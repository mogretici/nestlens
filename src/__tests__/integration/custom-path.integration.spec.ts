/**
 * Regression guard for issue #10 ("I can't access the Dashboard").
 *
 * `NestLensConfig.path` was documented as the base URL for the dashboard and
 * the API, but nothing read it when mounting routes: every controller carried a
 * hard-coded prefix, so a user configuring `path: '/dev/nestlens'` got
 * `Cannot GET /dev/nestlens` while the dashboard silently stayed on
 * `/nestlens`.
 *
 * These tests pin the documented contract: the whole NestLens surface —
 * dashboard, API and tags — moves under the configured path together.
 */
import { INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { NestLensModule } from '../../nestlens.module';

const bootWithPath = async (path?: string): Promise<INestApplication> => {
  @Module({
    imports: [NestLensModule.forRoot(path === undefined ? {} : { path })],
  })
  class AppModule {}

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
};

// The dashboard's static bundle lives in `dist/`, which is absent when Jest runs
// from `src/`. Route resolution is what matters here, so treat "route exists" as
// anything other than Nest's unmatched-route 404.
const routeExists = (status: number, body: { message?: string }): boolean =>
  !(status === 404 && typeof body.message === 'string' && body.message.startsWith('Cannot GET'));

describe('issue #10 - configurable path', () => {
  describe('with a custom path', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await bootWithPath('/dev/nestlens');
    });

    afterAll(async () => {
      await app?.close();
    });

    it('serves the dashboard under the configured path', async () => {
      const res = await request(app.getHttpServer()).get('/dev/nestlens');
      expect(routeExists(res.status, res.body)).toBe(true);
    });

    it('serves SPA routes under the configured path', async () => {
      const res = await request(app.getHttpServer()).get('/dev/nestlens/requests');
      expect(routeExists(res.status, res.body)).toBe(true);
    });

    it('serves the API under the configured path', async () => {
      const res = await request(app.getHttpServer()).get('/dev/nestlens/__nestlens__/api/entries');
      expect(res.status).toBe(200);
    });

    it('serves tags under the configured path', async () => {
      const res = await request(app.getHttpServer()).get('/dev/nestlens/__nestlens__/api/tags');
      expect(res.status).toBe(200);
    });

    it('leaves nothing behind on the default path', async () => {
      const dashboard = await request(app.getHttpServer()).get('/nestlens');
      expect(routeExists(dashboard.status, dashboard.body)).toBe(false);

      const api = await request(app.getHttpServer()).get('/__nestlens__/api/entries');
      expect(api.status).toBe(404);
    });
  });

  describe('with the default path', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await bootWithPath();
    });

    afterAll(async () => {
      await app?.close();
    });

    it('serves the dashboard at /nestlens', async () => {
      const res = await request(app.getHttpServer()).get('/nestlens');
      expect(routeExists(res.status, res.body)).toBe(true);
    });

    it('serves the API at the path documented in the docs', async () => {
      const res = await request(app.getHttpServer()).get('/nestlens/__nestlens__/api/entries');
      expect(res.status).toBe(200);
    });
  });
});
