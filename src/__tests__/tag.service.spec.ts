import { Test, TestingModule } from '@nestjs/testing';
import { TagService } from '../core/tag.service';
import { STORAGE, StorageInterface } from '../core/storage/storage.interface';
import {
  Entry,
  RequestEntry,
  QueryEntry,
  ExceptionEntry,
  LogEntry,
  JobEntry,
  CacheEntry,
  MailEntry,
} from '../types';

describe('TagService', () => {
  let service: TagService;
  let mockStorage: jest.Mocked<StorageInterface>;

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [TagService, { provide: STORAGE, useValue: mockStorage }],
    }).compile();

    service = module.get<TagService>(TagService);
  });

  describe('autoTag', () => {
    describe('request entries', () => {
      it('should add SUCCESS tag for 2xx status codes', async () => {
        const entry: RequestEntry = {
          id: 1,
          type: 'request',
          payload: {
            method: 'GET',
            url: '/api/users',
            path: '/api/users',
            query: {},
            params: {},
            headers: {},
            statusCode: 200,
            duration: 100,
            memory: 0,
          },
        };

        const tags = await service.autoTag(entry);

        expect(tags).toContain('SUCCESS');
        expect(tags).toContain('GET');
        expect(mockStorage.addTags).toHaveBeenCalledWith(
          1,
          expect.arrayContaining(['SUCCESS', 'GET']),
        );
      });

      it('should add 5XX and ERROR tags for 5xx status codes', async () => {
        const entry: RequestEntry = {
          id: 1,
          type: 'request',
          payload: {
            method: 'POST',
            url: '/api/users',
            path: '/api/users',
            query: {},
            params: {},
            headers: {},
            statusCode: 500,
            duration: 100,
            memory: 0,
          },
        };

        const tags = await service.autoTag(entry);

        expect(tags).toContain('ERROR');
        expect(tags).toContain('5XX');
      });

      it('should add 4XX and CLIENT-ERROR tags for 4xx status codes', async () => {
        const entry: RequestEntry = {
          id: 1,
          type: 'request',
          payload: {
            method: 'GET',
            url: '/api/users',
            path: '/api/users',
            query: {},
            params: {},
            headers: {},
            statusCode: 404,
            duration: 100,
            memory: 0,
          },
        };

        const tags = await service.autoTag(entry);

        expect(tags).toContain('CLIENT-ERROR');
        expect(tags).toContain('4XX');
      });

      it('should add SLOW tag for requests > 1000ms', async () => {
        const entry: RequestEntry = {
          id: 1,
          type: 'request',
          payload: {
            method: 'GET',
            url: '/api/users',
            path: '/api/users',
            query: {},
            params: {},
            headers: {},
            statusCode: 200,
            duration: 1500,
            memory: 0,
          },
        };

        const tags = await service.autoTag(entry);

        expect(tags).toContain('SLOW');
      });

      it('should add USER tag when user is present', async () => {
        const entry: RequestEntry = {
          id: 1,
          type: 'request',
          payload: {
            method: 'GET',
            url: '/api/users',
            path: '/api/users',
            query: {},
            params: {},
            headers: {},
            statusCode: 200,
            duration: 100,
            memory: 0,
            user: { id: 123, name: 'Test User' },
          },
        };

        const tags = await service.autoTag(entry);

        expect(tags).toContain('USER:123');
      });

      it('should not add method tag for GraphQL requests', async () => {
        const entry: RequestEntry = {
          id: 1,
          type: 'request',
          payload: {
            method: 'POST',
            url: '/graphql',
            path: '/graphql',
            query: {},
            params: {},
            headers: {},
            statusCode: 200,
            duration: 100,
            memory: 0,
          },
        };

        const tags = await service.autoTag(entry);

        expect(tags).not.toContain('POST');
      });
    });

    describe('query entries', () => {
      it('should add SLOW tag for slow queries', async () => {
        const entry: QueryEntry = {
          id: 1,
          type: 'query',
          payload: {
            query: 'SELECT * FROM users',
            duration: 150,
            slow: true,
            source: 'typeorm',
          },
        };

        const tags = await service.autoTag(entry);

        expect(tags).toContain('SLOW');
      });

      it('should add source tag', async () => {
        const entry: QueryEntry = {
          id: 1,
          type: 'query',
          payload: {
            query: 'SELECT * FROM users',
            duration: 50,
            slow: false,
            source: 'prisma',
          },
        };

        const tags = await service.autoTag(entry);

        expect(tags).toContain('PRISMA');
      });

      it('should detect SELECT queries', async () => {
        const entry: QueryEntry = {
          id: 1,
          type: 'query',
          payload: {
            query: 'SELECT * FROM users WHERE id = 1',
            duration: 50,
            slow: false,
          },
        };

        const tags = await service.autoTag(entry);

        expect(tags).toContain('SELECT');
      });

      it('should detect INSERT queries', async () => {
        const entry: QueryEntry = {
          id: 1,
          type: 'query',
          payload: {
            query: 'INSERT INTO users (name) VALUES ("test")',
            duration: 50,
            slow: false,
          },
        };

        const tags = await service.autoTag(entry);

        expect(tags).toContain('INSERT');
      });
    });

    describe('exception entries', () => {
      it('should add ERROR tag for all exceptions', async () => {
        const entry: ExceptionEntry = {
          id: 1,
          type: 'exception',
          payload: {
            name: 'TypeError',
            message: 'Cannot read property of undefined',
          },
        };

        const tags = await service.autoTag(entry);

        expect(tags).toContain('ERROR');
        expect(tags).toContain('TYPEERROR');
      });

      it('should not add exception name tag for generic Error', async () => {
        const entry: ExceptionEntry = {
          id: 1,
          type: 'exception',
          payload: {
            name: 'Error',
            message: 'Something went wrong',
          },
        };

        const tags = await service.autoTag(entry);

        // Should have ERROR tag (from exception) but not duplicate it as exception name
        expect(tags).toContain('ERROR');
        expect(tags.filter((t) => t === 'ERROR')).toHaveLength(1);
      });

      it('should add HTTP-ERROR tag for HTTP exceptions', async () => {
        const entry: ExceptionEntry = {
          id: 1,
          type: 'exception',
          payload: {
            name: 'BadRequestException',
            message: 'Invalid input',
          },
        };

        const tags = await service.autoTag(entry);

        expect(tags).toContain('HTTP-ERROR');
      });

      it('should add VALIDATION-ERROR tag for validation errors', async () => {
        const entry: ExceptionEntry = {
          id: 1,
          type: 'exception',
          payload: {
            name: 'ValidationError',
            message: 'Email is required',
          },
        };

        const tags = await service.autoTag(entry);

        expect(tags).toContain('VALIDATION-ERROR');
      });
    });

    describe('log entries', () => {
      it('should add level tag', async () => {
        const entry: LogEntry = {
          id: 1,
          type: 'log',
          payload: {
            level: 'error',
            message: 'Something failed',
            context: 'TestService',
          },
        };

        const tags = await service.autoTag(entry);

        expect(tags).toContain('ERROR');
        expect(tags).toContain('TESTSERVICE');
      });

      it('should add WARNING tag for warn level', async () => {
        const entry: LogEntry = {
          id: 1,
          type: 'log',
          payload: {
            level: 'warn',
            message: 'Deprecated function used',
          },
        };

        const tags = await service.autoTag(entry);

        expect(tags).toContain('WARN');
        expect(tags).toContain('WARNING');
      });
    });

    describe('job entries', () => {
      it('should add status and queue tags', async () => {
        const entry: JobEntry = {
          id: 1,
          type: 'job',
          payload: {
            name: 'email-job',
            queue: 'emails',
            data: {},
            status: 'completed',
            attempts: 1,
          },
        };

        const tags = await service.autoTag(entry);

        expect(tags).toContain('COMPLETED');
        expect(tags).toContain('EMAILS');
      });

      it('should add ERROR tag for failed jobs', async () => {
        const entry: JobEntry = {
          id: 1,
          type: 'job',
          payload: {
            name: 'email-job',
            queue: 'emails',
            data: {},
            status: 'failed',
            attempts: 3,
            error: 'SMTP error',
          },
        };

        const tags = await service.autoTag(entry);

        expect(tags).toContain('FAILED');
        expect(tags).toContain('ERROR');
      });
    });

    describe('cache entries', () => {
      it('should add operation tag', async () => {
        const entry: CacheEntry = {
          id: 1,
          type: 'cache',
          payload: {
            operation: 'get',
            key: 'user:123',
            hit: true,
            duration: 5,
          },
        };

        const tags = await service.autoTag(entry);

        expect(tags).toContain('GET');
        expect(tags).toContain('HIT');
      });

      it('should add MISS tag for cache misses', async () => {
        const entry: CacheEntry = {
          id: 1,
          type: 'cache',
          payload: {
            operation: 'get',
            key: 'user:123',
            hit: false,
            duration: 2,
          },
        };

        const tags = await service.autoTag(entry);

        expect(tags).toContain('MISS');
      });
    });

    describe('mail entries', () => {
      it('should add status and HTML tags', async () => {
        const entry: MailEntry = {
          id: 1,
          type: 'mail',
          payload: {
            to: 'test@example.com',
            subject: 'Welcome',
            html: '<h1>Hello</h1>',
            status: 'sent',
            duration: 100,
          },
        };

        const tags = await service.autoTag(entry);

        expect(tags).toContain('SENT');
        expect(tags).toContain('HTML');
      });

      it('should add BULK tag for multiple recipients', async () => {
        const entry: MailEntry = {
          id: 1,
          type: 'mail',
          payload: {
            to: ['user1@example.com', 'user2@example.com'],
            subject: 'Newsletter',
            status: 'sent',
            duration: 200,
          },
        };

        const tags = await service.autoTag(entry);

        expect(tags).toContain('BULK');
      });

      it('should add ERROR tag for failed mails', async () => {
        const entry: MailEntry = {
          id: 1,
          type: 'mail',
          payload: {
            to: 'test@example.com',
            subject: 'Test',
            status: 'failed',
            error: 'SMTP connection failed',
            duration: 5000,
          },
        };

        const tags = await service.autoTag(entry);

        expect(tags).toContain('FAILED');
        expect(tags).toContain('ERROR');
      });
    });

    it('should not call addTags if entry has no ID', async () => {
      const entry: LogEntry = {
        type: 'log',
        payload: {
          level: 'log',
          message: 'Test message',
        },
      };

      await service.autoTag(entry);

      expect(mockStorage.addTags).not.toHaveBeenCalled();
    });
  });

  describe('tag management', () => {
    it('should add tags to an entry', async () => {
      await service.addTags(1, ['custom', 'important']);

      expect(mockStorage.addTags).toHaveBeenCalledWith(1, ['custom', 'important']);
    });

    it('should remove tags from an entry', async () => {
      await service.removeTags(1, ['custom']);

      expect(mockStorage.removeTags).toHaveBeenCalledWith(1, ['custom']);
    });

    it('should get tags for an entry', async () => {
      mockStorage.getEntryTags.mockResolvedValue(['tag1', 'tag2']);

      const tags = await service.getEntryTags(1);

      expect(tags).toEqual(['tag1', 'tag2']);
    });

    it('should get all tags with counts', async () => {
      mockStorage.getAllTags.mockResolvedValue([
        { tag: 'ERROR', count: 10 },
        { tag: 'SUCCESS', count: 100 },
      ]);

      const tags = await service.getAllTags();

      expect(tags).toHaveLength(2);
      expect(tags[0].count).toBe(10);
    });
  });

  describe('monitored tags', () => {
    it('should add a monitored tag', async () => {
      const monitoredTag = { id: 1, tag: 'CRITICAL', createdAt: new Date().toISOString() };
      mockStorage.addMonitoredTag.mockResolvedValue(monitoredTag);

      const result = await service.addMonitoredTag('CRITICAL');

      expect(result).toEqual(monitoredTag);
    });

    it('should remove a monitored tag', async () => {
      await service.removeMonitoredTag('CRITICAL');

      expect(mockStorage.removeMonitoredTag).toHaveBeenCalledWith('CRITICAL');
    });

    it('should get monitored tags with counts', async () => {
      mockStorage.getMonitoredTags.mockResolvedValue([
        { id: 1, tag: 'ERROR', createdAt: new Date().toISOString() },
      ]);
      mockStorage.getAllTags.mockResolvedValue([{ tag: 'ERROR', count: 50 }]);

      const result = await service.getMonitoredTagsWithCounts();

      expect(result).toHaveLength(1);
      expect(result[0].count).toBe(50);
    });
  });
});
