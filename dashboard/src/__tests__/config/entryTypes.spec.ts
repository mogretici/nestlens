import { describe, it, expect } from 'vitest';
import {
  ENTRY_TYPES,
  getEntryConfig,
  getFilterConfig,
  getEntryUrlKeys,
  validateConfig,
  getEntryTypeConfig,
} from '../../config/entryTypes';

/**
 * Entry Types Configuration Tests
 *
 * Tests for configuration helpers and validation.
 * Following AAA pattern (Arrange-Act-Assert).
 */

describe('ENTRY_TYPES', () => {
  describe('Structure', () => {
    it('contains all 18 entry types', () => {
      // Arrange & Act
      const entryTypes = Object.keys(ENTRY_TYPES);

      // Assert
      expect(entryTypes).toContain('request');
      expect(entryTypes).toContain('query');
      expect(entryTypes).toContain('exception');
      expect(entryTypes).toContain('log');
      expect(entryTypes).toContain('event');
      expect(entryTypes).toContain('job');
      expect(entryTypes).toContain('schedule');
      expect(entryTypes).toContain('cache');
      expect(entryTypes).toContain('mail');
      expect(entryTypes).toContain('http-client');
      expect(entryTypes).toContain('redis');
      expect(entryTypes).toContain('model');
      expect(entryTypes).toContain('notification');
      expect(entryTypes).toContain('view');
      expect(entryTypes).toContain('command');
      expect(entryTypes).toContain('gate');
      expect(entryTypes).toContain('batch');
      expect(entryTypes).toContain('dump');
      expect(entryTypes).toContain('graphql');
      expect(entryTypes).toHaveLength(19);
    });

    it('each entry type has required properties', () => {
      // Arrange & Act & Assert
      for (const [typeName, config] of Object.entries(ENTRY_TYPES)) {
        expect(config.displayName, `${typeName} should have displayName`).toBeTruthy();
        expect(config.pluralName, `${typeName} should have pluralName`).toBeTruthy();
        expect(config.route, `${typeName} should have route`).toBeTruthy();
        expect(config.icon, `${typeName} should have icon`).toBeTruthy();
        expect(config.filters, `${typeName} should have filters`).toBeDefined();
      }
    });

    it('each filter has required properties', () => {
      // Arrange & Act & Assert
      for (const [typeName, typeConfig] of Object.entries(ENTRY_TYPES)) {
        for (const [filterName, filterConfig] of Object.entries(typeConfig.filters)) {
          expect(
            filterConfig.urlKey,
            `${typeName}.${filterName} should have urlKey`
          ).toBeTruthy();
          expect(
            filterConfig.displayName,
            `${typeName}.${filterName} should have displayName`
          ).toBeTruthy();
          expect(
            Array.isArray(filterConfig.values),
            `${typeName}.${filterName} values should be array`
          ).toBe(true);
        }
      }
    });
  });

  describe('Request Entry Type', () => {
    it('has correct filter configuration', () => {
      // Arrange
      const request = ENTRY_TYPES.request;

      // Assert
      expect(request.filters.methods.urlKey).toBe('methods');
      expect(request.filters.methods.values).toContain('GET');
      expect(request.filters.methods.values).toContain('POST');
      expect(request.filters.methods.values).toContain('GRAPHQL');

      expect(request.filters.statuses.urlKey).toBe('statuses');
      expect(request.filters.statuses.values).toHaveLength(0); // Dynamic

      expect(request.filters.paths).toBeDefined();
      expect(request.filters.controllers).toBeDefined();
      expect(request.filters.hostnames).toBeDefined();
      expect(request.filters.ips).toBeDefined();
    });
  });

  describe('Query Entry Type', () => {
    it('has correct filter configuration', () => {
      // Arrange
      const query = ENTRY_TYPES.query;

      // Assert
      expect(query.filters.types.urlKey).toBe('queryTypes');
      expect(query.filters.types.values).toContain('SELECT');
      expect(query.filters.types.values).toContain('INSERT');
      expect(query.filters.types.values).toContain('UPDATE');

      expect(query.filters.sources.urlKey).toBe('sources');
      expect(query.filters.sources.values).toContain('typeorm');
      expect(query.filters.sources.values).toContain('prisma');
    });
  });

  describe('Log Entry Type', () => {
    it('has all log levels', () => {
      // Arrange
      const log = ENTRY_TYPES.log;

      // Assert
      expect(log.filters.levels.values).toContain('log');
      expect(log.filters.levels.values).toContain('error');
      expect(log.filters.levels.values).toContain('warn');
      expect(log.filters.levels.values).toContain('debug');
      expect(log.filters.levels.values).toContain('verbose');
      expect(log.filters.levels.values).toContain('fatal');
      expect(log.filters.levels.values).toContain('info');
    });
  });

  describe('Job Entry Type', () => {
    it('has all job statuses', () => {
      // Arrange
      const job = ENTRY_TYPES.job;

      // Assert
      expect(job.filters.statuses.values).toContain('waiting');
      expect(job.filters.statuses.values).toContain('active');
      expect(job.filters.statuses.values).toContain('completed');
      expect(job.filters.statuses.values).toContain('failed');
      expect(job.filters.statuses.values).toContain('delayed');
    });
  });

  describe('Cache Entry Type', () => {
    it('has all cache operations', () => {
      // Arrange
      const cache = ENTRY_TYPES.cache;

      // Assert
      expect(cache.filters.operations.values).toContain('get');
      expect(cache.filters.operations.values).toContain('set');
      expect(cache.filters.operations.values).toContain('del');
      expect(cache.filters.operations.values).toContain('clear');
    });
  });

  describe('Gate Entry Type', () => {
    it('has allowed and denied results', () => {
      // Arrange
      const gate = ENTRY_TYPES.gate;

      // Assert
      expect(gate.filters.results.values).toContain('allowed');
      expect(gate.filters.results.values).toContain('denied');
      expect(gate.filters.results.values).toHaveLength(2);
    });
  });
});

