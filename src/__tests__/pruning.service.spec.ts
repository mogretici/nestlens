import { Test, TestingModule } from '@nestjs/testing';
import { PruningService } from '../core/pruning.service';
import { STORAGE, StorageInterface } from '../core/storage/storage.interface';
import { NESTLENS_CONFIG, NestLensConfig } from '../nestlens.config';

describe('PruningService', () => {
  let service: PruningService;
  let mockStorage: jest.Mocked<StorageInterface>;
  let mockConfig: NestLensConfig;

  beforeEach(async () => {
    mockStorage = {
      initialize: jest.fn(),
      save: jest.fn(),
      saveBatch: jest.fn(),
      find: jest.fn(),
      findWithCursor: jest.fn(),
      findById: jest.fn(),
      count: jest.fn(),
      getLatestSequence: jest.fn(),
      hasEntriesAfter: jest.fn(),
      getStats: jest.fn(),
      getStorageStats: jest.fn(),
      prune: jest.fn(),
      pruneByType: jest.fn(),
      clear: jest.fn(),
      close: jest.fn(),
      addTags: jest.fn(),
      removeTags: jest.fn(),
      getEntryTags: jest.fn(),
      getAllTags: jest.fn(),
      findByTags: jest.fn(),
      addMonitoredTag: jest.fn(),
      removeMonitoredTag: jest.fn(),
      getMonitoredTags: jest.fn(),
      resolveEntry: jest.fn(),
      unresolveEntry: jest.fn(),
      updateFamilyHash: jest.fn(),
      findByFamilyHash: jest.fn(),
      getGroupedByFamilyHash: jest.fn(),
    } as jest.Mocked<StorageInterface>;

    mockConfig = {
      enabled: true,
      pruning: {
        enabled: false, // Disable auto-start in tests
        maxAge: 24,
        interval: 60,
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PruningService,
        { provide: STORAGE, useValue: mockStorage },
        { provide: NESTLENS_CONFIG, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<PruningService>(PruningService);
  });

  afterEach(async () => {
    await service.stop();
  });

  describe('onModuleInit', () => {
    it('should not start pruning when disabled', () => {
      mockConfig.pruning!.enabled = false;

      service.onModuleInit();

      // Should not call prune immediately
      expect(mockStorage.prune).not.toHaveBeenCalled();
    });

    it('should start pruning when enabled', async () => {
      mockConfig.pruning!.enabled = true;
      mockStorage.prune.mockResolvedValue(5);

      service.onModuleInit();

      // Wait for immediate prune call
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockStorage.prune).toHaveBeenCalled();
    });
  });

  describe('prune', () => {
    it('should calculate correct cutoff date based on maxAge', async () => {
      mockConfig.pruning!.enabled = true;
      mockConfig.pruning!.maxAge = 48; // 48 hours
      mockStorage.prune.mockResolvedValue(0);

      service.onModuleInit();

      // Wait for the prune to be called
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockStorage.prune).toHaveBeenCalled();
      const callArg = mockStorage.prune.mock.calls[0][0];

      // The date should be approximately 48 hours ago
      const expectedDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
      const actualDate = new Date(callArg);

      // Allow 1 second tolerance
      expect(Math.abs(actualDate.getTime() - expectedDate.getTime())).toBeLessThan(1000);
    });

    it('should use default maxAge of 24 hours when not specified', async () => {
      delete mockConfig.pruning!.maxAge;
      mockConfig.pruning!.enabled = true;
      mockStorage.prune.mockResolvedValue(0);

      service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockStorage.prune).toHaveBeenCalled();
      const callArg = mockStorage.prune.mock.calls[0][0];

      const expectedDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const actualDate = new Date(callArg);

      expect(Math.abs(actualDate.getTime() - expectedDate.getTime())).toBeLessThan(1000);
    });

    it('should handle prune errors gracefully', async () => {
      mockConfig.pruning!.enabled = true;
      mockStorage.prune.mockRejectedValue(new Error('Database error'));

      // Should not throw
      service.onModuleInit();

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockStorage.prune).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('should stop the pruning interval', async () => {
      mockConfig.pruning!.enabled = true;
      mockStorage.prune.mockResolvedValue(0);

      service.onModuleInit();

      await service.stop();

      // Clear the mock
      mockStorage.prune.mockClear();

      // Wait to ensure no more calls happen
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockStorage.prune).not.toHaveBeenCalled();
    });

    it('should handle multiple stop calls gracefully', async () => {
      await service.stop();
      await service.stop();
      await service.stop();

      // Should not throw
    });
  });

  describe('onModuleDestroy', () => {
    it('should call stop on module destroy', async () => {
      const stopSpy = jest.spyOn(service, 'stop');

      await service.onModuleDestroy();

      expect(stopSpy).toHaveBeenCalled();
    });
  });
});
