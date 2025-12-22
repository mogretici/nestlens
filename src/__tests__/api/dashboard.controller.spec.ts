import { Test, TestingModule } from '@nestjs/testing';
import { DashboardController } from '../../api/dashboard.controller';
import { NESTLENS_CONFIG, NestLensConfig } from '../../nestlens.config';
import { Request, Response } from 'express';
import { join } from 'path';

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
}));

import { existsSync } from 'fs';

describe('DashboardController', () => {
  let controller: DashboardController;
  let mockConfig: NestLensConfig;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(async () => {
    // Arrange
    mockConfig = {
      enabled: true,
    };

    mockRequest = {
      originalUrl: '/nestlens/',
    };

    mockResponse = {
      redirect: jest.fn().mockReturnThis(),
      sendFile: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    (existsSync as jest.Mock).mockReset();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        {
          provide: NESTLENS_CONFIG,
          useValue: mockConfig,
        },
      ],
    }).compile();

    controller = module.get<DashboardController>(DashboardController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should be defined', () => {
      // Assert
      expect(controller).toBeDefined();
    });

    it('should set dashboard path correctly', () => {
      // Assert
      expect(controller['dashboardPath']).toContain('dashboard');
      expect(controller['dashboardPath']).toContain('public');
    });
  });

  describe('serveDashboard', () => {
    describe('URL Redirection', () => {
      it('should redirect to trailing slash when URL does not end with /', () => {
        // Arrange
        mockRequest.originalUrl = '/nestlens';
        (existsSync as jest.Mock).mockReturnValue(true);

        // Act
        controller.serveDashboard(mockRequest as Request, mockResponse as Response);

        // Assert
        expect(mockResponse.redirect).toHaveBeenCalledWith(301, '/nestlens/');
        expect(mockResponse.sendFile).not.toHaveBeenCalled();
      });

      it('should not redirect when URL already ends with /', () => {
        // Arrange
        mockRequest.originalUrl = '/nestlens/';
        (existsSync as jest.Mock).mockReturnValue(true);

        // Act
        controller.serveDashboard(mockRequest as Request, mockResponse as Response);

        // Assert
        expect(mockResponse.redirect).not.toHaveBeenCalled();
        expect(mockResponse.sendFile).toHaveBeenCalled();
      });
    });

    describe('File Serving', () => {
      it('should serve index.html when it exists', () => {
        // Arrange
        mockRequest.originalUrl = '/nestlens/';
        (existsSync as jest.Mock).mockReturnValue(true);

        // Act
        controller.serveDashboard(mockRequest as Request, mockResponse as Response);

        // Assert
        expect(mockResponse.sendFile).toHaveBeenCalledWith(
          expect.stringContaining('index.html')
        );
      });

      it('should return 404 when index.html does not exist', () => {
        // Arrange
        mockRequest.originalUrl = '/nestlens/';
        (existsSync as jest.Mock).mockReturnValue(false);

        // Act
        controller.serveDashboard(mockRequest as Request, mockResponse as Response);

        // Assert
        expect(mockResponse.status).toHaveBeenCalledWith(404);
        expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Dashboard not found' });
      });
    });
  });

  describe('serveAssets', () => {
    it('should serve asset file when it exists', () => {
      // Arrange
      const filename = 'main.js';
      (existsSync as jest.Mock).mockReturnValue(true);

      // Act
      controller.serveAssets(filename, mockResponse as Response);

      // Assert
      expect(mockResponse.sendFile).toHaveBeenCalledWith(
        expect.stringContaining(join('assets', filename))
      );
    });

    it('should return 404 when asset file does not exist', () => {
      // Arrange
      const filename = 'nonexistent.js';
      (existsSync as jest.Mock).mockReturnValue(false);

      // Act
      controller.serveAssets(filename, mockResponse as Response);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Asset not found' });
    });

    it('should handle CSS files', () => {
      // Arrange
      const filename = 'styles.css';
      (existsSync as jest.Mock).mockReturnValue(true);

      // Act
      controller.serveAssets(filename, mockResponse as Response);

      // Assert
      expect(mockResponse.sendFile).toHaveBeenCalledWith(
        expect.stringContaining('styles.css')
      );
    });

    it('should handle font files', () => {
      // Arrange
      const filename = 'font.woff2';
      (existsSync as jest.Mock).mockReturnValue(true);

      // Act
      controller.serveAssets(filename, mockResponse as Response);

      // Assert
      expect(mockResponse.sendFile).toHaveBeenCalledWith(
        expect.stringContaining('font.woff2')
      );
    });
  });

  describe('serveStaticFile (SVG)', () => {
    it('should serve SVG file when it exists', () => {
      // Arrange
      const filename = 'favicon';
      (existsSync as jest.Mock).mockReturnValue(true);

      // Act
      controller.serveStaticFile(filename, mockResponse as Response);

      // Assert
      expect(mockResponse.sendFile).toHaveBeenCalledWith(
        expect.stringContaining('favicon.svg')
      );
    });

    it('should return 404 when SVG file does not exist', () => {
      // Arrange
      const filename = 'nonexistent';
      (existsSync as jest.Mock).mockReturnValue(false);

      // Act
      controller.serveStaticFile(filename, mockResponse as Response);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'File not found' });
    });

    it('should handle logo SVG', () => {
      // Arrange
      const filename = 'logo';
      (existsSync as jest.Mock).mockReturnValue(true);

      // Act
      controller.serveStaticFile(filename, mockResponse as Response);

      // Assert
      expect(mockResponse.sendFile).toHaveBeenCalledWith(
        expect.stringContaining('logo.svg')
      );
    });
  });

  describe('SPA Routes - List Views', () => {
    beforeEach(() => {
      (existsSync as jest.Mock).mockReturnValue(true);
    });

    it('should serve index.html for /requests route', () => {
      // Act
      controller.serveRequestsRoute(mockResponse as Response);

      // Assert
      expect(mockResponse.sendFile).toHaveBeenCalledWith(
        expect.stringContaining('index.html')
      );
    });

    it('should serve index.html for /queries route', () => {
      // Act
      controller.serveQueriesRoute(mockResponse as Response);

      // Assert
      expect(mockResponse.sendFile).toHaveBeenCalled();
    });

    it('should serve index.html for /exceptions route', () => {
      // Act
      controller.serveExceptionsRoute(mockResponse as Response);

      // Assert
      expect(mockResponse.sendFile).toHaveBeenCalled();
    });

    it('should serve index.html for /logs route', () => {
      // Act
      controller.serveLogsRoute(mockResponse as Response);

      // Assert
      expect(mockResponse.sendFile).toHaveBeenCalled();
    });

    it('should serve index.html for /events route', () => {
      // Act
      controller.serveEventsRoute(mockResponse as Response);

      // Assert
      expect(mockResponse.sendFile).toHaveBeenCalled();
    });

    it('should serve index.html for /jobs route', () => {
      // Act
      controller.serveJobsRoute(mockResponse as Response);

      // Assert
      expect(mockResponse.sendFile).toHaveBeenCalled();
    });

    it('should serve index.html for /cache route', () => {
      // Act
      controller.serveCacheRoute(mockResponse as Response);

      // Assert
      expect(mockResponse.sendFile).toHaveBeenCalled();
    });

    it('should serve index.html for /mail route', () => {
      // Act
      controller.serveMailRoute(mockResponse as Response);

      // Assert
      expect(mockResponse.sendFile).toHaveBeenCalled();
    });

    it('should serve index.html for /schedule route', () => {
      // Act
      controller.serveScheduleRoute(mockResponse as Response);

      // Assert
      expect(mockResponse.sendFile).toHaveBeenCalled();
    });

    it('should serve index.html for /http-client route', () => {
      // Act
      controller.serveHttpClientRoute(mockResponse as Response);

      // Assert
      expect(mockResponse.sendFile).toHaveBeenCalled();
    });

    it('should serve index.html for /redis route', () => {
      // Act
      controller.serveRedisRoute(mockResponse as Response);

      // Assert
      expect(mockResponse.sendFile).toHaveBeenCalled();
    });

    it('should serve index.html for /models route', () => {
      // Act
      controller.serveModelsRoute(mockResponse as Response);

      // Assert
      expect(mockResponse.sendFile).toHaveBeenCalled();
    });

    it('should serve index.html for /notifications route', () => {
      // Act
      controller.serveNotificationsRoute(mockResponse as Response);

      // Assert
      expect(mockResponse.sendFile).toHaveBeenCalled();
    });

    it('should serve index.html for /views route', () => {
      // Act
      controller.serveViewsRoute(mockResponse as Response);

      // Assert
      expect(mockResponse.sendFile).toHaveBeenCalled();
    });

    it('should serve index.html for /commands route', () => {
      // Act
      controller.serveCommandsRoute(mockResponse as Response);

      // Assert
      expect(mockResponse.sendFile).toHaveBeenCalled();
    });

    it('should serve index.html for /gates route', () => {
      // Act
      controller.serveGatesRoute(mockResponse as Response);

      // Assert
      expect(mockResponse.sendFile).toHaveBeenCalled();
    });

    it('should serve index.html for /batches route', () => {
      // Act
      controller.serveBatchesRoute(mockResponse as Response);

      // Assert
      expect(mockResponse.sendFile).toHaveBeenCalled();
    });

    it('should serve index.html for /dumps route', () => {
      // Act
      controller.serveDumpsRoute(mockResponse as Response);

      // Assert
      expect(mockResponse.sendFile).toHaveBeenCalled();
    });
  });

  describe('SPA Routes - Detail Views', () => {
    beforeEach(() => {
      (existsSync as jest.Mock).mockReturnValue(true);
    });

    it('should serve index.html for /entries/:id route', () => {
      // Act
      controller.serveEntryDetailRoute(mockResponse as Response);

      // Assert
      expect(mockResponse.sendFile).toHaveBeenCalled();
    });

    it('should serve index.html for /requests/:id route', () => {
      // Act
      controller.serveRequestDetailRoute(mockResponse as Response);

      // Assert
      expect(mockResponse.sendFile).toHaveBeenCalled();
    });

    it('should serve index.html for /queries/:id route', () => {
      // Act
      controller.serveQueryDetailRoute(mockResponse as Response);

      // Assert
      expect(mockResponse.sendFile).toHaveBeenCalled();
    });

    it('should serve index.html for /exceptions/:id route', () => {
      // Act
      controller.serveExceptionDetailRoute(mockResponse as Response);

      // Assert
      expect(mockResponse.sendFile).toHaveBeenCalled();
    });

    it('should serve index.html for /logs/:id route', () => {
      // Act
      controller.serveLogDetailRoute(mockResponse as Response);

      // Assert
      expect(mockResponse.sendFile).toHaveBeenCalled();
    });

    it('should serve index.html for /events/:id route', () => {
      // Act
      controller.serveEventDetailRoute(mockResponse as Response);

      // Assert
      expect(mockResponse.sendFile).toHaveBeenCalled();
    });

    it('should serve index.html for /jobs/:id route', () => {
      // Act
      controller.serveJobDetailRoute(mockResponse as Response);

      // Assert
      expect(mockResponse.sendFile).toHaveBeenCalled();
    });

    it('should serve index.html for /cache/:id route', () => {
      // Act
      controller.serveCacheDetailRoute(mockResponse as Response);

      // Assert
      expect(mockResponse.sendFile).toHaveBeenCalled();
    });

    it('should serve index.html for /mail/:id route', () => {
      // Act
      controller.serveMailDetailRoute(mockResponse as Response);

      // Assert
      expect(mockResponse.sendFile).toHaveBeenCalled();
    });

    it('should serve index.html for /schedule/:id route', () => {
      // Act
      controller.serveScheduleDetailRoute(mockResponse as Response);

      // Assert
      expect(mockResponse.sendFile).toHaveBeenCalled();
    });

    it('should serve index.html for /http-client/:id route', () => {
      // Act
      controller.serveHttpClientDetailRoute(mockResponse as Response);

      // Assert
      expect(mockResponse.sendFile).toHaveBeenCalled();
    });

    it('should serve index.html for /redis/:id route', () => {
      // Act
      controller.serveRedisDetailRoute(mockResponse as Response);

      // Assert
      expect(mockResponse.sendFile).toHaveBeenCalled();
    });

    it('should serve index.html for /models/:id route', () => {
      // Act
      controller.serveModelDetailRoute(mockResponse as Response);

      // Assert
      expect(mockResponse.sendFile).toHaveBeenCalled();
    });

    it('should serve index.html for /notifications/:id route', () => {
      // Act
      controller.serveNotificationDetailRoute(mockResponse as Response);

      // Assert
      expect(mockResponse.sendFile).toHaveBeenCalled();
    });

    it('should serve index.html for /views/:id route', () => {
      // Act
      controller.serveViewDetailRoute(mockResponse as Response);

      // Assert
      expect(mockResponse.sendFile).toHaveBeenCalled();
    });

    it('should serve index.html for /commands/:id route', () => {
      // Act
      controller.serveCommandDetailRoute(mockResponse as Response);

      // Assert
      expect(mockResponse.sendFile).toHaveBeenCalled();
    });

    it('should serve index.html for /gates/:id route', () => {
      // Act
      controller.serveGateDetailRoute(mockResponse as Response);

      // Assert
      expect(mockResponse.sendFile).toHaveBeenCalled();
    });

    it('should serve index.html for /batches/:id route', () => {
      // Act
      controller.serveBatchDetailRoute(mockResponse as Response);

      // Assert
      expect(mockResponse.sendFile).toHaveBeenCalled();
    });

    it('should serve index.html for /dumps/:id route', () => {
      // Act
      controller.serveDumpDetailRoute(mockResponse as Response);

      // Assert
      expect(mockResponse.sendFile).toHaveBeenCalled();
    });
  });

  describe('SPA Routes - 404 Fallback', () => {
    beforeEach(() => {
      (existsSync as jest.Mock).mockReturnValue(false);
    });

    it('should return 404 for list routes when index.html missing', () => {
      // Act
      controller.serveRequestsRoute(mockResponse as Response);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Dashboard not found' });
    });

    it('should return 404 for detail routes when index.html missing', () => {
      // Act
      controller.serveEntryDetailRoute(mockResponse as Response);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Dashboard not found' });
    });
  });

  describe('serveIndexHtml (private method behavior)', () => {
    it('should correctly build path to index.html', () => {
      // Arrange
      (existsSync as jest.Mock).mockReturnValue(true);

      // Act
      controller.serveRequestsRoute(mockResponse as Response);

      // Assert
      const sendFileCall = (mockResponse.sendFile as jest.Mock).mock.calls[0][0];
      expect(sendFileCall).toContain('index.html');
      expect(sendFileCall).toContain('dashboard');
      expect(sendFileCall).toContain('public');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty filename for assets', () => {
      // Arrange
      const filename = '';
      (existsSync as jest.Mock).mockReturnValue(false);

      // Act
      controller.serveAssets(filename, mockResponse as Response);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(404);
    });

    it('should handle special characters in filename', () => {
      // Arrange
      const filename = 'file%20name.js';
      (existsSync as jest.Mock).mockReturnValue(true);

      // Act
      controller.serveAssets(filename, mockResponse as Response);

      // Assert
      expect(mockResponse.sendFile).toHaveBeenCalled();
    });

    it('should handle path traversal attempt in assets', () => {
      // Arrange
      const filename = '../../../etc/passwd';
      (existsSync as jest.Mock).mockReturnValue(false);

      // Act
      controller.serveAssets(filename, mockResponse as Response);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(404);
    });

    it('should handle path traversal attempt in SVG', () => {
      // Arrange
      const filename = '../../../etc/passwd';
      (existsSync as jest.Mock).mockReturnValue(false);

      // Act
      controller.serveStaticFile(filename, mockResponse as Response);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(404);
    });
  });
});
