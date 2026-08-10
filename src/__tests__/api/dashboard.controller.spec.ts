/**
 * DashboardController Tests
 *
 * The controller writes responses itself rather than returning them, so the
 * host application's global interceptors cannot rewrite the dashboard's HTML
 * or assets. These tests capture what it hands to the HTTP adapter.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ApplicationConfig, HttpAdapterHost } from '@nestjs/core';
import { NotFoundException, RequestMethod, StreamableFile } from '@nestjs/common';
import { DashboardController } from '../../api/dashboard.controller';
import { NESTLENS_CONFIG, NestLensConfig } from '../../nestlens.config';

// readFileSync is the only fs call that matters here; existsSync drives the
// not-found paths.
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(() => Buffer.from('<html><head></head><body></body></html>')),
}));

import { existsSync, readFileSync } from 'fs';

interface Written {
  body: unknown;
  status: number;
  headers: Record<string, string>;
}

/** Captures what the controller writes, standing in for a real HTTP response. */
const createAdapterHost = (): { host: HttpAdapterHost; written: Written } => {
  const written: Written = { body: undefined, status: 0, headers: {} };

  const httpAdapter = {
    setHeader: (_res: unknown, name: string, value: string) => {
      written.headers[name] = value;
    },
    reply: (_res: unknown, body: unknown, status: number) => {
      written.body = body;
      written.status = status;
    },
  };

  return { host: { httpAdapter } as unknown as HttpAdapterHost, written };
};

const RES = {} as unknown;

/**
 * The controller hands the adapter a StreamableFile — the only shape both
 * Express and Fastify treat as a binary body rather than JSON. Tests that care
 * about the payload read it back out.
 */
const readBody = async (written: Written): Promise<string> => {
  const body = written.body;
  if (!(body instanceof StreamableFile)) return String(body);

  const chunks: Buffer[] = [];
  for await (const chunk of body.getStream()) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
};

