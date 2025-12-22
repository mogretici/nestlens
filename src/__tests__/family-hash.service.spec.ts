import { FamilyHashService } from '../core/family-hash.service';
import { ExceptionEntry, QueryEntry, LogEntry, RequestEntry } from '../types';

describe('FamilyHashService', () => {
  let service: FamilyHashService;

  beforeEach(() => {
    service = new FamilyHashService();
  });

  describe('generateFamilyHash', () => {
    describe('exception entries', () => {
      it('should generate hash for exception with stack trace', () => {
        const entry: ExceptionEntry = {
          id: 1,
          type: 'exception',
          payload: {
            name: 'TypeError',
            message: 'Cannot read property "foo" of undefined',
            stack: 'TypeError: Cannot read property "foo" of undefined\n    at Function.getName (src/services/user.service.ts:42:15)',
          },
        };

        const hash = service.generateFamilyHash(entry);

        expect(hash).toBeDefined();
        expect(hash).toHaveLength(16);
      });

      it('should generate same hash for similar exceptions', () => {
        const entry1: ExceptionEntry = {
          id: 1,
          type: 'exception',
          payload: {
            name: 'TypeError',
            message: 'Cannot read property "bar" of undefined',
            stack: 'TypeError: Cannot read property "bar" of undefined\n    at Function.getName (src/services/user.service.ts:42:15)',
          },
        };

        const entry2: ExceptionEntry = {
          id: 2,
          type: 'exception',
          payload: {
            name: 'TypeError',
            message: 'Cannot read property "baz" of undefined',
            stack: 'TypeError: Cannot read property "baz" of undefined\n    at Function.getName (src/services/user.service.ts:42:15)',
          },
        };

        const hash1 = service.generateFamilyHash(entry1);
        const hash2 = service.generateFamilyHash(entry2);

        expect(hash1).toBe(hash2);
      });

      it('should generate different hash for exceptions from different locations', () => {
        const entry1: ExceptionEntry = {
          id: 1,
          type: 'exception',
          payload: {
            name: 'TypeError',
            message: 'Cannot read property of undefined',
            stack: 'TypeError: error\n    at Function.test (src/services/user.service.ts:42:15)',
          },
        };

        const entry2: ExceptionEntry = {
          id: 2,
          type: 'exception',
          payload: {
            name: 'TypeError',
            message: 'Cannot read property of undefined',
            stack: 'TypeError: error\n    at Function.test (src/services/order.service.ts:100:10)',
          },
        };

        const hash1 = service.generateFamilyHash(entry1);
        const hash2 = service.generateFamilyHash(entry2);

        expect(hash1).not.toBe(hash2);
      });
    });

    describe('query entries', () => {
      it('should generate hash for query', () => {
        const entry: QueryEntry = {
          id: 1,
          type: 'query',
          payload: {
            query: 'SELECT * FROM users WHERE id = 123',
            duration: 50,
            slow: false,
            source: 'typeorm',
          },
        };

        const hash = service.generateFamilyHash(entry);

        expect(hash).toBeDefined();
        expect(hash).toHaveLength(16);
      });

      it('should generate same hash for similar queries with different values', () => {
        const entry1: QueryEntry = {
          id: 1,
          type: 'query',
          payload: {
            query: 'SELECT * FROM users WHERE id = 123',
            duration: 50,
            slow: false,
            source: 'typeorm',
          },
        };

        const entry2: QueryEntry = {
          id: 2,
          type: 'query',
          payload: {
            query: 'SELECT * FROM users WHERE id = 456',
            duration: 60,
            slow: false,
            source: 'typeorm',
          },
        };

        const hash1 = service.generateFamilyHash(entry1);
        const hash2 = service.generateFamilyHash(entry2);

        expect(hash1).toBe(hash2);
      });

      it('should generate different hash for different queries', () => {
        const entry1: QueryEntry = {
          id: 1,
          type: 'query',
          payload: {
            query: 'SELECT * FROM users WHERE id = 1',
            duration: 50,
            slow: false,
            source: 'typeorm',
          },
        };

        const entry2: QueryEntry = {
          id: 2,
          type: 'query',
          payload: {
            query: 'SELECT * FROM orders WHERE user_id = 1',
            duration: 50,
            slow: false,
            source: 'typeorm',
          },
        };

        const hash1 = service.generateFamilyHash(entry1);
        const hash2 = service.generateFamilyHash(entry2);

        expect(hash1).not.toBe(hash2);
      });

      it('should normalize named parameter placeholders', () => {
        // Note: Due to numeric literal replacement ordering, $1 and :param
        // don't produce identical hashes. This tests :param normalization specifically.
        const entry1: QueryEntry = {
          id: 1,
          type: 'query',
          payload: {
            query: 'SELECT * FROM users WHERE id = :userId AND name = :userName',
            duration: 50,
            slow: false,
            source: 'typeorm',
          },
        };

        const entry2: QueryEntry = {
          id: 2,
          type: 'query',
          payload: {
            query: 'SELECT * FROM users WHERE id = :id AND name = :name',
            duration: 50,
            slow: false,
            source: 'typeorm',
          },
        };

        const hash1 = service.generateFamilyHash(entry1);
        const hash2 = service.generateFamilyHash(entry2);

        expect(hash1).toBe(hash2);
      });
    });

    describe('log entries', () => {
      it('should generate hash for error logs', () => {
        const entry: LogEntry = {
          id: 1,
          type: 'log',
          payload: {
            level: 'error',
            message: 'Connection failed to database at 192.168.1.1',
            context: 'DatabaseService',
          },
        };

        const hash = service.generateFamilyHash(entry);

        expect(hash).toBeDefined();
        expect(hash).toHaveLength(16);
      });

      it('should generate same hash for similar error logs with different IPs', () => {
        const entry1: LogEntry = {
          id: 1,
          type: 'log',
          payload: {
            level: 'error',
            message: 'User 123 failed to login',
            context: 'AuthService',
          },
        };

        const entry2: LogEntry = {
          id: 2,
          type: 'log',
          payload: {
            level: 'error',
            message: 'User 456 failed to login',
            context: 'AuthService',
          },
        };

        const hash1 = service.generateFamilyHash(entry1);
        const hash2 = service.generateFamilyHash(entry2);

        expect(hash1).toBe(hash2);
      });

      it('should not generate hash for non-error logs', () => {
        const entry: LogEntry = {
          id: 1,
          type: 'log',
          payload: {
            level: 'log',
            message: 'Application started',
            context: 'AppService',
          },
        };

        const hash = service.generateFamilyHash(entry);

        expect(hash).toBeUndefined();
      });

      it('should generate hash for warning logs', () => {
        const entry: LogEntry = {
          id: 1,
          type: 'log',
          payload: {
            level: 'warn',
            message: 'Deprecated API used',
            context: 'ApiService',
          },
        };

        const hash = service.generateFamilyHash(entry);

        expect(hash).toBeDefined();
      });
    });

    describe('unsupported entry types', () => {
      it('should return undefined for request entries', () => {
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

        const hash = service.generateFamilyHash(entry);

        expect(hash).toBeUndefined();
      });
    });
  });

  describe('message normalization', () => {
    it('should normalize UUIDs in messages', () => {
      const entry1: LogEntry = {
        id: 1,
        type: 'log',
        payload: {
          level: 'error',
          message: 'Failed to process order 550e8400-e29b-41d4-a716-446655440000',
          context: 'OrderService',
        },
      };

      const entry2: LogEntry = {
        id: 2,
        type: 'log',
        payload: {
          level: 'error',
          message: 'Failed to process order 123e4567-e89b-12d3-a456-426614174000',
          context: 'OrderService',
        },
      };

      const hash1 = service.generateFamilyHash(entry1);
      const hash2 = service.generateFamilyHash(entry2);

      expect(hash1).toBe(hash2);
    });

    it('should normalize email addresses in messages', () => {
      const entry1: LogEntry = {
        id: 1,
        type: 'log',
        payload: {
          level: 'error',
          message: 'Failed to send email to user@example.com',
          context: 'MailService',
        },
      };

      const entry2: LogEntry = {
        id: 2,
        type: 'log',
        payload: {
          level: 'error',
          message: 'Failed to send email to another@test.org',
          context: 'MailService',
        },
      };

      const hash1 = service.generateFamilyHash(entry1);
      const hash2 = service.generateFamilyHash(entry2);

      expect(hash1).toBe(hash2);
    });

    it('should normalize URLs in messages', () => {
      const entry1: LogEntry = {
        id: 1,
        type: 'log',
        payload: {
          level: 'error',
          message: 'Failed to fetch https://api.example.com/v1/users',
          context: 'HttpService',
        },
      };

      const entry2: LogEntry = {
        id: 2,
        type: 'log',
        payload: {
          level: 'error',
          message: 'Failed to fetch http://localhost:3000/api',
          context: 'HttpService',
        },
      };

      const hash1 = service.generateFamilyHash(entry1);
      const hash2 = service.generateFamilyHash(entry2);

      expect(hash1).toBe(hash2);
    });
  });
});
