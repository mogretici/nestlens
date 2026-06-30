import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, StreamableFile } from '@nestjs/common';
import { DashboardController } from '../../api/dashboard.controller';
import { NESTLENS_CONFIG, NestLensConfig } from '../../nestlens.config';

// Mock fs module (createReadStream returns a real Readable so StreamableFile accepts it)
jest.mock('fs', () => {
  const { Readable } = require('stream');
  return {
    existsSync: jest.fn(),
    createReadStream: jest.fn(() => Readable.from(['<html></html>'])),
    readFileSync: jest.fn(() => Buffer.from('<html></html>')),
  };
});

import { existsSync } from 'fs';

describe('DashboardController', () => {
  let controller: DashboardController;
  let mockConfig: NestLensConfig;

  beforeEach(async () => {
    mockConfig = { enabled: true };

    (existsSync as jest.Mock).mockReset();
    (existsSync as jest.Mock).mockReturnValue(true);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [{ provide: NESTLENS_CONFIG, useValue: mockConfig }],
    }).compile();

    controller = module.get<DashboardController>(DashboardController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should be defined', () => {
      expect(controller).toBeDefined();
    });

    it('should set dashboard path correctly', () => {
      expect(controller['dashboardPath']).toContain('dashboard');
      expect(controller['dashboardPath']).toContain('public');
    });
  });

  describe('serveDashboard', () => {
    it('should serve index.html as a StreamableFile with the correct content type', () => {
      const result = controller.serveDashboard();

      expect(result).toBeInstanceOf(StreamableFile);
      expect(result.getHeaders().type).toBe('text/html; charset=utf-8');
    });

    it('should throw NotFoundException when index.html does not exist', () => {
      (existsSync as jest.Mock).mockReturnValue(false);

      expect(() => controller.serveDashboard()).toThrow(NotFoundException);
    });
  });

  describe('serveAssets', () => {
    it('should return a StreamableFile when the asset exists', () => {
      const result = controller.serveAssets('main.js');
      expect(result).toBeInstanceOf(StreamableFile);
    });

    it('should set the JS content type', () => {
      const result = controller.serveAssets('main.js');
      expect(result.getHeaders().type).toBe('application/javascript; charset=utf-8');
    });

    it('should set the CSS content type', () => {
      const result = controller.serveAssets('styles.css');
      expect(result.getHeaders().type).toBe('text/css; charset=utf-8');
    });

    it('should set the font content type', () => {
      const result = controller.serveAssets('font.woff2');
      expect(result.getHeaders().type).toBe('font/woff2');
    });

    it('should throw NotFoundException when the asset does not exist', () => {
      (existsSync as jest.Mock).mockReturnValue(false);
      expect(() => controller.serveAssets('nonexistent.js')).toThrow(NotFoundException);
    });
  });

  describe('serveStaticFile (SVG)', () => {
    it('should return a StreamableFile with the SVG content type', () => {
      const result = controller.serveStaticFile('favicon');
      expect(result).toBeInstanceOf(StreamableFile);
      expect(result.getHeaders().type).toBe('image/svg+xml');
    });

    it('should throw NotFoundException when the SVG does not exist', () => {
      (existsSync as jest.Mock).mockReturnValue(false);
      expect(() => controller.serveStaticFile('nonexistent')).toThrow(NotFoundException);
    });
  });

  describe('SPA Routes', () => {
    const spaRoutes: Array<keyof DashboardController> = [
      'serveRequestsRoute',
      'serveQueriesRoute',
      'serveExceptionsRoute',
      'serveLogsRoute',
      'serveEntryDetailRoute',
      'serveEventsRoute',
      'serveEventDetailRoute',
      'serveJobsRoute',
      'serveJobDetailRoute',
      'serveCacheRoute',
      'serveCacheDetailRoute',
      'serveMailRoute',
      'serveMailDetailRoute',
      'serveScheduleRoute',
      'serveScheduleDetailRoute',
      'serveHttpClientRoute',
      'serveHttpClientDetailRoute',
      'serveRequestDetailRoute',
      'serveQueryDetailRoute',
      'serveExceptionDetailRoute',
      'serveLogDetailRoute',
      'serveRedisRoute',
      'serveRedisDetailRoute',
      'serveModelsRoute',
      'serveModelDetailRoute',
      'serveNotificationsRoute',
      'serveNotificationDetailRoute',
      'serveViewsRoute',
      'serveViewDetailRoute',
      'serveCommandsRoute',
      'serveCommandDetailRoute',
      'serveGatesRoute',
      'serveGateDetailRoute',
      'serveBatchesRoute',
      'serveBatchDetailRoute',
      'serveDumpsRoute',
      'serveDumpDetailRoute',
      'serveGraphQLRoute',
      'serveGraphQLDetailRoute',
    ];

    it.each(spaRoutes)('%s should return index.html as a StreamableFile', (method) => {
      const result = (controller[method] as () => StreamableFile)();
      expect(result).toBeInstanceOf(StreamableFile);
      expect(result.getHeaders().type).toBe('text/html; charset=utf-8');
    });

    it('should throw NotFoundException for SPA routes when index.html is missing', () => {
      (existsSync as jest.Mock).mockReturnValue(false);
      expect(() => controller.serveRequestsRoute()).toThrow(NotFoundException);
      expect(() => controller.serveEntryDetailRoute()).toThrow(NotFoundException);
    });
  });

  describe('Security - Path Traversal', () => {
    it('should reject traversal in assets even if the file resolves to an existing path', () => {
      // existsSync would return true, but the resolved path escapes the dashboard root
      expect(() => controller.serveAssets('../../../etc/passwd')).toThrow(NotFoundException);
    });

    it('should reject traversal in SVG route', () => {
      expect(() => controller.serveStaticFile('../../../etc/passwd')).toThrow(NotFoundException);
    });
  });

  describe('Edge Cases', () => {
    it('should throw NotFoundException for an empty asset filename', () => {
      (existsSync as jest.Mock).mockReturnValue(false);
      expect(() => controller.serveAssets('')).toThrow(NotFoundException);
    });

    it('should handle special characters in filename', () => {
      const result = controller.serveAssets('file%20name.js');
      expect(result).toBeInstanceOf(StreamableFile);
    });
  });
});