describe('DashboardController', () => {
  let controller: DashboardController;
  let written: Written;

  const build = async (
    config: NestLensConfig = { enabled: true },
    configureApp: (appConfig: ApplicationConfig) => void = () => {},
  ): Promise<DashboardController> => {
    const applicationConfig = new ApplicationConfig();
    configureApp(applicationConfig);

    const adapter = createAdapterHost();
    written = adapter.written;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        { provide: NESTLENS_CONFIG, useValue: config },
        { provide: ApplicationConfig, useValue: applicationConfig },
        { provide: HttpAdapterHost, useValue: adapter.host },
      ],
    }).compile();

    return module.get<DashboardController>(DashboardController);
  };

  beforeEach(async () => {
    (existsSync as jest.Mock).mockReset().mockReturnValue(true);
    (readFileSync as jest.Mock)
      .mockReset()
      .mockReturnValue(Buffer.from('<html><head></head><body></body></html>'));
    controller = await build();
  });

  describe('constructor', () => {
    it('resolves the bundled dashboard directory', () => {
      expect(controller['dashboardPath']).toContain('dashboard');
      expect(controller['dashboardPath']).toContain('public');
    });
  });

  describe('serving index.html', () => {
    it('writes HTML with the correct content type', async () => {
      controller.serveDashboard(RES);

      expect(written.status).toBe(200);
      expect(written.headers['Content-Type']).toBe('text/html; charset=utf-8');
      expect(await readBody(written)).toContain('<html>');
    });

    it('serves the same document for SPA routes', () => {
      controller.serveSpaRoute(RES);

      expect(written.status).toBe(200);
      expect(written.headers['Content-Type']).toBe('text/html; charset=utf-8');
    });

    it('throws NotFoundException when the bundle is missing', () => {
      (existsSync as jest.Mock).mockReturnValue(false);

      expect(() => controller.serveDashboard(RES)).toThrow(NotFoundException);
    });
  });

  describe('base path injection', () => {
    const servedHtml = async (
      config: NestLensConfig,
      configureApp: (appConfig: ApplicationConfig) => void = () => {},
      forwardedPrefix?: string,
    ): Promise<string> => {
      const built = await build(config, configureApp);
      built.serveDashboard(RES, forwardedPrefix);
      return readBody(written);
    };

    it('tells the SPA where NestLens is mounted', async () => {
      const html = await servedHtml({ enabled: true, path: '/admin/monitoring' });

      expect(html).toContain('<base href="/admin/monitoring/" />');
      expect(html).toContain('window.__NESTLENS_BASE__="/admin/monitoring"');
    });

    it('falls back to the default mount point', async () => {
      const html = await servedHtml({ enabled: true });

      expect(html).toContain('<base href="/nestlens/" />');
      expect(html).toContain('window.__NESTLENS_BASE__="/nestlens"');
    });

    // Regression guard: `setGlobalPrefix` shifts every NestLens route without the
    // module knowing. Getting this wrong points the bundle at /nestlens/assets/*
    // while it actually lives at /api/nestlens/assets/* — every asset 404s and
    // the dashboard renders blank, even though the API answers fine.
    it('accounts for a global prefix', async () => {
      const html = await servedHtml({ enabled: true }, (app) => app.setGlobalPrefix('api'));

      expect(html).toContain('<base href="/api/nestlens/" />');
      expect(html).toContain('window.__NESTLENS_BASE__="/api/nestlens"');
    });

    it('combines a global prefix with a custom path', async () => {
      const html = await servedHtml({ enabled: true, path: '/dev/nestlens' }, (app) =>
        app.setGlobalPrefix('api'),
      );

      expect(html).toContain('<base href="/api/dev/nestlens/" />');
    });

    it('tolerates a global prefix written with slashes', async () => {
      const html = await servedHtml({ enabled: true }, (app) => app.setGlobalPrefix('/api/'));

      expect(html).toContain('<base href="/api/nestlens/" />');
    });

    it('ignores the global prefix when NestLens is excluded from it', async () => {
      const html = await servedHtml({ enabled: true }, (app) => {
        app.setGlobalPrefix('api');
        app.setGlobalPrefixOptions({
          exclude: [
            { path: '/nestlens', pathRegex: /^\/nestlens/, requestMethod: RequestMethod.GET },
          ],
        });
      });

      expect(html).toContain('<base href="/nestlens/" />');
    });
  });

  describe('behind a reverse proxy', () => {
    const servedHtml = async (
      config: NestLensConfig,
      forwardedPrefix?: string,
      configureApp: (appConfig: ApplicationConfig) => void = () => {},
    ): Promise<string> => {
      const built = await build(config, configureApp);
      built.serveDashboard(RES, forwardedPrefix);
      return readBody(written);
    };

    // A proxy that strips a path segment leaves the application seeing
    // /nestlens while the browser is at /tools/nestlens. Only the header knows.
    it('prepends a trusted forwarded prefix', async () => {
      const html = await servedHtml({ enabled: true, trustProxy: true }, '/tools');

      expect(html).toContain('<base href="/tools/nestlens/" />');
      expect(html).toContain('window.__NESTLENS_BASE__="/tools/nestlens"');
    });

    // Order matters: the browser sees the proxy's segment first, then whatever
    // the application itself prepends.
    it('places the forwarded prefix in front of the global prefix', async () => {
      const html = await servedHtml({ enabled: true, trustProxy: true }, '/tools', (app) =>
        app.setGlobalPrefix('api'),
      );

      expect(html).toContain('<base href="/tools/api/nestlens/" />');
    });

    it('ignores the header unless trustProxy is enabled', async () => {
      const html = await servedHtml({ enabled: true }, '/tools');

      expect(html).toContain('<base href="/nestlens/" />');
    });

    it('ignores a hostile forwarded prefix even when trusted', async () => {
      const html = await servedHtml({ enabled: true, trustProxy: true }, '//evil.com');

      expect(html).toContain('<base href="/nestlens/" />');
      expect(html).not.toContain('evil.com');
    });
  });

  describe('serving assets', () => {
    it.each([
      ['main.js', 'application/javascript; charset=utf-8'],
      ['styles.css', 'text/css; charset=utf-8'],
      ['font.woff2', 'font/woff2'],
      ['data.json', 'application/json; charset=utf-8'],
    ])('sets the content type for %s', (filename, expected) => {
      controller.serveAssets(filename, RES);

      expect(written.status).toBe(200);
      expect(written.headers['Content-Type']).toBe(expected);
    });

    it('falls back to octet-stream for unknown extensions', () => {
      controller.serveAssets('mystery.xyz', RES);

      expect(written.headers['Content-Type']).toBe('application/octet-stream');
    });

    it('throws NotFoundException when the asset is missing', () => {
      (existsSync as jest.Mock).mockReturnValue(false);

      expect(() => controller.serveAssets('nope.js', RES)).toThrow(NotFoundException);
    });

    // Writing the response ourselves means handing the adapter a full body
    // rather than a stream, so an uncached read would pull the whole bundle off
    // disk synchronously on every dashboard load.
    it('reads each file from disk only once', () => {
      controller.serveAssets('main.js', RES);
      controller.serveAssets('main.js', RES);
      controller.serveAssets('main.js', RES);

      expect(readFileSync as jest.Mock).toHaveBeenCalledTimes(1);
      expect(written.status).toBe(200);
    });

    it('still checks existence on every request', () => {
      controller.serveAssets('main.js', RES);
      (existsSync as jest.Mock).mockReturnValue(false);

      expect(() => controller.serveAssets('main.js', RES)).toThrow(NotFoundException);
    });
  });

  describe('serving root-level SVGs', () => {
    it('sets the SVG content type', () => {
      controller.serveStaticFile('favicon', RES);

      expect(written.status).toBe(200);
      expect(written.headers['Content-Type']).toBe('image/svg+xml');
    });

    it('throws NotFoundException when the file is missing', () => {
      (existsSync as jest.Mock).mockReturnValue(false);

      expect(() => controller.serveStaticFile('nope', RES)).toThrow(NotFoundException);
    });
  });

  describe('path traversal', () => {
    // Nest decodes route params before they reach the handler, so the encoded
    // form (`..%2F..`) arrives here already decoded — these are the real inputs.
    it.each([['../../../etc/passwd'], ['../../package.json']])(
      'rejects %s in the asset route',
      (filename) => {
        expect(() => controller.serveAssets(filename, RES)).toThrow(NotFoundException);
      },
    );

    it('rejects traversal in the SVG route', () => {
      expect(() => controller.serveStaticFile('../../../etc/passwd', RES)).toThrow(
        NotFoundException,
      );
    });
  });
});
