/**
 * DumpWatcher Tests
 *
 * Tests for the dump watcher that monitors database dumps, exports, imports, and migrations.
 * Follows AAA (Arrange-Act-Assert) pattern.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { CollectorService } from '../../core/collector.service';
import { NESTLENS_CONFIG, NestLensConfig } from '../../nestlens.config';
import { DumpWatcher, NESTLENS_DUMP_SERVICE } from '../../watchers/dump.watcher';

describe('DumpWatcher', () => {
  let watcher: DumpWatcher;
  let mockCollector: jest.Mocked<CollectorService>;
  let mockConfig: NestLensConfig;

  const createDumpService = (overrides: Partial<{
    export: jest.Mock;
    import: jest.Mock;
    backup: jest.Mock;
    restore: jest.Mock;
    migrate: jest.Mock;
    dump: jest.Mock;
  }> = {}) => ({
    export: jest.fn().mockResolvedValue({ recordCount: 100, fileSize: 1024 }),
    import: jest.fn().mockResolvedValue({ records: 50 }),
    backup: jest.fn().mockResolvedValue({ size: 2048 }),
    restore: jest.fn().mockResolvedValue({ rows: 200 }),
    migrate: jest.fn().mockResolvedValue({ count: 10 }),
    dump: jest.fn().mockResolvedValue({ recordCount: 500 }),
    ...overrides,
  });

  const createWatcher = async (
    config: NestLensConfig,
    dumpService?: ReturnType<typeof createDumpService>,
  ): Promise<DumpWatcher> => {
    const providers: any[] = [
      DumpWatcher,
      { provide: CollectorService, useValue: mockCollector },
      { provide: NESTLENS_CONFIG, useValue: config },
    ];

    if (dumpService !== undefined) {
      providers.push({ provide: NESTLENS_DUMP_SERVICE, useValue: dumpService });
    }

    const module: TestingModule = await Test.createTestingModule({
      providers,
    }).compile();

    return module.get<DumpWatcher>(DumpWatcher);
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
        dump: { enabled: true },
      },
    };
  });

  // ============================================================================
  // Config Handling
  // ============================================================================

  describe('Config Handling', () => {
    it('should be enabled when dump watcher config is true', async () => {
      // Arrange
      mockConfig.watchers = { dump: true };
      const service = createDumpService();
      watcher = await createWatcher(mockConfig, service);

      // Assert
      expect((watcher as any).config.enabled).toBe(true);
    });

    it('should be disabled when dump watcher config is false', async () => {
      // Arrange
      mockConfig.watchers = { dump: false };
      const service = createDumpService();
      watcher = await createWatcher(mockConfig, service);

      // Assert
      expect((watcher as any).config.enabled).toBe(false);
    });

    it('should be enabled by default when watchers config is undefined', async () => {
      // Arrange
      mockConfig.watchers = undefined;
      const service = createDumpService();
      watcher = await createWatcher(mockConfig, service);

      // Assert
      expect((watcher as any).config.enabled).toBe(true);
    });
  });

  // ============================================================================
  // Module Initialization
  // ============================================================================

  describe('Module Initialization', () => {
    it('should handle missing dump service gracefully', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, undefined);

      // Act & Assert - should not throw
      expect(() => watcher.onModuleInit()).not.toThrow();
    });

    it('should setup interceptors when service is available', async () => {
      // Arrange
      const service = createDumpService();
      watcher = await createWatcher(mockConfig, service);

      // Act
      watcher.onModuleInit();

      // Assert - methods should be wrapped
      expect(typeof service.export).toBe('function');
    });

    it('should not setup interceptors when disabled', async () => {
      // Arrange
      mockConfig.watchers = { dump: false };
      const service = createDumpService();
      const originalExport = service.export;
      watcher = await createWatcher(mockConfig, service);

      // Act
      watcher.onModuleInit();

      // Assert - original method should remain unchanged
      expect(service.export).toBe(originalExport);
    });
  });

  // ============================================================================
  // Export Operations
  // ============================================================================

  describe('Export Operations', () => {
    it('should collect export completed event', async () => {
      // Arrange
      const service = createDumpService({
        export: jest.fn().mockResolvedValue({
          format: 'json',
          recordCount: 100,
          fileSize: 2048,
          source: 'users',
          destination: '/backup/users.json',
        }),
      });
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.export({ table: 'users' });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'dump',
        expect.objectContaining({
          operation: 'export',
          status: 'completed',
          format: 'json',
          recordCount: 100,
          fileSize: 2048,
        }),
      );
    });

    it('should calculate export duration', async () => {
      // Arrange
      const service = createDumpService({
        export: jest.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve({}), 50)),
        ),
      });
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.export();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'dump',
        expect.objectContaining({
          duration: expect.any(Number),
        }),
      );
      const call = mockCollector.collect.mock.calls[0][1] as any;
      expect(call.duration).toBeGreaterThanOrEqual(40);
    });

    it('should return original result', async () => {
      // Arrange
      const expectedResult = { success: true, file: '/backup/data.json' };
      const service = createDumpService({
        export: jest.fn().mockResolvedValue(expectedResult),
      });
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      const result = await service.export();

      // Assert
      expect(result).toEqual(expectedResult);
    });
  });

  // ============================================================================
  // Import Operations
  // ============================================================================

  describe('Import Operations', () => {
    it('should collect import completed event', async () => {
      // Arrange
      const service = createDumpService({
        import: jest.fn().mockResolvedValue({
          format: 'csv',
          recordCount: 500,
          source: '/data/import.csv',
          destination: 'products',
        }),
      });
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.import({ file: '/data/import.csv' });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'dump',
        expect.objectContaining({
          operation: 'import',
          status: 'completed',
          format: 'csv',
        }),
      );
    });

    it('should handle import failure', async () => {
      // Arrange
      const service = createDumpService({
        import: jest.fn().mockRejectedValue(new Error('Import failed: invalid format')),
      });
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act & Assert
      await expect(service.import())
        .rejects.toThrow('Import failed: invalid format');

      expect(mockCollector.collect).toHaveBeenCalledWith(
        'dump',
        expect.objectContaining({
          operation: 'import',
          status: 'failed',
          error: 'Import failed: invalid format',
        }),
      );
    });
  });

  // ============================================================================
  // Backup Operations
  // ============================================================================

  describe('Backup Operations', () => {
    it('should collect backup completed event', async () => {
      // Arrange
      const service = createDumpService({
        backup: jest.fn().mockResolvedValue({
          format: 'sql',
          fileSize: 10240,
          compressed: true,
          encrypted: true,
          destination: '/backups/db-2024-01-01.sql.gz',
        }),
      });
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.backup({ compress: true, encrypt: true });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'dump',
        expect.objectContaining({
          operation: 'backup',
          status: 'completed',
          format: 'sql',
          compressed: true,
          encrypted: true,
        }),
      );
    });
  });

  // ============================================================================
  // Restore Operations
  // ============================================================================

  describe('Restore Operations', () => {
    it('should collect restore completed event', async () => {
      // Arrange
      const service = createDumpService({
        restore: jest.fn().mockResolvedValue({
          format: 'binary',
          recordCount: 1000,
          source: '/backups/db-snapshot.bin',
        }),
      });
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.restore({ file: '/backups/db-snapshot.bin' });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'dump',
        expect.objectContaining({
          operation: 'restore',
          status: 'completed',
          format: 'binary',
        }),
      );
    });
  });

  // ============================================================================
  // Migrate Operations
  // ============================================================================

  describe('Migrate Operations', () => {
    it('should collect migrate completed event', async () => {
      // Arrange
      const service = createDumpService({
        migrate: jest.fn().mockResolvedValue({
          count: 15,
          source: 'old_db',
          destination: 'new_db',
        }),
      });
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.migrate();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'dump',
        expect.objectContaining({
          operation: 'migrate',
          status: 'completed',
        }),
      );
    });
  });

  // ============================================================================
  // Dump Operations
  // ============================================================================

  describe('Dump Operations', () => {
    it('should map dump method to export operation', async () => {
      // Arrange
      const service = createDumpService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.dump();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'dump',
        expect.objectContaining({
          operation: 'export',
        }),
      );
    });
  });

  // ============================================================================
  // Format Detection
  // ============================================================================

  describe('Format Detection', () => {
    it('should detect sql format', async () => {
      // Arrange
      const service = createDumpService({
        export: jest.fn().mockResolvedValue({ format: 'sql' }),
      });
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.export();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'dump',
        expect.objectContaining({
          format: 'sql',
        }),
      );
    });

    it('should detect json format', async () => {
      // Arrange
      const service = createDumpService({
        export: jest.fn().mockResolvedValue({ type: 'json' }),
      });
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.export();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'dump',
        expect.objectContaining({
          format: 'json',
        }),
      );
    });

    it('should detect csv format', async () => {
      // Arrange
      const service = createDumpService({
        export: jest.fn().mockResolvedValue({ format: 'CSV' }),
      });
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.export();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'dump',
        expect.objectContaining({
          format: 'csv',
        }),
      );
    });

    it('should detect binary format', async () => {
      // Arrange
      const service = createDumpService({
        export: jest.fn().mockResolvedValue({ format: 'binary' }),
      });
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.export();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'dump',
        expect.objectContaining({
          format: 'binary',
        }),
      );
    });

    it('should default to json format', async () => {
      // Arrange
      const service = createDumpService({
        export: jest.fn().mockResolvedValue({}),
      });
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.export();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'dump',
        expect.objectContaining({
          format: 'json',
        }),
      );
    });

    it('should detect format from options when result has none', async () => {
      // Arrange
      const service = createDumpService({
        export: jest.fn().mockResolvedValue({}),
      });
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.export({ format: 'csv' });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'dump',
        expect.objectContaining({
          format: 'csv',
        }),
      );
    });
  });

  // ============================================================================
  // Field Extraction
  // ============================================================================

  describe('Field Extraction', () => {
    it('should extract source from result', async () => {
      // Arrange
      const service = createDumpService({
        export: jest.fn().mockResolvedValue({ source: 'users_table' }),
      });
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.export();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'dump',
        expect.objectContaining({
          source: 'users_table',
        }),
      );
    });

    it('should extract from field as source', async () => {
      // Arrange
      const service = createDumpService({
        export: jest.fn().mockResolvedValue({ from: 'products' }),
      });
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.export();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'dump',
        expect.objectContaining({
          source: 'products',
        }),
      );
    });

    it('should extract destination from result', async () => {
      // Arrange
      const service = createDumpService({
        export: jest.fn().mockResolvedValue({ destination: '/backups/data.json' }),
      });
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.export();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'dump',
        expect.objectContaining({
          destination: '/backups/data.json',
        }),
      );
    });

    it('should extract file field as destination', async () => {
      // Arrange
      const service = createDumpService({
        export: jest.fn().mockResolvedValue({ file: '/tmp/export.sql' }),
      });
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.export();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'dump',
        expect.objectContaining({
          destination: '/tmp/export.sql',
        }),
      );
    });

    it('should extract recordCount from various fields', async () => {
      // Arrange
      const service = createDumpService({
        export: jest.fn().mockResolvedValue({ rows: 150 }),
      });
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.export();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'dump',
        expect.objectContaining({
          recordCount: 150,
        }),
      );
    });

    it('should extract fileSize from bytes field', async () => {
      // Arrange
      const service = createDumpService({
        export: jest.fn().mockResolvedValue({ bytes: 4096 }),
      });
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.export();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'dump',
        expect.objectContaining({
          fileSize: 4096,
        }),
      );
    });

    it('should extract compressed flag', async () => {
      // Arrange
      const service = createDumpService({
        export: jest.fn().mockResolvedValue({ gzip: true }),
      });
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.export();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'dump',
        expect.objectContaining({
          compressed: true,
        }),
      );
    });

    it('should extract encrypted flag', async () => {
      // Arrange
      const service = createDumpService({
        export: jest.fn().mockResolvedValue({ secure: true }),
      });
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.export();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'dump',
        expect.objectContaining({
          encrypted: true,
        }),
      );
    });
  });

  // ============================================================================
  // Manual Tracking
  // ============================================================================

  describe('Manual Tracking (trackDump)', () => {
    it('should track export operation', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, undefined);

      // Act
      watcher.trackDump('export', 'json', 1000, 'completed', {
        source: 'users',
        destination: '/backup/users.json',
        recordCount: 100,
        fileSize: 2048,
      });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'dump',
        expect.objectContaining({
          operation: 'export',
          format: 'json',
          duration: 1000,
          status: 'completed',
          source: 'users',
          destination: '/backup/users.json',
          recordCount: 100,
          fileSize: 2048,
        }),
      );
    });

    it('should track import operation', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, undefined);

      // Act
      watcher.trackDump('import', 'csv', 500, 'completed', {
        source: '/data/import.csv',
        destination: 'products',
        recordCount: 50,
      });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'dump',
        expect.objectContaining({
          operation: 'import',
          format: 'csv',
        }),
      );
    });

    it('should track backup operation', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, undefined);

      // Act
      watcher.trackDump('backup', 'sql', 2000, 'completed', {
        compressed: true,
        encrypted: true,
      });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'dump',
        expect.objectContaining({
          operation: 'backup',
          format: 'sql',
          compressed: true,
          encrypted: true,
        }),
      );
    });

    it('should track failed operation', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, undefined);

      // Act
      watcher.trackDump('restore', 'binary', 100, 'failed', {
        error: 'Backup file corrupted',
      });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'dump',
        expect.objectContaining({
          operation: 'restore',
          status: 'failed',
          error: 'Backup file corrupted',
        }),
      );
    });

    it('should track migrate operation', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, undefined);

      // Act
      watcher.trackDump('migrate', 'json', 5000, 'completed', {
        source: 'legacy_db',
        destination: 'new_db',
        recordCount: 10000,
      });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'dump',
        expect.objectContaining({
          operation: 'migrate',
        }),
      );
    });
  });

  // ============================================================================
  // Error Handling
  // ============================================================================

  describe('Error Handling', () => {
    it('should collect failed event on error', async () => {
      // Arrange
      const service = createDumpService({
        export: jest.fn().mockRejectedValue(new Error('Disk full')),
      });
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act & Assert
      await expect(service.export())
        .rejects.toThrow('Disk full');

      expect(mockCollector.collect).toHaveBeenCalledWith(
        'dump',
        expect.objectContaining({
          status: 'failed',
          error: 'Disk full',
        }),
      );
    });

    it('should re-throw the error', async () => {
      // Arrange
      const service = createDumpService({
        backup: jest.fn().mockRejectedValue(new Error('Permission denied')),
      });
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act & Assert
      await expect(service.backup())
        .rejects.toThrow('Permission denied');
    });

    it('should handle non-Error objects', async () => {
      // Arrange
      const service = createDumpService({
        import: jest.fn().mockRejectedValue('String error'),
      });
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      try {
        await service.import();
      } catch {
        // Expected
      }

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'dump',
        expect.objectContaining({
          error: 'String error',
        }),
      );
    });

    it('should extract options on failure', async () => {
      // Arrange
      const service = createDumpService({
        export: jest.fn().mockRejectedValue(new Error('Failed')),
      });
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      try {
        await service.export({ format: 'csv', source: 'users' });
      } catch {
        // Expected
      }

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'dump',
        expect.objectContaining({
          format: 'csv',
          source: 'users',
        }),
      );
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('Edge Cases', () => {
    it('should skip non-function methods', async () => {
      // Arrange
      const service = {
        ...createDumpService(),
        export: 'not a function',
      };
      watcher = await createWatcher(mockConfig, service as any);

      // Act & Assert - should not throw
      expect(() => watcher.onModuleInit()).not.toThrow();
    });

    it('should handle null result', async () => {
      // Arrange
      const service = createDumpService({
        export: jest.fn().mockResolvedValue(null),
      });
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.export();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'dump',
        expect.objectContaining({
          format: 'json', // default
        }),
      );
    });

    it('should handle undefined options', async () => {
      // Arrange
      const service = createDumpService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.export(undefined);

      // Assert
      expect(mockCollector.collect).toHaveBeenCalled();
    });

    it('should handle non-object result', async () => {
      // Arrange
      const service = createDumpService({
        export: jest.fn().mockResolvedValue('success'),
      });
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.export();

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'dump',
        expect.objectContaining({
          format: 'json', // default
        }),
      );
    });
  });
});
