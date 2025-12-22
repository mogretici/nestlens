/**
 * HTTP Constants Tests
 *
 * Tests for HTTP method and status pattern constants.
 */
import { describe, it, expect } from 'vitest';
import { HTTP_METHODS, STATUS_PATTERNS, HttpMethod, StatusPattern } from '../../constants/http';

describe('HTTP Constants', () => {
  describe('HTTP_METHODS', () => {
    it('contains all 7 standard HTTP methods', () => {
      expect(HTTP_METHODS).toHaveLength(7);
    });

    it('includes GET method', () => {
      expect(HTTP_METHODS).toContain('GET');
    });

    it('includes POST method', () => {
      expect(HTTP_METHODS).toContain('POST');
    });

    it('includes PUT method', () => {
      expect(HTTP_METHODS).toContain('PUT');
    });

    it('includes PATCH method', () => {
      expect(HTTP_METHODS).toContain('PATCH');
    });

    it('includes DELETE method', () => {
      expect(HTTP_METHODS).toContain('DELETE');
    });

    it('includes HEAD method', () => {
      expect(HTTP_METHODS).toContain('HEAD');
    });

    it('includes OPTIONS method', () => {
      expect(HTTP_METHODS).toContain('OPTIONS');
    });

    it('methods are in expected order', () => {
      expect(HTTP_METHODS).toEqual([
        'GET',
        'POST',
        'PUT',
        'PATCH',
        'DELETE',
        'HEAD',
        'OPTIONS',
      ]);
    });

    it('is defined as a const array', () => {
      // TypeScript `as const` ensures readonly at compile time
      // At runtime, we verify it's an array with expected length
      expect(Array.isArray(HTTP_METHODS)).toBe(true);
      expect(HTTP_METHODS.length).toBeGreaterThan(0);
    });
  });

  describe('STATUS_PATTERNS', () => {
    it('contains all 8 status patterns', () => {
      expect(STATUS_PATTERNS).toHaveLength(8);
    });

    it('includes 2XX pattern', () => {
      expect(STATUS_PATTERNS).toContain('2XX');
    });

    it('includes 3XX pattern', () => {
      expect(STATUS_PATTERNS).toContain('3XX');
    });

    it('includes 4XX pattern', () => {
      expect(STATUS_PATTERNS).toContain('4XX');
    });

    it('includes 5XX pattern', () => {
      expect(STATUS_PATTERNS).toContain('5XX');
    });

    it('includes SUCCESS pattern', () => {
      expect(STATUS_PATTERNS).toContain('SUCCESS');
    });

    it('includes ERROR pattern', () => {
      expect(STATUS_PATTERNS).toContain('ERROR');
    });

    it('includes CLIENT-ERROR pattern', () => {
      expect(STATUS_PATTERNS).toContain('CLIENT-ERROR');
    });

    it('includes REDIRECT pattern', () => {
      expect(STATUS_PATTERNS).toContain('REDIRECT');
    });

    it('patterns are in expected order', () => {
      expect(STATUS_PATTERNS).toEqual([
        '2XX',
        '3XX',
        '4XX',
        '5XX',
        'SUCCESS',
        'ERROR',
        'CLIENT-ERROR',
        'REDIRECT',
      ]);
    });

    it('is defined as a const array', () => {
      // TypeScript `as const` ensures readonly at compile time
      expect(Array.isArray(STATUS_PATTERNS)).toBe(true);
      expect(STATUS_PATTERNS.length).toBeGreaterThan(0);
    });
  });

  describe('Type Safety', () => {
    it('HttpMethod type accepts valid methods', () => {
      const method: HttpMethod = 'GET';
      expect(HTTP_METHODS).toContain(method);
    });

    it('StatusPattern type accepts valid patterns', () => {
      const pattern: StatusPattern = '2XX';
      expect(STATUS_PATTERNS).toContain(pattern);
    });

    it('all HTTP_METHODS values are valid HttpMethod type', () => {
      HTTP_METHODS.forEach((method) => {
        const typed: HttpMethod = method;
        expect(typed).toBe(method);
      });
    });

    it('all STATUS_PATTERNS values are valid StatusPattern type', () => {
      STATUS_PATTERNS.forEach((pattern) => {
        const typed: StatusPattern = pattern;
        expect(typed).toBe(pattern);
      });
    });
  });
});
