/**
 * The dashboard on a listener of its own.
 *
 * Everything here binds real sockets and connects to them. A test that handed
 * a mock server a configuration object and checked the object would prove the
 * mocks agree with each other, and the claim being made is about the operating
 * system: that the dashboard is *on* one address and *not on* another. Only a
 * connection can say that.
 */
import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { connect } from 'net';
import type { AddressInfo } from 'net';
import request from 'supertest';
import { NestLensModule } from '../../nestlens.module';
import { NestLensConfig } from '../../nestlens.config';
import { NestLensDashboardServer } from '../../api/dashboard-server';
import { PruningService } from '../../core/pruning.service';

@Controller('demo')
class DemoController {
  @Get()
  ok(): { ok: true } {
    return { ok: true };
  }
}

function appModuleFor(config: NestLensConfig): new () => unknown {
  @Module({
    imports: [NestLensModule.forRoot(config)],
    controllers: [DemoController],
  })
  class AppModule {}

  return AppModule;
}

type Platform = 'express' | 'fastify';

async function boot(config: NestLensConfig, platform: Platform): Promise<INestApplication> {
  const adapter = platform === 'express' ? new ExpressAdapter() : new FastifyAdapter();
  // `abortOnError: false` so a bootstrap failure rejects here instead of
  // taking the test runner down with `process.exit(1)`, which is Nest's
  // default for an application that cannot start.
  const app = await NestFactory.create(appModuleFor(config), adapter, {
    logger: false,
    abortOnError: false,
  });

  await app.listen(0, '127.0.0.1');

  return app;
}

const urlFor = (host: string, port: number): string =>
  `http://${host.includes(':') ? `[${host}]` : host}:${port}`;

/**
 * Whether a route was matched at all.
 *
 * The dashboard's static bundle lives in `dist/`, which Jest running from
 * `src/` does not have, so `index.html` is a 404 from the controller even
 * where the route is registered. Nest's own unmatched-route 404 is the one
 * that answers the question here, and it is the one that says `Cannot GET`.
 */
const routeExists = (status: number, body: { message?: string }): boolean =>
  !(status === 404 && typeof body.message === 'string' && body.message.startsWith('Cannot GET'));

/**
 * Whether anything accepts a TCP connection at this address.
 *
 * Below HTTP on purpose: a 404 would mean something is listening and declining
 * to serve, which is not the claim. The claim is that no socket exists there.
 */
function probe(host: string, port: number): Promise<'answered' | 'refused'> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const settle = (result: 'answered' | 'refused') => () => {
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(2000);
    socket.on('connect', settle('answered'));
    socket.on('error', settle('refused'));
    socket.on('timeout', settle('refused'));
  });
}