describe('getEntryConfig', () => {
  describe('Direct Type Match', () => {
    it('returns config for valid entry type name', () => {
      // Arrange & Act
      const config = getEntryConfig('request');

      // Assert
      expect(config).toBeDefined();
      expect(config?.displayName).toBe('Request');
      expect(config?.route).toBe('requests');
    });

    it('returns config for hyphenated type name', () => {
      // Arrange & Act
      const config = getEntryConfig('http-client');

      // Assert
      expect(config).toBeDefined();
      expect(config?.displayName).toBe('HTTP Client');
    });
  });

  describe('Route Match', () => {
    it('returns config for valid route', () => {
      // Arrange & Act
      const config = getEntryConfig('requests');

      // Assert
      expect(config).toBeDefined();
      expect(config?.displayName).toBe('Request');
    });

    it('returns config for queries route', () => {
      // Arrange & Act
      const config = getEntryConfig('queries');

      // Assert
      expect(config).toBeDefined();
      expect(config?.displayName).toBe('Query');
    });

    it('returns config for exceptions route', () => {
      // Arrange & Act
      const config = getEntryConfig('exceptions');

      // Assert
      expect(config).toBeDefined();
      expect(config?.displayName).toBe('Exception');
    });
  });

  describe('Invalid Input', () => {
    it('returns undefined for unknown type', () => {
      // Arrange & Act
      const config = getEntryConfig('unknown');

      // Assert
      expect(config).toBeUndefined();
    });

    it('returns undefined for empty string', () => {
      // Arrange & Act
      const config = getEntryConfig('');

      // Assert
      expect(config).toBeUndefined();
    });
  });
});

describe('getFilterConfig', () => {
  describe('Valid Input', () => {
    it('returns filter config for valid route and category', () => {
      // Arrange & Act
      const config = getFilterConfig('requests', 'methods');

      // Assert
      expect(config).toBeDefined();
      expect(config?.urlKey).toBe('methods');
      expect(config?.displayName).toBe('Method');
    });

    it('returns filter config using type name', () => {
      // Arrange & Act
      const config = getFilterConfig('request', 'statuses');

      // Assert
      expect(config).toBeDefined();
      expect(config?.urlKey).toBe('statuses');
    });
  });

  describe('Invalid Input', () => {
    it('returns undefined for invalid route', () => {
      // Arrange & Act
      const config = getFilterConfig('invalid', 'methods');

      // Assert
      expect(config).toBeUndefined();
    });

    it('returns undefined for invalid category', () => {
      // Arrange & Act
      const config = getFilterConfig('requests', 'invalid');

      // Assert
      expect(config).toBeUndefined();
    });
  });
});

