/**
 * TagController Tests
 *
 * Tests for the tag management API endpoints.
 * Follows AAA (Arrange-Act-Assert) pattern.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { TagController } from '../../api/tag.controller';
import { TagService } from '../../core/tag.service';
import { NESTLENS_CONFIG } from '../../nestlens.config';

describe('TagController', () => {
  let controller: TagController;
  let mockTagService: jest.Mocked<TagService>;

  beforeEach(async () => {
    mockTagService = {
      getAllTags: jest.fn(),
      findByTags: jest.fn(),
      getEntryTags: jest.fn(),
      addTags: jest.fn(),
      removeTags: jest.fn(),
      getMonitoredTagsWithCounts: jest.fn(),
      addMonitoredTag: jest.fn(),
      removeMonitoredTag: jest.fn(),
      autoTag: jest.fn(),
    } as unknown as jest.Mocked<TagService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TagController],
      providers: [
        { provide: TagService, useValue: mockTagService },
        {
          provide: NESTLENS_CONFIG,
          useValue: {
            enabled: true,
            authorization: { allowedEnvironments: ['test'] },
          },
        },
      ],
    }).compile();

    controller = module.get<TagController>(TagController);
  });

  // ============================================================================
  // getAllTags
  // ============================================================================

  describe('getAllTags', () => {
    it('should return all tags with counts', async () => {
      // Arrange
      const mockTags = [
        { tag: 'ERROR', count: 10 },
        { tag: 'SUCCESS', count: 50 },
        { tag: 'SLOW', count: 5 },
      ];
      mockTagService.getAllTags.mockResolvedValue(mockTags);

      // Act
      const result = await controller.getAllTags();

      // Assert
      expect(result).toEqual({ data: mockTags });
      expect(mockTagService.getAllTags).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no tags exist', async () => {
      // Arrange
      mockTagService.getAllTags.mockResolvedValue([]);

      // Act
      const result = await controller.getAllTags();

      // Assert
      expect(result).toEqual({ data: [] });
    });
  });

  // ============================================================================
  // getEntriesByTags
  // ============================================================================

  describe('getEntriesByTags', () => {
    it('should find entries by single tag with default logic', async () => {
      // Arrange
      const mockEntries = [
        { id: 1, type: 'request', payload: {} },
        { id: 2, type: 'request', payload: {} },
      ];
      mockTagService.findByTags.mockResolvedValue(mockEntries as any);

      // Act
      const result = await controller.getEntriesByTags('ERROR', undefined, undefined);

      // Assert
      expect(result).toEqual({ data: mockEntries });
      expect(mockTagService.findByTags).toHaveBeenCalledWith(['ERROR'], 'OR', 50);
    });

    it('should find entries by multiple tags with AND logic', async () => {
      // Arrange
      const mockEntries = [{ id: 1, type: 'request', payload: {} }];
      mockTagService.findByTags.mockResolvedValue(mockEntries as any);

      // Act
      const result = await controller.getEntriesByTags('ERROR,SLOW', 'AND', undefined);

      // Assert
      expect(result).toEqual({ data: mockEntries });
      expect(mockTagService.findByTags).toHaveBeenCalledWith(['ERROR', 'SLOW'], 'AND', 50);
    });

    it('should find entries by multiple tags with OR logic', async () => {
      // Arrange
      const mockEntries = [
        { id: 1, type: 'request', payload: {} },
        { id: 2, type: 'exception', payload: {} },
      ];
      mockTagService.findByTags.mockResolvedValue(mockEntries as any);

      // Act
      const result = await controller.getEntriesByTags('ERROR,SLOW', 'OR', undefined);

      // Assert
      expect(result).toEqual({ data: mockEntries });
      expect(mockTagService.findByTags).toHaveBeenCalledWith(['ERROR', 'SLOW'], 'OR', 50);
    });

    it('should respect custom limit', async () => {
      // Arrange
      mockTagService.findByTags.mockResolvedValue([]);

      // Act
      await controller.getEntriesByTags('ERROR', undefined, '100');

      // Assert
      expect(mockTagService.findByTags).toHaveBeenCalledWith(['ERROR'], 'OR', 100);
    });

    it('should trim whitespace from tags', async () => {
      // Arrange
      mockTagService.findByTags.mockResolvedValue([]);

      // Act
      await controller.getEntriesByTags(' ERROR , SLOW ', undefined, undefined);

      // Assert
      expect(mockTagService.findByTags).toHaveBeenCalledWith(['ERROR', 'SLOW'], 'OR', 50);
    });

    it('should filter empty tags', async () => {
      // Arrange
      mockTagService.findByTags.mockResolvedValue([]);

      // Act
      await controller.getEntriesByTags('ERROR,,SLOW,', undefined, undefined);

      // Assert
      expect(mockTagService.findByTags).toHaveBeenCalledWith(['ERROR', 'SLOW'], 'OR', 50);
    });
  });

  // ============================================================================
  // getEntryTags
  // ============================================================================

  describe('getEntryTags', () => {
    it('should return tags for a specific entry', async () => {
      // Arrange
      const mockTags = ['ERROR', 'POST', '5XX'];
      mockTagService.getEntryTags.mockResolvedValue(mockTags);

      // Act
      const result = await controller.getEntryTags(123);

      // Assert
      expect(result).toEqual({ data: mockTags });
      expect(mockTagService.getEntryTags).toHaveBeenCalledWith(123);
    });

    it('should return empty array for entry with no tags', async () => {
      // Arrange
      mockTagService.getEntryTags.mockResolvedValue([]);

      // Act
      const result = await controller.getEntryTags(456);

      // Assert
      expect(result).toEqual({ data: [] });
    });
  });

  // ============================================================================
  // addTagsToEntry
  // ============================================================================

  describe('addTagsToEntry', () => {
    it('should add tags to an entry and return updated tags', async () => {
      // Arrange
      const updatedTags = ['ERROR', 'CUSTOM', 'NEW-TAG'];
      mockTagService.addTags.mockResolvedValue(undefined);
      mockTagService.getEntryTags.mockResolvedValue(updatedTags);

      // Act
      const result = await controller.addTagsToEntry(123, { tags: ['CUSTOM', 'NEW-TAG'] });

      // Assert
      expect(result).toEqual({ success: true, data: updatedTags });
      expect(mockTagService.addTags).toHaveBeenCalledWith(123, ['CUSTOM', 'NEW-TAG']);
      expect(mockTagService.getEntryTags).toHaveBeenCalledWith(123);
    });

    it('should add single tag', async () => {
      // Arrange
      mockTagService.addTags.mockResolvedValue(undefined);
      mockTagService.getEntryTags.mockResolvedValue(['SINGLE']);

      // Act
      const result = await controller.addTagsToEntry(1, { tags: ['SINGLE'] });

      // Assert
      expect(result).toEqual({ success: true, data: ['SINGLE'] });
      expect(mockTagService.addTags).toHaveBeenCalledWith(1, ['SINGLE']);
    });

    it('should handle adding multiple tags', async () => {
      // Arrange
      const tags = ['TAG1', 'TAG2', 'TAG3'];
      mockTagService.addTags.mockResolvedValue(undefined);
      mockTagService.getEntryTags.mockResolvedValue(tags);

      // Act
      const result = await controller.addTagsToEntry(1, { tags });

      // Assert
      expect(result.data).toEqual(tags);
    });
  });

  // ============================================================================
  // removeTagsFromEntry
  // ============================================================================

  describe('removeTagsFromEntry', () => {
    it('should remove tags from an entry and return remaining tags', async () => {
      // Arrange
      const remainingTags = ['ERROR'];
      mockTagService.removeTags.mockResolvedValue(undefined);
      mockTagService.getEntryTags.mockResolvedValue(remainingTags);

      // Act
      const result = await controller.removeTagsFromEntry(123, { tags: ['CUSTOM'] });

      // Assert
      expect(result).toEqual({ success: true, data: remainingTags });
      expect(mockTagService.removeTags).toHaveBeenCalledWith(123, ['CUSTOM']);
      expect(mockTagService.getEntryTags).toHaveBeenCalledWith(123);
    });

    it('should return empty array when all tags removed', async () => {
      // Arrange
      mockTagService.removeTags.mockResolvedValue(undefined);
      mockTagService.getEntryTags.mockResolvedValue([]);

      // Act
      const result = await controller.removeTagsFromEntry(1, { tags: ['ONLY-TAG'] });

      // Assert
      expect(result).toEqual({ success: true, data: [] });
    });
  });

  // ============================================================================
  // Monitored Tags
  // ============================================================================

  describe('getMonitoredTags', () => {
    it('should return all monitored tags with counts', async () => {
      // Arrange
      const mockMonitoredTags = [
        { id: 1, tag: 'PRODUCTION-ERROR', createdAt: '2024-01-01', count: 25 },
        { id: 2, tag: 'CRITICAL', createdAt: '2024-01-02', count: 5 },
      ];
      mockTagService.getMonitoredTagsWithCounts.mockResolvedValue(mockMonitoredTags as any);

      // Act
      const result = await controller.getMonitoredTags();

      // Assert
      expect(result).toEqual({ data: mockMonitoredTags });
      expect(mockTagService.getMonitoredTagsWithCounts).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no monitored tags', async () => {
      // Arrange
      mockTagService.getMonitoredTagsWithCounts.mockResolvedValue([]);

      // Act
      const result = await controller.getMonitoredTags();

      // Assert
      expect(result).toEqual({ data: [] });
    });
  });

  describe('addMonitoredTag', () => {
    it('should add a monitored tag', async () => {
      // Arrange
      const mockTag = { id: 1, tag: 'CRITICAL', createdAt: '2024-01-01T00:00:00Z' };
      mockTagService.addMonitoredTag.mockResolvedValue(mockTag as any);

      // Act
      const result = await controller.addMonitoredTag({ tag: 'CRITICAL' });

      // Assert
      expect(result).toEqual({ success: true, data: mockTag });
      expect(mockTagService.addMonitoredTag).toHaveBeenCalledWith('CRITICAL');
    });
  });

  describe('removeMonitoredTag', () => {
    it('should remove a monitored tag', async () => {
      // Arrange
      mockTagService.removeMonitoredTag.mockResolvedValue(undefined);

      // Act
      const result = await controller.removeMonitoredTag('CRITICAL');

      // Assert
      expect(result).toEqual({ success: true });
      expect(mockTagService.removeMonitoredTag).toHaveBeenCalledWith('CRITICAL');
    });

    it('should handle URL-encoded tag names', async () => {
      // Arrange
      mockTagService.removeMonitoredTag.mockResolvedValue(undefined);

      // Act
      const result = await controller.removeMonitoredTag('USER%3A123');

      // Assert
      expect(result).toEqual({ success: true });
      expect(mockTagService.removeMonitoredTag).toHaveBeenCalledWith('USER%3A123');
    });
  });
});
