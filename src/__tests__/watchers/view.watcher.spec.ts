/**
 * ViewWatcher Tests
 *
 * Tests for the view watcher that monitors template rendering.
 * Follows AAA (Arrange-Act-Assert) pattern.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { CollectorService } from '../../core/collector.service';
import { NESTLENS_CONFIG, NestLensConfig } from '../../nestlens.config';
import { ViewWatcher, NESTLENS_VIEW_ENGINE } from '../../watchers/view.watcher';

describe('ViewWatcher', () => {
  let watcher: ViewWatcher;
  let mockCollector: jest.Mocked<CollectorService>;
  let mockConfig: NestLensConfig;

  const createViewEngine = (overrides: Partial<{
    render: jest.Mock;
  }> = {}) => ({
    render: jest.fn().mockResolvedValue('<html>Rendered</html>'),
    ...overrides,
  });

  const createWatcher = async (
    config: NestLensConfig,
    viewEngine?: ReturnType<typeof createViewEngine>,
  ): Promise<ViewWatcher> => {
    const providers: any[] = [
      ViewWatcher,
      { provide: CollectorService, useValue: mockCollector },
      { provide: NESTLENS_CONFIG, useValue: config },
    ];

    if (viewEngine !== undefined) {
      providers.push({ provide: NESTLENS_VIEW_ENGINE, useValue: viewEngine });
    }

    const module: TestingModule = await Test.createTestingModule({
      providers,
    }).compile();

    return module.get<ViewWatcher>(ViewWatcher);
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockCollector = {
      collect: jest.fn(),
      collectImmediate: jest.fn(),
    } as unknown as jest.Mocked<CollectorService>;

    mockConfig = {
      enabled: true,
      watchers: {
        view: { enabled: true },
      },
    };
  });

  // ============================================================================
  // Config Handling
  // ============================================================================

  describe('Config Handling', () => {
    it('should be enabled when view watcher config is true', async () => {
      // Arrange
      mockConfig.watchers = { view: true };
      const engine = createViewEngine();
      watcher = await createWatcher(mockConfig, engine);

      // Assert
      expect((watcher as any).config.enabled).toBe(true);
    });

    it('should be disabled when view watcher config is false', async () => {
      // Arrange
      mockConfig.watchers = { view: false };
      const engine = createViewEngine();
      watcher = await createWatcher(mockConfig, engine);

      // Assert
      expect((watcher as any).config.enabled).toBe(false);
    });

    it('should be enabled by default when watchers config is undefined', async () => {
      // Arrange
      mockConfig.watchers = undefined;
      const engine = createViewEngine();
      watcher = await createWatcher(mockConfig, engine);

      // Assert
      expect((watcher as any).config.enabled).toBe(true);
    });

    it('should use object config when provided', async () => {
      // Arrange
      mockConfig.watchers = { view: { enabled: true, captureData: true } };
      const engine = createViewEngine();
      watcher = await createWatcher(mockConfig, engine);

      // Assert
      expect((watcher as any).config.captureData).toBe(true);
    });
  });

  // ============================================================================
  // Module Initialization
  // ============================================================================

  describe('Module Initialization', () => {
    it('should handle missing view engine gracefully', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, undefined);

      // Act & Assert - should not throw
      expect(() => watcher.onModuleInit()).not.toThrow();
    });

    it('should setup interceptors when engine is available', async () => {
      // Arrange
      const engine = createViewEngine();
      watcher = await createWatcher(mockConfig, engine);

      // Act
      watcher.onModuleInit();

      // Assert - render method should be wrapped
      expect(typeof engine.render).toBe('function');
    });

    it('should not setup interceptors when disabled', async () => {
      // Arrange
      mockConfig.watchers = { view: false };
      const engine = createViewEngine();
      const originalRender = engine.render;
      watcher = await createWatcher(mockConfig, engine);

      // Act
      watcher.onModuleInit();

      // Assert - original method should remain unchanged
      expect(engine.render).toBe(originalRender);
    });

    it('should handle engine without render method', async () => {
      // Arrange
      const invalidEngine = {};
      watcher = await createWatcher(mockConfig, invalidEngine as any);

      // Act & Assert - should not throw
      expect(() => watcher.onModuleInit()).not.toThrow();
    });
  });

  // ============================================================================
  // Render - Success
  // ============================================================================

  describe('Render - Success', () => {
    it('should collect rendered view', async () => {
      // Arrange
      const engine = createViewEngine();
      watcher = await createWatcher(mockConfig, engine);
      watcher.onModuleInit();

      // Act
      await engine.render('home.ejs', { title: 'Home' });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'view',
        expect.objectContaining({
          template: 'home.ejs',
          format: 'html',
          status: 'rendered',
        }),
      );
    });

    it('should calculate render duration', async () => {
      // Arrange
      const engine = createViewEngine({
        render: jest.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve('<html>'), 50)),
        ),
      });
      watcher = await createWatcher(mockConfig, engine);
      watcher.onModuleInit();

      // Act
      await engine.render('slow.ejs');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'view',
        expect.objectContaining({
          duration: expect.any(Number),
        }),
      );
      const call = mockCollector.collect.mock.calls[0][1] as any;
      expect(call.duration).toBeGreaterThanOrEqual(40);
    });

    it('should return original result', async () => {
      // Arrange
      const expectedResult = '<html><body>Content</body></html>';
      const engine = createViewEngine({
        render: jest.fn().mockResolvedValue(expectedResult),
      });
      watcher = await createWatcher(mockConfig, engine);
      watcher.onModuleInit();

      // Act
      const result = await engine.render('test.ejs');

      // Assert
      expect(result).toBe(expectedResult);
    });

    it('should calculate output size for string result', async () => {
      // Arrange
      const output = '<html>'.repeat(100);
      const engine = createViewEngine({
        render: jest.fn().mockResolvedValue(output),
      });
      watcher = await createWatcher(mockConfig, engine);
      watcher.onModuleInit();

      // Act
      await engine.render('test.ejs');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'view',
        expect.objectContaining({
          outputSize: 600,
        }),
      );
    });

    it('should calculate output size for buffer result', async () => {
      // Arrange
      const output = Buffer.from('PDF content');
      const engine = createViewEngine({
        render: jest.fn().mockResolvedValue(output),
      });
      watcher = await createWatcher(mockConfig, engine);
      watcher.onModuleInit();

      // Act
      await engine.render('report.pdf');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'view',
        expect.objectContaining({
          outputSize: 11,
        }),
      );
    });

    it('should calculate data size', async () => {
      // Arrange
      const engine = createViewEngine();
      watcher = await createWatcher(mockConfig, engine);
      watcher.onModuleInit();

      // Act
      await engine.render('home.ejs', { items: [1, 2, 3], user: { name: 'John' } });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'view',
        expect.objectContaining({
          dataSize: expect.any(Number),
        }),
      );
    });
  });

  // ============================================================================
  // Render - Failure
  // ============================================================================

  describe('Render - Failure', () => {
    it('should collect error status', async () => {
      // Arrange
      const engine = createViewEngine({
        render: jest.fn().mockRejectedValue(new Error('Template not found')),
      });
      watcher = await createWatcher(mockConfig, engine);
      watcher.onModuleInit();

      // Act & Assert
      await expect(engine.render('missing.ejs')).rejects.toThrow('Template not found');

      expect(mockCollector.collect).toHaveBeenCalledWith(
        'view',
        expect.objectContaining({
          status: 'error',
          error: 'Template not found',
        }),
      );
    });

    it('should re-throw the error', async () => {
      // Arrange
      const engine = createViewEngine({
        render: jest.fn().mockRejectedValue(new Error('Syntax error')),
      });
      watcher = await createWatcher(mockConfig, engine);
      watcher.onModuleInit();

      // Act & Assert
      await expect(engine.render('broken.ejs')).rejects.toThrow('Syntax error');
    });

    it('should handle non-Error objects', async () => {
      // Arrange
      const engine = createViewEngine({
        render: jest.fn().mockRejectedValue('String error'),
      });
      watcher = await createWatcher(mockConfig, engine);
      watcher.onModuleInit();

      // Act
      try {
        await engine.render('test.ejs');
      } catch {
        // Expected
      }

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'view',
        expect.objectContaining({
          error: 'String error',
        }),
      );
    });
  });

  // ============================================================================
  // Format Detection
  // ============================================================================

  describe('Format Detection', () => {
    it('should detect HTML format', async () => {
      // Arrange
      const engine = createViewEngine();
      watcher = await createWatcher(mockConfig, engine);
      watcher.onModuleInit();

      // Act
      await engine.render('page.html');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'view',
        expect.objectContaining({
          format: 'html',
        }),
      );
    });

    it('should detect PDF format', async () => {
      // Arrange
      const engine = createViewEngine();
      watcher = await createWatcher(mockConfig, engine);
      watcher.onModuleInit();

      // Act
      await engine.render('report.pdf');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'view',
        expect.objectContaining({
          format: 'pdf',
        }),
      );
    });

    it('should detect XML format', async () => {
      // Arrange
      const engine = createViewEngine();
      watcher = await createWatcher(mockConfig, engine);
      watcher.onModuleInit();

      // Act
      await engine.render('feed.xml');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'view',
        expect.objectContaining({
          format: 'xml',
        }),
      );
    });

    it('should detect JSON format', async () => {
      // Arrange
      const engine = createViewEngine();
      watcher = await createWatcher(mockConfig, engine);
      watcher.onModuleInit();

      // Act
      await engine.render('data.json');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'view',
        expect.objectContaining({
          format: 'json',
        }),
      );
    });

    it('should default to HTML for unknown extensions', async () => {
      // Arrange
      const engine = createViewEngine();
      watcher = await createWatcher(mockConfig, engine);
      watcher.onModuleInit();

      // Act
      await engine.render('template.ejs');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'view',
        expect.objectContaining({
          format: 'html',
        }),
      );
    });

    it('should use explicit format from object API', async () => {
      // Arrange
      const engine = createViewEngine();
      watcher = await createWatcher(mockConfig, engine);
      watcher.onModuleInit();

      // Act
      await engine.render({ template: 'report', format: 'pdf' });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'view',
        expect.objectContaining({
          format: 'pdf',
        }),
      );
    });
  });

  // ============================================================================
  // Object-Based API
  // ============================================================================

  describe('Object-Based API', () => {
    it('should extract template from object', async () => {
      // Arrange
      const engine = createViewEngine();
      watcher = await createWatcher(mockConfig, engine);
      watcher.onModuleInit();

      // Act
      await engine.render({ template: 'dashboard' });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'view',
        expect.objectContaining({
          template: 'dashboard',
        }),
      );
    });

    it('should extract view field as template', async () => {
      // Arrange
      const engine = createViewEngine();
      watcher = await createWatcher(mockConfig, engine);
      watcher.onModuleInit();

      // Act
      await engine.render({ view: 'profile' });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'view',
        expect.objectContaining({
          template: 'profile',
        }),
      );
    });

    it('should extract locals from object', async () => {
      // Arrange
      mockConfig.watchers = { view: { enabled: true, captureData: true } };
      const engine = createViewEngine();
      watcher = await createWatcher(mockConfig, engine);
      watcher.onModuleInit();

      // Act
      await engine.render({ template: 'home', locals: { title: 'Home' } });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'view',
        expect.objectContaining({
          locals: { title: 'Home' },
        }),
      );
    });

    it('should extract data field as locals', async () => {
      // Arrange
      mockConfig.watchers = { view: { enabled: true, captureData: true } };
      const engine = createViewEngine();
      watcher = await createWatcher(mockConfig, engine);
      watcher.onModuleInit();

      // Act
      await engine.render({ template: 'home', data: { user: 'John' } });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'view',
        expect.objectContaining({
          locals: { user: 'John' },
        }),
      );
    });

    it('should extract cacheHit from object', async () => {
      // Arrange
      const engine = createViewEngine();
      watcher = await createWatcher(mockConfig, engine);
      watcher.onModuleInit();

      // Act
      await engine.render({ template: 'cached', cacheHit: true });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'view',
        expect.objectContaining({
          cacheHit: true,
        }),
      );
    });

    it('should use type field for format', async () => {
      // Arrange
      const engine = createViewEngine();
      watcher = await createWatcher(mockConfig, engine);
      watcher.onModuleInit();

      // Act
      await engine.render({ template: 'data', type: 'xml' });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'view',
        expect.objectContaining({
          format: 'xml',
        }),
      );
    });
  });

  // ============================================================================
  // Locals Capture
  // ============================================================================

  describe('Locals Capture', () => {
    it('should capture locals when enabled', async () => {
      // Arrange
      mockConfig.watchers = { view: { enabled: true, captureData: true } };
      const engine = createViewEngine();
      watcher = await createWatcher(mockConfig, engine);
      watcher.onModuleInit();

      // Act
      await engine.render('home.ejs', { title: 'Home', items: [1, 2, 3] });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'view',
        expect.objectContaining({
          locals: { title: 'Home', items: [1, 2, 3] },
        }),
      );
    });

    it('should not capture locals when disabled', async () => {
      // Arrange
      mockConfig.watchers = { view: { enabled: true, captureData: false } };
      const engine = createViewEngine();
      watcher = await createWatcher(mockConfig, engine);
      watcher.onModuleInit();

      // Act
      await engine.render('home.ejs', { sensitive: 'data' });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'view',
        expect.objectContaining({
          locals: undefined,
        }),
      );
    });

    it('should truncate large locals', async () => {
      // Arrange
      mockConfig.watchers = { view: { enabled: true, captureData: true } };
      const engine = createViewEngine();
      watcher = await createWatcher(mockConfig, engine);
      watcher.onModuleInit();
      const largeData = { content: 'x'.repeat(10000) };

      // Act
      await engine.render('home.ejs', largeData);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'view',
        expect.objectContaining({
          locals: expect.objectContaining({
            _truncated: true,
            _size: expect.any(Number),
          }),
        }),
      );
    });

    it('should handle non-serializable locals', async () => {
      // Arrange
      mockConfig.watchers = { view: { enabled: true, captureData: true } };
      const engine = createViewEngine();
      watcher = await createWatcher(mockConfig, engine);
      watcher.onModuleInit();
      const circularLocals: any = {};
      circularLocals.self = circularLocals;

      // Act
      await engine.render('home.ejs', circularLocals);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'view',
        expect.objectContaining({
          locals: { _error: 'Unable to serialize locals' },
        }),
      );
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle empty arguments', async () => {
      // Arrange
      const engine = createViewEngine();
      watcher = await createWatcher(mockConfig, engine);
      watcher.onModuleInit();

      // Act
      await engine.render();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'view',
        expect.objectContaining({
          template: 'unknown',
          format: 'html',
        }),
      );
    });

    it('should handle null locals', async () => {
      // Arrange
      const engine = createViewEngine();
      watcher = await createWatcher(mockConfig, engine);
      watcher.onModuleInit();

      // Act
      await engine.render('home.ejs', null);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'view',
        expect.objectContaining({
          dataSize: undefined,
        }),
      );
    });

    it('should handle undefined result', async () => {
      // Arrange
      const engine = createViewEngine({
        render: jest.fn().mockResolvedValue(undefined),
      });
      watcher = await createWatcher(mockConfig, engine);
      watcher.onModuleInit();

      // Act
      await engine.render('test.ejs');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'view',
        expect.objectContaining({
          outputSize: undefined,
        }),
      );
    });

    it('should handle object result', async () => {
      // Arrange
      const engine = createViewEngine({
        render: jest.fn().mockResolvedValue({ html: '<div></div>', meta: {} }),
      });
      watcher = await createWatcher(mockConfig, engine);
      watcher.onModuleInit();

      // Act
      await engine.render('test.ejs');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'view',
        expect.objectContaining({
          outputSize: expect.any(Number),
        }),
      );
    });

    it('should use name field as template', async () => {
      // Arrange
      const engine = createViewEngine();
      watcher = await createWatcher(mockConfig, engine);
      watcher.onModuleInit();

      // Act
      await engine.render({ name: 'named-template' });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'view',
        expect.objectContaining({
          template: 'named-template',
        }),
      );
    });

    it('should extract context field as locals', async () => {
      // Arrange
      mockConfig.watchers = { view: { enabled: true, captureData: true } };
      const engine = createViewEngine();
      watcher = await createWatcher(mockConfig, engine);
      watcher.onModuleInit();

      // Act
      await engine.render({ template: 'home', context: { key: 'value' } });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'view',
        expect.objectContaining({
          locals: { key: 'value' },
        }),
      );
    });
  });
});
