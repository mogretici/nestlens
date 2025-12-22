import { Test, TestingModule } from '@nestjs/testing';
import { TagService } from '../../core/tag.service';
import { STORAGE, StorageInterface } from '../../core/storage/storage.interface';
import { Entry, MonitoredTag, TagWithCount } from '../../types';

describe('TagService', () => {
  let service: TagService;
  let mockStorage: jest.Mocked<StorageInterface>;

  beforeEach(async () => {
    // Arrange
    mockStorage = {
      addTags: jest.fn(),
      removeTags: jest.fn(),
      getEntryTags: jest.fn(),
      getAllTags: jest.fn(),
      findByTags: jest.fn(),
      addMonitoredTag: jest.fn(),
      removeMonitoredTag: jest.fn(),
      getMonitoredTags: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TagService,
        { provide: STORAGE, useValue: mockStorage },
      ],
    }).compile();

    service = module.get<TagService>(TagService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('autoTag', () => {
    describe('Request Tags', () => {
      it('should add ERROR and 5XX tags for 500+ status', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'request' as const,
          payload: { statusCode: 500, method: 'GET', path: '/test' },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('ERROR');
        expect(tags).toContain('5XX');
        expect(mockStorage.addTags).toHaveBeenCalledWith(1, expect.arrayContaining(['ERROR', '5XX']));
      });

      it('should add CLIENT-ERROR and 4XX tags for 400+ status', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'request' as const,
          payload: { statusCode: 404, method: 'GET', path: '/test' },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('CLIENT-ERROR');
        expect(tags).toContain('4XX');
      });

      it('should add REDIRECT and 3XX tags for 300+ status', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'request' as const,
          payload: { statusCode: 301, method: 'GET', path: '/test' },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('REDIRECT');
        expect(tags).toContain('3XX');
      });

      it('should add SUCCESS tag for 200+ status', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'request' as const,
          payload: { statusCode: 200, method: 'GET', path: '/test' },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('SUCCESS');
      });

      it('should add USER tag when user.id exists', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'request' as const,
          payload: { statusCode: 200, method: 'GET', path: '/test', user: { id: 'user-123' } },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('USER:user-123');
      });

      it('should add HTTP method tag for non-GraphQL requests', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'request' as const,
          payload: { statusCode: 200, method: 'POST', path: '/api/users' },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('POST');
      });

      it('should NOT add method tag for GraphQL requests', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'request' as const,
          payload: { statusCode: 200, method: 'POST', path: '/graphql' },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).not.toContain('POST');
      });

      it('should add SLOW tag for requests > 1000ms', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'request' as const,
          payload: { statusCode: 200, method: 'GET', path: '/test', duration: 1500 },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('SLOW');
      });

      it('should include custom tags from payload', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'request' as const,
          payload: { statusCode: 200, method: 'GET', path: '/test', tags: ['important', 'debug'] },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('IMPORTANT');
        expect(tags).toContain('DEBUG');
      });
    });

    describe('Query Tags', () => {
      it('should add SLOW tag for slow queries', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'query' as const,
          payload: { query: 'SELECT * FROM users', slow: true, duration: 1000 },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('SLOW');
      });

      it('should add source tag', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'query' as const,
          payload: { query: 'SELECT * FROM users', slow: false, duration: 10, source: 'TypeORM' },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('TYPEORM');
      });

      it('should detect SELECT query', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'query' as const,
          payload: { query: 'SELECT * FROM users', slow: false, duration: 10 },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('SELECT');
      });

      it('should detect INSERT query', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'query' as const,
          payload: { query: 'INSERT INTO users VALUES (1)', slow: false, duration: 10 },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('INSERT');
      });

      it('should detect UPDATE query', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'query' as const,
          payload: { query: 'UPDATE users SET name = ?', slow: false, duration: 10 },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('UPDATE');
      });

      it('should detect DELETE query', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'query' as const,
          payload: { query: 'DELETE FROM users WHERE id = 1', slow: false, duration: 10 },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('DELETE');
      });
    });

    describe('Exception Tags', () => {
      it('should add ERROR tag', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'exception' as const,
          payload: { name: 'Error', message: 'Something went wrong' },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('ERROR');
      });

      it('should add exception type tag when not generic Error', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'exception' as const,
          payload: { name: 'TypeError', message: 'Cannot read property' },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('TYPEERROR');
      });

      it('should NOT add exception name tag for generic Error', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'exception' as const,
          payload: { name: 'Error', message: 'Generic error' },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        // ERROR tag is added for all exceptions, but 'ERROR' as exception name should not be duplicated
        expect(tags).toContain('ERROR'); // This is the standard exception tag
        expect(tags.filter(t => t === 'ERROR')).toHaveLength(1); // Should only appear once
      });

      it('should add HTTP-ERROR tag for HTTP exceptions', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'exception' as const,
          payload: { name: 'HttpException', message: 'Not found' },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('HTTP-ERROR');
      });

      it('should add VALIDATION-ERROR tag for validation errors', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'exception' as const,
          payload: { name: 'ValidationError', message: 'Invalid input' },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('VALIDATION-ERROR');
      });
    });

    describe('Log Tags', () => {
      it('should add level tag', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'log' as const,
          payload: { level: 'warn', message: 'Warning message' },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('WARN');
      });

      it('should add ERROR tag for error level', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'log' as const,
          payload: { level: 'error', message: 'Error message' },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('ERROR');
      });

      it('should add WARNING tag for warn level', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'log' as const,
          payload: { level: 'warn', message: 'Warning message' },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('WARNING');
      });

      it('should add context tag', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'log' as const,
          payload: { level: 'log', message: 'Message', context: 'UserService' },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('USERSERVICE');
      });
    });

    describe('Job Tags', () => {
      it('should add status tag', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'job' as const,
          payload: { name: 'SendEmail', status: 'completed' },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('COMPLETED');
      });

      it('should add queue tag', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'job' as const,
          payload: { name: 'SendEmail', status: 'active', queue: 'email-queue' },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('EMAIL-QUEUE');
      });

      it('should add ERROR tag for failed jobs', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'job' as const,
          payload: { name: 'SendEmail', status: 'failed' },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('ERROR');
        expect(tags).toContain('FAILED');
      });
    });

    describe('Cache Tags', () => {
      it('should add operation tag', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'cache' as const,
          payload: { key: 'user:1', operation: 'set' },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('SET');
      });

      it('should add HIT tag for cache hit', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'cache' as const,
          payload: { key: 'user:1', operation: 'get', hit: true },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('HIT');
      });

      it('should add MISS tag for cache miss', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'cache' as const,
          payload: { key: 'user:1', operation: 'get', hit: false },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('MISS');
      });
    });

    describe('Event Tags', () => {
      it('should add event name tag', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'event' as const,
          payload: { name: 'user.created', listeners: ['Handler1'] },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('USER.CREATED');
      });

      it('should add MULTI-LISTENER tag for multiple listeners', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'event' as const,
          payload: { name: 'user.created', listeners: ['Handler1', 'Handler2'] },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('MULTI-LISTENER');
      });

      it('should add SLOW tag for slow events', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'event' as const,
          payload: { name: 'user.created', payload: {}, listeners: [], duration: 150 },
        } as unknown as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('SLOW');
      });
    });

    describe('Schedule Tags', () => {
      it('should add status tag', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'schedule' as const,
          payload: { name: 'CleanupTask', status: 'completed' },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('COMPLETED');
      });

      it('should add CRON tag for cron schedules', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'schedule' as const,
          payload: { name: 'CleanupTask', status: 'completed', cron: '0 * * * *' },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('CRON');
      });

      it('should add INTERVAL tag for interval schedules', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'schedule' as const,
          payload: { name: 'HealthCheck', status: 'started', interval: 60000 },
        } as unknown as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('INTERVAL');
      });
    });

    describe('Mail Tags', () => {
      it('should add status tag', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'mail' as const,
          payload: { to: 'user@example.com', subject: 'Test', status: 'sent' },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('SENT');
      });

      it('should add BULK tag for multiple recipients', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'mail' as const,
          payload: { to: ['user1@example.com', 'user2@example.com'], subject: 'Test', status: 'sent' },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('BULK');
      });

      it('should add HTML tag for HTML emails', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'mail' as const,
          payload: { to: 'user@example.com', subject: 'Test', status: 'sent', html: '<p>Hello</p>' },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('HTML');
      });
    });

    describe('HTTP Client Tags', () => {
      it('should add method tag', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'http-client' as const,
          payload: { method: 'POST', url: 'https://api.example.com/users', statusCode: 201 },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('POST');
      });

      it('should add hostname tag', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'http-client' as const,
          payload: { method: 'GET', url: 'https://api.example.com', hostname: 'api.example.com', statusCode: 200 },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('API.EXAMPLE.COM');
      });
    });

    describe('Redis Tags', () => {
      it('should add command tag', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'redis' as const,
          payload: { command: 'SET', args: ['user:1', 'value'], duration: 5, status: 'success' },
        } as unknown as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('SET');
      });

      it('should add ERROR tag for errors', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'redis' as const,
          payload: { command: 'GET', args: ['user:1'], status: 'error', duration: 5 },
        } as unknown as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('ERROR');
      });

      it('should add SLOW tag for slow commands', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'redis' as const,
          payload: { command: 'GET', args: ['user:1'], duration: 150, status: 'success' },
        } as unknown as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('SLOW');
      });
    });

    describe('Model Tags', () => {
      it('should add entity tag', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'model' as const,
          payload: { entity: 'User', action: 'create', duration: 10 },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('USER');
      });

      it('should add action tag', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'model' as const,
          payload: { entity: 'User', action: 'update', duration: 10 },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('UPDATE');
      });

      it('should add BULK tag for multiple records', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'model' as const,
          payload: { entity: 'User', action: 'find', recordCount: 100, duration: 10 },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('BULK');
      });
    });

    describe('Notification Tags', () => {
      it('should add type tag', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'notification' as const,
          payload: { type: 'email', status: 'sent', recipient: 'user@example.com' },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('EMAIL');
      });

      it('should add BULK tag for multiple recipients', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'notification' as const,
          payload: { type: 'push', status: 'sent', recipient: ['user1', 'user2'] },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('BULK');
      });
    });

    describe('View Tags', () => {
      it('should add template name tag', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'view' as const,
          payload: { template: 'users/profile.html', format: 'html', duration: 10 },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('USERS.PROFILE');
      });

      it('should add format tag', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'view' as const,
          payload: { template: 'report', format: 'pdf', duration: 100 },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('PDF');
      });

      it('should add CACHED tag for cache hits', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'view' as const,
          payload: { template: 'home', format: 'html', cacheHit: true, duration: 1 },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('CACHED');
      });
    });

    describe('Command Tags', () => {
      it('should add command name tag', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'command' as const,
          payload: { name: 'CreateUser', status: 'completed' },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('CREATEUSER');
      });

      it('should add SLOW tag for slow commands', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'command' as const,
          payload: { name: 'CreateUser', status: 'completed', duration: 1500 },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('SLOW');
      });
    });

    describe('Gate Tags', () => {
      it('should add ALLOWED tag when allowed', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'gate' as const,
          payload: { gate: 'CanEdit', action: 'edit', allowed: true },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('ALLOWED');
      });

      it('should add DENIED tag when denied', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'gate' as const,
          payload: { gate: 'CanDelete', action: 'delete', allowed: false },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('DENIED');
      });

      it('should add gate name tag', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'gate' as const,
          payload: { gate: 'CanEdit', action: 'edit', allowed: true },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('CANEDIT');
      });
    });

    describe('Batch Tags', () => {
      it('should add status tag', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'batch' as const,
          payload: { name: 'ImportUsers', status: 'completed', totalItems: 100, failedItems: 0 },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('COMPLETED');
      });

      it('should add LARGE tag for batches > 1000 items', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'batch' as const,
          payload: { name: 'ImportUsers', status: 'completed', totalItems: 5000, failedItems: 0 },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('LARGE');
      });

      it('should add ERROR tag when failedItems > 0', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'batch' as const,
          payload: { name: 'ImportUsers', status: 'partial', totalItems: 100, failedItems: 5 },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('ERROR');
      });
    });

    describe('Dump Tags', () => {
      it('should add operation tag', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'dump' as const,
          payload: { operation: 'export', format: 'sql', status: 'completed' },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('EXPORT');
      });

      it('should add format tag', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'dump' as const,
          payload: { operation: 'backup', format: 'json', status: 'completed' },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('JSON');
      });

      it('should add COMPRESSED tag', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'dump' as const,
          payload: { operation: 'backup', format: 'sql', compressed: true, status: 'completed' },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('COMPRESSED');
      });

      it('should add ENCRYPTED tag', async () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'dump' as const,
          payload: { operation: 'backup', format: 'sql', encrypted: true, status: 'completed' },
        } as Entry;

        // Act
        const tags = await service.autoTag(entry);

        // Assert
        expect(tags).toContain('ENCRYPTED');
      });
    });

    describe('Entry without ID', () => {
      it('should not call storage.addTags when entry has no id', async () => {
        // Arrange
        const entry = {
          type: 'request' as const,
          payload: { statusCode: 200, method: 'GET', path: '/test' },
        } as Entry;

        // Act
        await service.autoTag(entry);

        // Assert
        expect(mockStorage.addTags).not.toHaveBeenCalled();
      });
    });
  });

  describe('Tag Management', () => {
    describe('addTags', () => {
      it('should call storage.addTags', async () => {
        // Act
        await service.addTags(1, ['tag1', 'tag2']);

        // Assert
        expect(mockStorage.addTags).toHaveBeenCalledWith(1, ['tag1', 'tag2']);
      });
    });

    describe('removeTags', () => {
      it('should call storage.removeTags', async () => {
        // Act
        await service.removeTags(1, ['tag1']);

        // Assert
        expect(mockStorage.removeTags).toHaveBeenCalledWith(1, ['tag1']);
      });
    });

    describe('getEntryTags', () => {
      it('should return tags from storage', async () => {
        // Arrange
        mockStorage.getEntryTags.mockResolvedValue(['ERROR', 'SLOW']);

        // Act
        const result = await service.getEntryTags(1);

        // Assert
        expect(result).toEqual(['ERROR', 'SLOW']);
        expect(mockStorage.getEntryTags).toHaveBeenCalledWith(1);
      });
    });

    describe('getAllTags', () => {
      it('should return all tags with counts', async () => {
        // Arrange
        const tags: TagWithCount[] = [
          { tag: 'ERROR', count: 50 },
          { tag: 'SUCCESS', count: 100 },
        ];
        mockStorage.getAllTags.mockResolvedValue(tags);

        // Act
        const result = await service.getAllTags();

        // Assert
        expect(result).toEqual(tags);
      });
    });

    describe('findByTags', () => {
      it('should call storage.findByTags with default params', async () => {
        // Arrange
        mockStorage.findByTags.mockResolvedValue([]);

        // Act
        await service.findByTags(['ERROR']);

        // Assert
        expect(mockStorage.findByTags).toHaveBeenCalledWith(['ERROR'], 'OR', 50);
      });

      it('should pass custom logic and limit', async () => {
        // Arrange
        mockStorage.findByTags.mockResolvedValue([]);

        // Act
        await service.findByTags(['ERROR', 'SLOW'], 'AND', 100);

        // Assert
        expect(mockStorage.findByTags).toHaveBeenCalledWith(['ERROR', 'SLOW'], 'AND', 100);
      });
    });
  });

  describe('Monitored Tags', () => {
    describe('addMonitoredTag', () => {
      it('should call storage.addMonitoredTag', async () => {
        // Arrange
        const monitoredTag: MonitoredTag = { id: 1, tag: 'CRITICAL', createdAt: new Date().toISOString() };
        mockStorage.addMonitoredTag.mockResolvedValue(monitoredTag);

        // Act
        const result = await service.addMonitoredTag('CRITICAL');

        // Assert
        expect(mockStorage.addMonitoredTag).toHaveBeenCalledWith('CRITICAL');
        expect(result).toEqual(monitoredTag);
      });
    });

    describe('removeMonitoredTag', () => {
      it('should call storage.removeMonitoredTag', async () => {
        // Act
        await service.removeMonitoredTag('CRITICAL');

        // Assert
        expect(mockStorage.removeMonitoredTag).toHaveBeenCalledWith('CRITICAL');
      });
    });

    describe('getMonitoredTags', () => {
      it('should return monitored tags from storage', async () => {
        // Arrange
        const tags: MonitoredTag[] = [
          { id: 1, tag: 'CRITICAL', createdAt: new Date().toISOString() },
          { id: 2, tag: 'ERROR', createdAt: new Date().toISOString() },
        ];
        mockStorage.getMonitoredTags.mockResolvedValue(tags);

        // Act
        const result = await service.getMonitoredTags();

        // Assert
        expect(result).toEqual(tags);
      });
    });

    describe('getMonitoredTagsWithCounts', () => {
      it('should merge monitored tags with counts', async () => {
        // Arrange
        const monitoredTags: MonitoredTag[] = [
          { id: 1, tag: 'CRITICAL', createdAt: '2024-01-01' },
          { id: 2, tag: 'ERROR', createdAt: '2024-01-02' },
        ];
        const allTags: TagWithCount[] = [
          { tag: 'CRITICAL', count: 10 },
          { tag: 'ERROR', count: 50 },
          { tag: 'SUCCESS', count: 100 },
        ];
        mockStorage.getMonitoredTags.mockResolvedValue(monitoredTags);
        mockStorage.getAllTags.mockResolvedValue(allTags);

        // Act
        const result = await service.getMonitoredTagsWithCounts();

        // Assert
        expect(result).toEqual([
          { id: 1, tag: 'CRITICAL', createdAt: '2024-01-01', count: 10 },
          { id: 2, tag: 'ERROR', createdAt: '2024-01-02', count: 50 },
        ]);
      });

      it('should return 0 count for tags not found in allTags', async () => {
        // Arrange
        const monitoredTags: MonitoredTag[] = [
          { id: 1, tag: 'NEWTYPE', createdAt: '2024-01-01' },
        ];
        mockStorage.getMonitoredTags.mockResolvedValue(monitoredTags);
        mockStorage.getAllTags.mockResolvedValue([]);

        // Act
        const result = await service.getMonitoredTagsWithCounts();

        // Assert
        expect(result).toEqual([
          { id: 1, tag: 'NEWTYPE', createdAt: '2024-01-01', count: 0 },
        ]);
      });
    });
  });
});