describe('Dashboard on a listener of its own', () => {
  describe.each<Platform>(['express', 'fastify'])('on %s', (platform) => {
    let app: INestApplication;
    let dashboard: AddressInfo;

    beforeAll(async () => {
      app = await boot({ server: { host: '127.0.0.1', port: 0 } }, platform);
      dashboard = app.get(NestLensDashboardServer).address() as AddressInfo;
    });

    afterAll(async () => {
      await app.close();
    });

    it('reports the address the kernel actually bound', () => {
      expect(dashboard.address).toBe('127.0.0.1');
      expect(dashboard.port).toBeGreaterThan(0);
    });

    it('serves the dashboard there', async () => {
      const response = await request(urlFor('127.0.0.1', dashboard.port)).get('/nestlens');

      expect(routeExists(response.status, response.body)).toBe(true);
    });

    it('serves the API there', async () => {
      const response = await request(urlFor('127.0.0.1', dashboard.port)).get(
        '/nestlens/__nestlens__/api/entries',
      );

      expect(response.status).toBe(200);
    });

    it('does not serve the dashboard on the application', async () => {
      const dashboardRoute = await request(app.getHttpServer()).get('/nestlens');
      const spaRoute = await request(app.getHttpServer()).get('/nestlens/requests');
      const apiRoute = await request(app.getHttpServer()).get('/nestlens/__nestlens__/api/entries');

      // Unmatched, not merely unserved: there is no NestLens route on this
      // application to reach.
      expect(routeExists(dashboardRoute.status, dashboardRoute.body)).toBe(false);
      expect(routeExists(spaRoute.status, spaRoute.body)).toBe(false);
      expect(routeExists(apiRoute.status, apiRoute.body)).toBe(false);
    });

    it('does not serve the stream or the tag API on the application either', async () => {
      // Four controllers make up NestLens's surface and the isolation is only
      // as good as its least-remembered one. The three above are the ones a
      // reader thinks of.
      const stream = await request(app.getHttpServer()).get('/nestlens/__nestlens__/stream');
      const tags = await request(app.getHttpServer()).get('/nestlens/__nestlens__/api/tags');

      expect(routeExists(stream.status, stream.body)).toBe(false);
      expect(routeExists(tags.status, tags.body)).toBe(false);
    });

    it('leaves the application itself untouched', async () => {
      const response = await request(app.getHttpServer()).get('/demo');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true });
    });

    /**
     * The distinction the option exists for. Listening on every interface and
     * rejecting by address would pass every test above and still put a socket
     * on the public one.
     */
    it('holds no socket on an address it was not given', async () => {
      await expect(probe('::1', dashboard.port)).resolves.toBe('refused');
      await expect(probe('127.0.0.1', dashboard.port)).resolves.toBe('answered');
    });

    it('closes the listener with the application', async () => {
      const { port } = dashboard;
      await app.close();

      await expect(probe('127.0.0.1', port)).resolves.toBe('refused');

      // Rebooted for the remaining describe blocks' afterAll, which closes an
      // application that is already closed — harmless, and cheaper than making
      // every test above pay for its own application.
      app = await boot({ server: { host: '127.0.0.1', port: 0 } }, platform);
    });
  });

  describe('without the option', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await boot({}, 'express');
    });

    afterAll(async () => {
      await app.close();
    });

    it('serves the dashboard on the application, as it always has', async () => {
      const dashboardRoute = await request(app.getHttpServer()).get('/nestlens');
      const apiRoute = await request(app.getHttpServer()).get('/nestlens/__nestlens__/api/entries');

      expect(routeExists(dashboardRoute.status, dashboardRoute.body)).toBe(true);
      expect(apiRoute.status).toBe(200);
    });

    it('starts no listener of its own', () => {
      expect(() => app.get(NestLensDashboardServer)).toThrow();
    });
  });

  describe('authorization', () => {
    let app: INestApplication;
    let dashboard: AddressInfo;

    beforeAll(async () => {
      app = await boot(
        {
          server: { host: '127.0.0.1', port: 0 },
          authorization: { allowedIps: ['10.0.0.1'] },
        },
        'express',
      );
      dashboard = app.get(NestLensDashboardServer).address() as AddressInfo;
    });

    afterAll(async () => {
      await app.close();
    });

    /**
     * Address isolation is the first layer, not a replacement for the second.
     * A separate listener that quietly stopped enforcing `allowedIps` would be
     * a downgrade dressed as a hardening.
     */
    it('is still enforced on the separate listener', async () => {
      const response = await request(urlFor('127.0.0.1', dashboard.port)).get(
        '/nestlens/__nestlens__/api/entries',
      );

      expect(response.status).toBe(403);
    });
  });

  describe('when the address cannot be bound', () => {
    it('fails the application startup instead of falling back', async () => {
      // TEST-NET-3 (RFC 5737). Reserved for documentation, so no host holds it.
      const app = await NestFactory.create(
        appModuleFor({ server: { host: '203.0.113.9', port: 0 } }),
        new ExpressAdapter(),
        { logger: false, abortOnError: false },
      );

      await expect(app.listen(0, '127.0.0.1')).rejects.toThrow(
        /could not bind its dashboard listener to 203\.0\.113\.9:0/,
      );

      await app.close();
    });
  });

  describe('the services it borrows', () => {
    /**
     * The dashboard application is handed the running collector, storage and
     * pruning service rather than copies. Nest calls lifecycle hooks on value
     * providers, so without the shield in `dashboard-server.ts` this second
     * application would start a second pruning timer on the same storage — and
     * stop the first one's when its listener closed.
     */
    it('does not run their lifecycle hooks a second time', async () => {
      const started = jest.spyOn(PruningService.prototype, 'onModuleInit');

      const app = await boot({ server: { host: '127.0.0.1', port: 0 } }, 'express');

      expect(started).toHaveBeenCalledTimes(1);

      await app.close();
      started.mockRestore();
    });
  });
});
