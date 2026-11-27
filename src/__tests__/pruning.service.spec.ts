import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mocked } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PruningService } from '../core/pruning.service';
import { STORAGE, StorageInterface } from '../core/storage/storage.interface';
import { NESTLENS_CONFIG, NestLensConfig } from '../nestlens.config';

describe('PruningService', () => {
  let service: PruningService;
  let mockStorage: Mocked<StorageInterface>;
  let mockConfig: NestLensConfig;

  beforeEach(async () => {
    mockStorage = {
      initialize: vi.fn(),
      save: vi.fn(),
      saveBatch: vi.fn(),
      find: vi.fn(),
      findWithCursor: vi.fn(),
      findById: vi.fn(),
      count: vi.fn(),
      getLatestSequence: vi.fn(),
      hasEntriesAfter: vi.fn(),
      getStats: vi.fn(),
      getStorageStats: vi.fn(),
      prune: vi.fn(),
      pruneByType: vi.fn(),
      clear: vi.fn(),
      close: vi.fn(),
      addTags: vi.fn(),
      removeTags: vi.fn(),
      getEntryTags: vi.fn(),
      getAllTags: vi.fn(),
      findByTags: vi.fn(),
      addMonitoredTag: vi.fn(),
      removeMonitoredTag: vi.fn(),
      getMonitoredTags: vi.fn(),
      resolveEntry: vi.fn(),
      unresolveEntry: vi.fn(),
      updateFamilyHash: vi.fn(),
      findByFamilyHash: vi.fn(),
      getGroupedByFamilyHash: vi.fn(),
    } as Mocked<StorageInterface>;

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
      const stopSpy = vi.spyOn(service, 'stop');

      await service.onModuleDestroy();

      expect(stopSpy).toHaveBeenCalled();
    });
  });
});
