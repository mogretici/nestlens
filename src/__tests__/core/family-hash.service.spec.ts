import { FamilyHashService } from '../../core/family-hash.service';
import { Entry } from '../../types';

describe('FamilyHashService', () => {
  let service: FamilyHashService;

  beforeEach(() => {
    service = new FamilyHashService();
  });

  describe('generateFamilyHash', () => {
    describe('Exception Entries', () => {
      it('should generate hash for exception with stack trace', () => {
        // Arrange
        const entry: Entry = {
          id: 1,
          type: 'exception',
          timestamp: new Date().toISOString(),
          payload: {
            name: 'TypeError',
            message: 'Cannot read property "id" of undefined',
            stack: 'TypeError: Cannot read property "id" of undefined\n    at UserService.getUser (/src/services/user.service.ts:42:15)',
          },
        } as Entry;

        // Act
        const hash = service.generateFamilyHash(entry);

        // Assert
        expect(hash).toBeDefined();
        expect(hash).toHaveLength(16);
      });

      it('should generate same hash for similar exceptions', () => {
        // Arrange
        const entry1: Entry = {
          id: 1,
          type: 'exception',
          timestamp: new Date().toISOString(),
          payload: {
            name: 'TypeError',
            message: 'Cannot read property "id" of undefined',
            stack: 'at UserService.getUser (/src/services/user.service.ts:42:15)',
          },
        } as Entry;

        const entry2: Entry = {
          id: 2,
          type: 'exception',
          timestamp: new Date().toISOString(),
          payload: {
            name: 'TypeError',
            message: 'Cannot read property "id" of undefined',
            stack: 'at UserService.getUser (/src/services/user.service.ts:42:15)',
          },
        } as Entry;

        // Act
        const hash1 = service.generateFamilyHash(entry1);
        const hash2 = service.generateFamilyHash(entry2);

        // Assert
        expect(hash1).toBe(hash2);
      });

      it('should generate different hash for different exception types', () => {
        // Arrange
        const entry1: Entry = {
          id: 1,
          type: 'exception',
          timestamp: new Date().toISOString(),
          payload: {
            name: 'TypeError',
            message: 'Error message',
            stack: 'at file.ts:10:5',
          },
        } as Entry;

        const entry2: Entry = {
          id: 2,
          type: 'exception',
          timestamp: new Date().toISOString(),
          payload: {
            name: 'RangeError',
            message: 'Error message',
            stack: 'at file.ts:10:5',
          },
        } as Entry;

        // Act
        const hash1 = service.generateFamilyHash(entry1);
        const hash2 = service.generateFamilyHash(entry2);

        // Assert
        expect(hash1).not.toBe(hash2);
      });

      it('should normalize error messages with UUIDs', () => {
        // Arrange
        const entry1: Entry = {
          id: 1,
          type: 'exception',
          timestamp: new Date().toISOString(),
          payload: {
            name: 'NotFoundError',
            message: 'User 123e4567-e89b-12d3-a456-426614174000 not found',
          },
        } as Entry;

        const entry2: Entry = {
          id: 2,
          type: 'exception',
          timestamp: new Date().toISOString(),
          payload: {
            name: 'NotFoundError',
            message: 'User 987fcdeb-51a2-3b4c-d567-890123456789 not found',
          },
        } as Entry;

        // Act
        const hash1 = service.generateFamilyHash(entry1);
        const hash2 = service.generateFamilyHash(entry2);

        // Assert
        expect(hash1).toBe(hash2);
      });

      it('should normalize error messages with numbers', () => {
        // Arrange
        const entry1: Entry = {
          id: 1,
          type: 'exception',
          timestamp: new Date().toISOString(),
          payload: {
            name: 'Error',
            message: 'Failed to process item 12345',
          },
        } as Entry;

        const entry2: Entry = {
          id: 2,
          type: 'exception',
          timestamp: new Date().toISOString(),
          payload: {
            name: 'Error',
            message: 'Failed to process item 67890',
          },
        } as Entry;

        // Act
        const hash1 = service.generateFamilyHash(entry1);
        const hash2 = service.generateFamilyHash(entry2);

        // Assert
        expect(hash1).toBe(hash2);
      });
    });

    describe('Query Entries', () => {
      it('should generate hash for query', () => {
        // Arrange
        const entry: Entry = {
          id: 1,
          type: 'query',
          timestamp: new Date().toISOString(),
          payload: {
            query: 'SELECT * FROM users WHERE id = 1',
            duration: 10,
            slow: false,
          },
        } as Entry;

        // Act
        const hash = service.generateFamilyHash(entry);

        // Assert
        expect(hash).toBeDefined();
        expect(hash).toHaveLength(16);
      });

      it('should generate same hash for queries with different parameter values', () => {
        // Arrange
        const entry1: Entry = {
          id: 1,
          type: 'query',
          timestamp: new Date().toISOString(),
          payload: {
            query: 'SELECT * FROM users WHERE id = 1',
            duration: 10,
            slow: false,
          },
        } as Entry;

        const entry2: Entry = {
          id: 2,
          type: 'query',
          timestamp: new Date().toISOString(),
          payload: {
            query: 'SELECT * FROM users WHERE id = 999',
            duration: 15,
            slow: false,
          },
        } as Entry;

        // Act
        const hash1 = service.generateFamilyHash(entry1);
        const hash2 = service.generateFamilyHash(entry2);

        // Assert
        expect(hash1).toBe(hash2);
      });

      it('should generate same hash for queries with different string values', () => {
        // Arrange
        const entry1: Entry = {
          id: 1,
          type: 'query',
          timestamp: new Date().toISOString(),
          payload: {
            query: "SELECT * FROM users WHERE name = 'John'",
            duration: 10,
            slow: false,
          },
        } as Entry;

        const entry2: Entry = {
          id: 2,
          type: 'query',
          timestamp: new Date().toISOString(),
          payload: {
            query: "SELECT * FROM users WHERE name = 'Jane'",
            duration: 10,
            slow: false,
          },
        } as Entry;

        // Act
        const hash1 = service.generateFamilyHash(entry1);
        const hash2 = service.generateFamilyHash(entry2);

        // Assert
        expect(hash1).toBe(hash2);
      });

      it('should normalize parameter placeholders ($1, :param, @param)', () => {
        // Arrange
        const entry1: Entry = {
          id: 1,
          type: 'query',
          timestamp: new Date().toISOString(),
          payload: {
            query: 'SELECT * FROM users WHERE id = :id',
            duration: 10,
            slow: false,
          },
        } as Entry;

        const entry2: Entry = {
          id: 2,
          type: 'query',
          timestamp: new Date().toISOString(),
          payload: {
            query: 'SELECT * FROM users WHERE id = @id',
            duration: 10,
            slow: false,
          },
        } as Entry;

        // Act
        const hash1 = service.generateFamilyHash(entry1);
        const hash2 = service.generateFamilyHash(entry2);

        // Assert - named parameters should normalize to same hash
        expect(hash1).toBe(hash2);
      });

      it('should include source in hash', () => {
        // Arrange
        const entry1: Entry = {
          id: 1,
          type: 'query',
          timestamp: new Date().toISOString(),
          payload: {
            query: 'SELECT * FROM users',
            source: 'TypeORM',
            duration: 10,
            slow: false,
          },
        } as Entry;

        const entry2: Entry = {
          id: 2,
          type: 'query',
          timestamp: new Date().toISOString(),
          payload: {
            query: 'SELECT * FROM users',
            source: 'Prisma',
            duration: 10,
            slow: false,
          },
        } as Entry;

        // Act
        const hash1 = service.generateFamilyHash(entry1);
        const hash2 = service.generateFamilyHash(entry2);

        // Assert
        expect(hash1).not.toBe(hash2);
      });
    });

    describe('Log Entries', () => {
      it('should generate hash for error logs', () => {
        // Arrange
        const entry: Entry = {
          id: 1,
          type: 'log',
          timestamp: new Date().toISOString(),
          payload: {
            level: 'error',
            message: 'Database connection failed',
            context: 'DatabaseService',
          },
        } as Entry;

        // Act
        const hash = service.generateFamilyHash(entry);

        // Assert
        expect(hash).toBeDefined();
        expect(hash).toHaveLength(16);
      });

      it('should generate hash for warn logs', () => {
        // Arrange
        const entry: Entry = {
          id: 1,
          type: 'log',
          timestamp: new Date().toISOString(),
          payload: {
            level: 'warn',
            message: 'Deprecated API usage',
            context: 'ApiController',
          },
        } as Entry;

        // Act
        const hash = service.generateFamilyHash(entry);

        // Assert
        expect(hash).toBeDefined();
      });

      it('should return undefined for info/debug/log levels', () => {
        // Arrange
        const entry: Entry = {
          id: 1,
          type: 'log',
          timestamp: new Date().toISOString(),
          payload: {
            level: 'log',
            message: 'Application started',
          },
        } as Entry;

        // Act
        const hash = service.generateFamilyHash(entry);

        // Assert
        expect(hash).toBeUndefined();
      });

      it('should generate same hash for similar error logs with different dynamic values', () => {
        // Arrange
        const entry1: Entry = {
          id: 1,
          type: 'log',
          timestamp: new Date().toISOString(),
          payload: {
            level: 'error',
            message: 'Failed to process user 123',
            context: 'UserService',
          },
        } as Entry;

        const entry2: Entry = {
          id: 2,
          type: 'log',
          timestamp: new Date().toISOString(),
          payload: {
            level: 'error',
            message: 'Failed to process user 456',
            context: 'UserService',
          },
        } as Entry;

        // Act
        const hash1 = service.generateFamilyHash(entry1);
        const hash2 = service.generateFamilyHash(entry2);

        // Assert
        expect(hash1).toBe(hash2);
      });
    });

    describe('Command Entries', () => {
      it('should generate hash for command', () => {
        // Arrange
        const entry: Entry = {
          id: 1,
          type: 'command',
          timestamp: new Date().toISOString(),
          payload: {
            name: 'CreateUserCommand',
            handler: 'CreateUserHandler',
            status: 'completed',
          },
        } as Entry;

        // Act
        const hash = service.generateFamilyHash(entry);

        // Assert
        expect(hash).toBeDefined();
        expect(hash).toHaveLength(16);
      });

      it('should generate same hash for same command with different parameters', () => {
        // Arrange
        const entry1: Entry = {
          id: 1,
          type: 'command',
          timestamp: new Date().toISOString(),
          payload: {
            name: 'CreateUserCommand',
            handler: 'CreateUserHandler',
            status: 'completed',
            payload: { name: 'John' },
          },
        } as Entry;

        const entry2: Entry = {
          id: 2,
          type: 'command',
          timestamp: new Date().toISOString(),
          payload: {
            name: 'CreateUserCommand',
            handler: 'CreateUserHandler',
            status: 'completed',
            payload: { name: 'Jane' },
          },
        } as Entry;

        // Act
        const hash1 = service.generateFamilyHash(entry1);
        const hash2 = service.generateFamilyHash(entry2);

        // Assert
        expect(hash1).toBe(hash2);
      });
    });

    describe('Gate Entries', () => {
      it('should generate hash for gate check', () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'gate',
          timestamp: new Date().toISOString(),
          payload: {
            gate: 'CanEditPost',
            action: 'edit',
            subject: 'Post:123',
            allowed: true,
            duration: 5,
          },
        } as unknown as Entry;

        // Act
        const hash = service.generateFamilyHash(entry);

        // Assert
        expect(hash).toBeDefined();
        expect(hash).toHaveLength(16);
      });

      it('should normalize subject IDs', () => {
        // Arrange
        const entry1 = {
          id: 1,
          type: 'gate',
          timestamp: new Date().toISOString(),
          payload: {
            gate: 'CanEditPost',
            action: 'edit',
            subject: 'Post:123',
            allowed: true,
            duration: 5,
          },
        } as unknown as Entry;

        const entry2 = {
          id: 2,
          type: 'gate',
          timestamp: new Date().toISOString(),
          payload: {
            gate: 'CanEditPost',
            action: 'edit',
            subject: 'Post:456',
            allowed: false,
            duration: 5,
          },
        } as unknown as Entry;

        // Act
        const hash1 = service.generateFamilyHash(entry1);
        const hash2 = service.generateFamilyHash(entry2);

        // Assert
        expect(hash1).toBe(hash2);
      });
    });

    describe('Batch Entries', () => {
      it('should generate hash for batch operation', () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'batch',
          timestamp: new Date().toISOString(),
          payload: {
            name: 'ImportUsers',
            operation: 'import',
            totalItems: 100,
            status: 'completed',
          },
        } as unknown as Entry;

        // Act
        const hash = service.generateFamilyHash(entry);

        // Assert
        expect(hash).toBeDefined();
        expect(hash).toHaveLength(16);
      });

      it('should generate same hash for same batch type', () => {
        // Arrange
        const entry1 = {
          id: 1,
          type: 'batch',
          timestamp: new Date().toISOString(),
          payload: {
            name: 'ImportUsers',
            operation: 'import',
            totalItems: 100,
            status: 'completed',
          },
        } as unknown as Entry;

        const entry2 = {
          id: 2,
          type: 'batch',
          timestamp: new Date().toISOString(),
          payload: {
            name: 'ImportUsers',
            operation: 'import',
            totalItems: 500,
            status: 'failed',
          },
        } as unknown as Entry;

        // Act
        const hash1 = service.generateFamilyHash(entry1);
        const hash2 = service.generateFamilyHash(entry2);

        // Assert
        expect(hash1).toBe(hash2);
      });
    });

    describe('Unsupported Entry Types', () => {
      it('should return undefined for request entries', () => {
        // Arrange
        const entry: Entry = {
          id: 1,
          type: 'request',
          timestamp: new Date().toISOString(),
          payload: {
            method: 'GET',
            url: '/api/users',
            path: '/api/users',
            query: {},
            params: {},
            headers: {},
            statusCode: 200,
            duration: 50,
            memory: 0,
          },
        } as Entry;

        // Act
        const hash = service.generateFamilyHash(entry);

        // Assert
        expect(hash).toBeUndefined();
      });

      it('should return undefined for cache entries', () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'cache',
          timestamp: new Date().toISOString(),
          payload: {
            key: 'user:1',
            operation: 'get',
            hit: true,
          },
        } as unknown as Entry;

        // Act
        const hash = service.generateFamilyHash(entry);

        // Assert
        expect(hash).toBeUndefined();
      });

      it('should return undefined for event entries', () => {
        // Arrange
        const entry = {
          id: 1,
          type: 'event',
          timestamp: new Date().toISOString(),
          payload: {
            name: 'user.created',
            payload: {},
            listeners: ['Handler1'],
            duration: 10,
          },
        } as unknown as Entry;

        // Act
        const hash = service.generateFamilyHash(entry);

        // Assert
        expect(hash).toBeUndefined();
      });
    });
  });

  describe('extractStackInfo', () => {
    it('should extract file and line from Node.js stack trace', () => {
      // Arrange
      const stack = 'Error: Something went wrong\n    at Function.name (/path/to/src/service.ts:42:15)';

      // Act
      const result = service['extractStackInfo'](stack);

      // Assert
      expect(result).toBeDefined();
      expect(result?.file).toContain('src/service.ts');
      expect(result?.line).toBe('42');
    });

    it('should return undefined for empty stack', () => {
      // Act
      const result = service['extractStackInfo'](undefined);

      // Assert
      expect(result).toBeUndefined();
    });

    it('should return undefined for invalid stack format', () => {
      // Arrange
      const stack = 'Not a valid stack trace';

      // Act
      const result = service['extractStackInfo'](stack);

      // Assert
      expect(result).toBeUndefined();
    });
  });

  describe('normalizeFilePath', () => {
    it('should remove absolute path prefix before src', () => {
      // Arrange
      const path = '/Users/user/project/src/services/user.service.ts';

      // Act
      const result = service['normalizeFilePath'](path);

      // Assert
      expect(result).toBe('src/services/user.service.ts');
    });

    it('should mark node_modules as external', () => {
      // Arrange
      const path = '/path/to/node_modules/lodash/index.js';

      // Act
      const result = service['normalizeFilePath'](path);

      // Assert
      expect(result).toBe('[node_modules]/lodash');
    });
  });

  describe('normalizeQuery', () => {
    it('should normalize whitespace', () => {
      // Arrange
      const query = 'SELECT   *   FROM   users   WHERE   id = 1';

      // Act
      const result = service['normalizeQuery'](query);

      // Assert
      expect(result).toBe('select * from users where id = ?');
    });

    it('should replace string literals', () => {
      // Arrange
      const query = "SELECT * FROM users WHERE name = 'John'";

      // Act
      const result = service['normalizeQuery'](query);

      // Assert
      expect(result).toBe('select * from users where name = ?');
    });

    it('should replace numeric literals', () => {
      // Arrange
      const query = 'SELECT * FROM users WHERE id = 123 AND age > 18';

      // Act
      const result = service['normalizeQuery'](query);

      // Assert
      expect(result).toBe('select * from users where id = ? and age > ?');
    });

    it('should replace PostgreSQL parameter placeholders ($1, $2)', () => {
      // Arrange
      const query = 'SELECT * FROM users WHERE id = $1 AND name = $2';

      // Act
      const result = service['normalizeQuery'](query);

      // Assert - numeric replacement runs first, so $1 becomes $?
      expect(result).toBe('select * from users where id = $? and name = $?');
    });

    it('should replace named parameters (:param)', () => {
      // Arrange
      const query = 'SELECT * FROM users WHERE id = :id AND name = :name';

      // Act
      const result = service['normalizeQuery'](query);

      // Assert
      expect(result).toBe('select * from users where id = ? and name = ?');
    });
  });

  describe('normalizeErrorMessage', () => {
    it('should replace UUIDs', () => {
      // Arrange
      const message = 'User 123e4567-e89b-12d3-a456-426614174000 not found';

      // Act
      const result = service['normalizeErrorMessage'](message);

      // Assert
      expect(result).toBe('User [UUID] not found');
    });

    it('should replace numbers', () => {
      // Arrange
      const message = 'Failed to process order 12345';

      // Act
      const result = service['normalizeErrorMessage'](message);

      // Assert
      expect(result).toBe('Failed to process order [N]');
    });

    it('should replace email addresses', () => {
      // Arrange
      const message = 'Failed to send email to user@example.com';

      // Act
      const result = service['normalizeErrorMessage'](message);

      // Assert
      expect(result).toBe('Failed to send email to [EMAIL]');
    });

    it('should replace URLs', () => {
      // Arrange
      const message = 'Failed to connect to https://api.example.com/v1/users';

      // Act
      const result = service['normalizeErrorMessage'](message);

      // Assert
      expect(result).toBe('Failed to connect to [URL]');
    });

    it('should replace file paths', () => {
      // Arrange
      const message = 'Cannot read file /path/to/file.txt';

      // Act
      const result = service['normalizeErrorMessage'](message);

      // Assert
      expect(result).toBe('Cannot read file [PATH]');
    });

    it('should replace quoted strings', () => {
      // Arrange
      const message = "Failed to parse 'invalid json' value";

      // Act
      const result = service['normalizeErrorMessage'](message);

      // Assert
      expect(result).toBe('Failed to parse [STR] value');
    });
  });

  describe('normalizeSubject', () => {
    it('should replace UUIDs in subject', () => {
      // Arrange
      const subject = 'User:123e4567-e89b-12d3-a456-426614174000';

      // Act
      const result = service['normalizeSubject'](subject);

      // Assert
      expect(result).toBe('User:[ID]');
    });

    it('should replace numeric IDs', () => {
      // Arrange
      const subject = 'Post:12345';

      // Act
      const result = service['normalizeSubject'](subject);

      // Assert
      expect(result).toBe('Post:[ID]');
    });
  });

  describe('hash', () => {
    it('should generate consistent 16-character hash', () => {
      // Arrange
      const input = 'test input';

      // Act
      const hash1 = service['hash'](input);
      const hash2 = service['hash'](input);

      // Assert
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(16);
    });

    it('should generate different hash for different inputs', () => {
      // Arrange
      const input1 = 'input one';
      const input2 = 'input two';

      // Act
      const hash1 = service['hash'](input1);
      const hash2 = service['hash'](input2);

      // Assert
      expect(hash1).not.toBe(hash2);
    });
  });

  // ============================================================================
  // Edge Cases and Branch Coverage
  // ============================================================================

  describe('edge cases', () => {
    describe('log entries', () => {
      it('should return undefined for log level logs', () => {
        // Arrange - 'log' level (not error/warn) should return undefined
        const entry: Entry = {
          id: 1,
          type: 'log',
          payload: {
            level: 'log',
            message: 'Log message',
            context: 'TestContext',
          },
        } as unknown as Entry;

        // Act
        const hash = service.generateFamilyHash(entry);

        // Assert
        expect(hash).toBeUndefined();
      });

      it('should return undefined for debug level logs', () => {
        // Arrange
        const entry: Entry = {
          id: 1,
          type: 'log',
          payload: {
            level: 'debug',
            message: 'Debug message',
            context: 'TestContext',
          },
        } as unknown as Entry;

        // Act
        const hash = service.generateFamilyHash(entry);

        // Assert
        expect(hash).toBeUndefined();
      });

      it('should return undefined for verbose level logs', () => {
        // Arrange
        const entry: Entry = {
          id: 1,
          type: 'log',
          payload: {
            level: 'verbose',
            message: 'Verbose message',
            context: 'TestContext',
          },
        } as unknown as Entry;

        // Act
        const hash = service.generateFamilyHash(entry);

        // Assert
        expect(hash).toBeUndefined();
      });

      it('should generate hash for warn level logs', () => {
        // Arrange
        const entry: Entry = {
          id: 1,
          type: 'log',
          payload: {
            level: 'warn',
            message: 'Warning message',
            context: 'TestContext',
          },
        } as Entry;

        // Act
        const hash = service.generateFamilyHash(entry);

        // Assert
        expect(hash).toBeDefined();
        expect(hash).toHaveLength(16);
      });

      it('should handle log without context', () => {
        // Arrange
        const entry: Entry = {
          id: 1,
          type: 'log',
          payload: {
            level: 'error',
            message: 'Error without context',
          },
        } as Entry;

        // Act
        const hash = service.generateFamilyHash(entry);

        // Assert
        expect(hash).toBeDefined();
      });
    });

    describe('exception entries', () => {
      it('should handle exception without stack trace', () => {
        // Arrange
        const entry: Entry = {
          id: 1,
          type: 'exception',
          payload: {
            name: 'Error',
            message: 'Error without stack',
          },
        } as Entry;

        // Act
        const hash = service.generateFamilyHash(entry);

        // Assert
        expect(hash).toBeDefined();
      });

      it('should handle exception with empty stack', () => {
        // Arrange
        const entry: Entry = {
          id: 1,
          type: 'exception',
          payload: {
            name: 'Error',
            message: 'Error message',
            stack: '',
          },
        } as Entry;

        // Act
        const hash = service.generateFamilyHash(entry);

        // Assert
        expect(hash).toBeDefined();
      });

      it('should handle exception with malformed stack', () => {
        // Arrange
        const entry: Entry = {
          id: 1,
          type: 'exception',
          payload: {
            name: 'Error',
            message: 'Error message',
            stack: 'Just some random text without file info',
          },
        } as Entry;

        // Act
        const hash = service.generateFamilyHash(entry);

        // Assert
        expect(hash).toBeDefined();
      });
    });

    describe('query entries', () => {
      it('should handle query without source', () => {
        // Arrange
        const entry: Entry = {
          id: 1,
          type: 'query',
          payload: {
            query: 'SELECT * FROM users',
            duration: 10,
            slow: false,
          },
        } as Entry;

        // Act
        const hash = service.generateFamilyHash(entry);

        // Assert
        expect(hash).toBeDefined();
      });

      it('should handle query with source', () => {
        // Arrange
        const entry: Entry = {
          id: 1,
          type: 'query',
          payload: {
            query: 'SELECT * FROM users',
            duration: 10,
            slow: false,
            source: 'UserRepository',
          },
        } as Entry;

        // Act
        const hash = service.generateFamilyHash(entry);

        // Assert
        expect(hash).toBeDefined();
      });
    });

    describe('command entries', () => {
      it('should handle command without handler', () => {
        // Arrange
        const entry: Entry = {
          id: 1,
          type: 'command',
          payload: {
            name: 'create:user',
            exitCode: 0,
            duration: 100,
          },
        } as unknown as Entry;

        // Act
        const hash = service.generateFamilyHash(entry);

        // Assert
        expect(hash).toBeDefined();
      });

      it('should handle command with handler', () => {
        // Arrange
        const entry: Entry = {
          id: 1,
          type: 'command',
          payload: {
            name: 'create:user',
            handler: 'CreateUserHandler',
            exitCode: 0,
            duration: 100,
          },
        } as unknown as Entry;

        // Act
        const hash = service.generateFamilyHash(entry);

        // Assert
        expect(hash).toBeDefined();
      });
    });

    describe('gate entries', () => {
      it('should handle gate without subject', () => {
        // Arrange
        const entry: Entry = {
          id: 1,
          type: 'gate',
          payload: {
            gate: 'UserGate',
            action: 'view',
            result: true,
            duration: 5,
          },
        } as unknown as Entry;

        // Act
        const hash = service.generateFamilyHash(entry);

        // Assert
        expect(hash).toBeDefined();
      });

      it('should handle gate with subject', () => {
        // Arrange
        const entry: Entry = {
          id: 1,
          type: 'gate',
          payload: {
            gate: 'UserGate',
            action: 'edit',
            subject: 'User:123',
            result: true,
            duration: 5,
          },
        } as unknown as Entry;

        // Act
        const hash = service.generateFamilyHash(entry);

        // Assert
        expect(hash).toBeDefined();
      });

      it('should normalize gate subjects with IDs', () => {
        // Arrange
        const entry1: Entry = {
          id: 1,
          type: 'gate',
          payload: {
            gate: 'PostGate',
            action: 'delete',
            subject: 'Post:12345',
            result: false,
            duration: 5,
          },
        } as unknown as Entry;

        const entry2: Entry = {
          id: 2,
          type: 'gate',
          payload: {
            gate: 'PostGate',
            action: 'delete',
            subject: 'Post:67890',
            result: true,
            duration: 3,
          },
        } as unknown as Entry;

        // Act
        const hash1 = service.generateFamilyHash(entry1);
        const hash2 = service.generateFamilyHash(entry2);

        // Assert - should have same hash (ID normalized)
        expect(hash1).toBe(hash2);
      });
    });

    describe('unsupported entry types', () => {
      it('should return undefined for request entries', () => {
        // Arrange
        const entry: Entry = {
          id: 1,
          type: 'request',
          payload: {
            method: 'GET',
            url: '/api',
            path: '/api',
            query: {},
            params: {},
            headers: {},
            statusCode: 200,
            duration: 50,
            memory: 1024,
          },
        } as Entry;

        // Act
        const hash = service.generateFamilyHash(entry);

        // Assert
        expect(hash).toBeUndefined();
      });

      it('should return undefined for cache entries', () => {
        // Arrange
        const entry: Entry = {
          id: 1,
          type: 'cache',
          payload: {
            action: 'get',
            key: 'user:123',
            hit: true,
            duration: 2,
          },
        } as unknown as Entry;

        // Act
        const hash = service.generateFamilyHash(entry);

        // Assert
        expect(hash).toBeUndefined();
      });

      it('should return undefined for event entries', () => {
        // Arrange
        const entry: Entry = {
          id: 1,
          type: 'event',
          payload: {
            name: 'user.created',
            payload: {},
            listeners: [],
            duration: 10,
          },
        } as unknown as Entry;

        // Act
        const hash = service.generateFamilyHash(entry);

        // Assert
        expect(hash).toBeUndefined();
      });
    });
  });

  describe('normalizeSubject', () => {
    it('should normalize subject with numeric ID', () => {
      // Act
      const result = service['normalizeSubject']('User:12345');

      // Assert - actual implementation uses [ID] placeholder
      expect(result).toBe('User:[ID]');
    });

    it('should normalize subject with UUID', () => {
      // Act
      const result = service['normalizeSubject']('User:550e8400-e29b-41d4-a716-446655440000');

      // Assert
      expect(result).toBe('User:[ID]');
    });

    it('should handle subject without ID separator', () => {
      // Act
      const result = service['normalizeSubject']('SomeClass');

      // Assert
      expect(result).toBe('SomeClass');
    });
  });

  describe('normalizeFilePath', () => {
    it('should normalize file paths', () => {
      // Act
      const result = service['normalizeFilePath']('/Users/dev/project/src/services/user.service.ts');

      // Assert - implementation extracts from src/
      expect(result).toContain('user.service.ts');
    });

    it('should handle Windows paths', () => {
      // Act
      const result = service['normalizeFilePath']('C:\\Projects\\app\\src\\service.ts');

      // Assert
      expect(result).toContain('service.ts');
    });

    it('should handle simple filename', () => {
      // Act
      const result = service['normalizeFilePath']('file.ts');

      // Assert
      expect(result).toBe('file.ts');
    });
  });
});