describe('getEntryUrlKeys', () => {
  describe('Valid Route', () => {
    it('returns URL keys for request type', () => {
      // Arrange & Act
      const keys = getEntryUrlKeys('requests');

      // Assert
      expect(keys).toContain('methods');
      expect(keys).toContain('statuses');
      expect(keys).toContain('paths');
      expect(keys).toContain('tags');
      expect(keys).toContain('search');
    });

    it('returns URL keys for query type', () => {
      // Arrange & Act
      const keys = getEntryUrlKeys('queries');

      // Assert
      expect(keys).toContain('queryTypes');
      expect(keys).toContain('sources');
      expect(keys).toContain('tags');
      expect(keys).toContain('search');
    });

    it('always includes tags and search', () => {
      // Arrange & Act
      const keys = getEntryUrlKeys('logs');

      // Assert
      expect(keys).toContain('tags');
      expect(keys).toContain('search');
    });
  });

  describe('Invalid Route', () => {
    it('returns only tags for invalid route', () => {
      // Arrange & Act
      const keys = getEntryUrlKeys('invalid');

      // Assert
      expect(keys).toEqual(['tags']);
    });
  });
});

describe('validateConfig', () => {
  it('returns empty array for valid config', () => {
    // Arrange & Act
    const errors = validateConfig();

    // Assert
    expect(errors).toEqual([]);
  });

  it('validates all entry types have required fields', () => {
    // This test verifies the validation logic works correctly
    // Since ENTRY_TYPES is valid, errors should be empty
    const errors = validateConfig();
    expect(errors).toHaveLength(0);
  });
});

describe('getEntryTypeConfig (alias)', () => {
  it('is an alias for getEntryConfig', () => {
    // Arrange & Act
    const config1 = getEntryConfig('request');
    const config2 = getEntryTypeConfig('request');

    // Assert
    expect(config1).toEqual(config2);
  });
});

describe('Type Safety', () => {
  it('ENTRY_TYPES is readonly (as const)', () => {
    // Arrange & Act & Assert
    // This is a compile-time check, but we can verify the structure exists
    expect(ENTRY_TYPES.request.filters.methods.values).toContain('GET');

    // Verify it's a tuple-like array (readonly)
    expect(Array.isArray(ENTRY_TYPES.request.filters.methods.values)).toBe(true);
  });

  it('filter values are readonly arrays', () => {
    // Arrange
    const methods = ENTRY_TYPES.request.filters.methods.values;

    // Assert - verify it behaves like an array
    expect(methods.includes('GET')).toBe(true);
    expect(methods.length).toBeGreaterThan(0);
  });
});

describe('Route Mapping', () => {
  const routeToTypeMapping: [string, string][] = [
    ['requests', 'Request'],
    ['queries', 'Query'],
    ['exceptions', 'Exception'],
    ['logs', 'Log'],
    ['events', 'Event'],
    ['jobs', 'Job'],
    ['schedule', 'Schedule'],
    ['cache', 'Cache'],
    ['mail', 'Mail'],
    ['http-client', 'HTTP Client'],
    ['redis', 'Redis'],
    ['models', 'Model'],
    ['notifications', 'Notification'],
    ['views', 'View'],
    ['commands', 'Command'],
    ['gates', 'Gate'],
    ['batches', 'Batch'],
    ['dumps', 'Dump'],
  ];

  it.each(routeToTypeMapping)('maps %s route to %s type', (route, expectedDisplayName) => {
    // Arrange & Act
    const config = getEntryConfig(route);

    // Assert
    expect(config?.displayName).toBe(expectedDisplayName);
  });
});
