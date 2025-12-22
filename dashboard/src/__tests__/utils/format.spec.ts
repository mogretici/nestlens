/**
 * Format Utility Tests
 *
 * Comprehensive tests for all formatting functions.
 */
import { describe, it, expect } from 'vitest';
import {
  formatMs,
  formatMsHuman,
  formatInterval,
  normalizeFilterForUrl,
  formatFilterForDisplay,
  filterMatches,
  filtersInclude,
  formatFilterForServer,
  formatFiltersForServer,
} from '../../utils/format';

// ============================================================================
// formatMs Tests
// ============================================================================

describe('formatMs', () => {
  describe('Milliseconds (< 1 second)', () => {
    it('formats 0ms', () => {
      expect(formatMs(0)).toBe('0ms');
    });

    it('formats 1ms', () => {
      expect(formatMs(1)).toBe('1ms');
    });

    it('formats 500ms', () => {
      expect(formatMs(500)).toBe('500ms');
    });

    it('formats 999ms (boundary)', () => {
      expect(formatMs(999)).toBe('999ms');
    });
  });

  describe('Seconds', () => {
    it('formats exactly 1 second', () => {
      expect(formatMs(1000)).toBe('1s');
    });

    it('formats 30 seconds', () => {
      expect(formatMs(30000)).toBe('30s');
    });

    it('formats 59 seconds', () => {
      expect(formatMs(59000)).toBe('59s');
    });
  });

  describe('Minutes', () => {
    it('formats exactly 1 minute', () => {
      expect(formatMs(60000)).toBe('1m');
    });

    it('formats 1 minute 30 seconds', () => {
      expect(formatMs(90000)).toBe('1m 30s');
    });

    it('formats 30 minutes', () => {
      expect(formatMs(1800000)).toBe('30m');
    });

    it('formats 59 minutes', () => {
      expect(formatMs(3540000)).toBe('59m');
    });
  });

  describe('Hours', () => {
    it('formats exactly 1 hour', () => {
      expect(formatMs(3600000)).toBe('1h');
    });

    it('formats 1 hour 30 minutes', () => {
      expect(formatMs(5400000)).toBe('1h 30m');
    });

    it('formats 12 hours', () => {
      expect(formatMs(43200000)).toBe('12h');
    });

    it('formats 23 hours 59 minutes', () => {
      expect(formatMs(86340000)).toBe('23h 59m');
    });
  });

  describe('Days', () => {
    it('formats exactly 1 day', () => {
      expect(formatMs(86400000)).toBe('1d');
    });

    it('formats 1 day 12 hours', () => {
      expect(formatMs(129600000)).toBe('1d 12h');
    });

    it('formats 7 days', () => {
      expect(formatMs(604800000)).toBe('7d');
    });

    it('formats 30 days', () => {
      expect(formatMs(2592000000)).toBe('30d');
    });
  });
});

// ============================================================================
// formatMsHuman Tests
// ============================================================================

describe('formatMsHuman', () => {
  it('returns null for 0ms', () => {
    expect(formatMsHuman(0)).toBeNull();
  });

  it('returns null for 500ms', () => {
    expect(formatMsHuman(500)).toBeNull();
  });

  it('returns null for 999ms (boundary)', () => {
    expect(formatMsHuman(999)).toBeNull();
  });

  it('returns formatted string for exactly 1000ms', () => {
    expect(formatMsHuman(1000)).toBe('1s');
  });

  it('returns formatted string for 1001ms', () => {
    expect(formatMsHuman(1001)).toBe('1s');
  });

  it('returns formatted string for large values', () => {
    expect(formatMsHuman(3600000)).toBe('1h');
  });
});

// ============================================================================
// formatInterval Tests
// ============================================================================

describe('formatInterval', () => {
  it('formats 1 second interval', () => {
    expect(formatInterval(1000)).toBe('Every 1s');
  });

  it('formats 1 minute interval', () => {
    expect(formatInterval(60000)).toBe('Every 1m');
  });

  it('formats 30 minute interval', () => {
    expect(formatInterval(1800000)).toBe('Every 30m');
  });

  it('formats 1 hour interval', () => {
    expect(formatInterval(3600000)).toBe('Every 1h');
  });

  it('formats complex interval', () => {
    expect(formatInterval(5400000)).toBe('Every 1h 30m');
  });
});

// ============================================================================
// normalizeFilterForUrl Tests
// ============================================================================

describe('normalizeFilterForUrl', () => {
  describe('Without category', () => {
    it('converts to lowercase by default', () => {
      expect(normalizeFilterForUrl('GET')).toBe('get');
    });

    it('keeps lowercase as-is', () => {
      expect(normalizeFilterForUrl('error')).toBe('error');
    });

    it('handles mixed case', () => {
      expect(normalizeFilterForUrl('UserController')).toBe('usercontroller');
    });
  });

  describe('Uppercase categories', () => {
    it('methods: stores lowercase', () => {
      expect(normalizeFilterForUrl('GET', 'methods')).toBe('get');
      expect(normalizeFilterForUrl('post', 'methods')).toBe('post');
    });

    it('types: stores lowercase', () => {
      expect(normalizeFilterForUrl('SELECT', 'types')).toBe('select');
    });

    it('tags: stores lowercase', () => {
      expect(normalizeFilterForUrl('SLOW', 'tags')).toBe('slow');
    });
  });

  describe('Lowercase categories', () => {
    it('levels: stores lowercase', () => {
      expect(normalizeFilterForUrl('ERROR', 'levels')).toBe('error');
    });

    it('sources: stores lowercase', () => {
      expect(normalizeFilterForUrl('TypeORM', 'sources')).toBe('typeorm');
    });

    it('operations: stores lowercase', () => {
      expect(normalizeFilterForUrl('GET', 'operations')).toBe('get');
    });

    it('queues: stores lowercase', () => {
      expect(normalizeFilterForUrl('Default', 'queues')).toBe('default');
    });
  });

  describe('Preserve categories', () => {
    it('statuses: preserves case', () => {
      expect(normalizeFilterForUrl('200', 'statuses')).toBe('200');
      expect(normalizeFilterForUrl('sent', 'statuses')).toBe('sent');
    });

    it('names: preserves case', () => {
      expect(normalizeFilterForUrl('TypeError', 'names')).toBe('TypeError');
    });

    it('controllers: preserves case', () => {
      expect(normalizeFilterForUrl('UserController#show', 'controllers')).toBe('UserController#show');
    });

    it('hostnames: preserves case', () => {
      expect(normalizeFilterForUrl('localhost:3000', 'hostnames')).toBe('localhost:3000');
    });

    it('paths: preserves case', () => {
      expect(normalizeFilterForUrl('/api/Users', 'paths')).toBe('/api/Users');
    });

    it('contexts: preserves case', () => {
      expect(normalizeFilterForUrl('AppController', 'contexts')).toBe('AppController');
    });
  });
});

// ============================================================================
// formatFilterForDisplay Tests
// ============================================================================

describe('formatFilterForDisplay', () => {
  describe('Uppercase categories', () => {
    it('methods: displays uppercase', () => {
      expect(formatFilterForDisplay('get', 'methods')).toBe('GET');
      expect(formatFilterForDisplay('POST', 'methods')).toBe('POST');
    });

    it('types: displays uppercase', () => {
      expect(formatFilterForDisplay('select', 'types')).toBe('SELECT');
    });

    it('tags: displays uppercase', () => {
      expect(formatFilterForDisplay('slow', 'tags')).toBe('SLOW');
    });
  });

  describe('Lowercase categories', () => {
    it('levels: displays lowercase', () => {
      expect(formatFilterForDisplay('ERROR', 'levels')).toBe('error');
      expect(formatFilterForDisplay('warn', 'levels')).toBe('warn');
    });

    it('sources: displays lowercase', () => {
      expect(formatFilterForDisplay('TypeORM', 'sources')).toBe('typeorm');
    });

    it('operations: displays lowercase', () => {
      expect(formatFilterForDisplay('GET', 'operations')).toBe('get');
    });

    it('queues: displays lowercase', () => {
      expect(formatFilterForDisplay('Default', 'queues')).toBe('default');
    });
  });

  describe('Preserve categories', () => {
    it('statuses: preserves case', () => {
      expect(formatFilterForDisplay('200', 'statuses')).toBe('200');
      expect(formatFilterForDisplay('Sent', 'statuses')).toBe('Sent');
    });

    it('names: preserves case', () => {
      expect(formatFilterForDisplay('TypeError', 'names')).toBe('TypeError');
    });

    it('controllers: preserves case', () => {
      expect(formatFilterForDisplay('UserController', 'controllers')).toBe('UserController');
    });
  });

  describe('Unknown categories', () => {
    it('unknown category defaults to preserve', () => {
      expect(formatFilterForDisplay('MixedCase', 'unknown')).toBe('MixedCase');
    });
  });
});

// ============================================================================
// filterMatches Tests
// ============================================================================

describe('filterMatches', () => {
  it('matches identical strings', () => {
    expect(filterMatches('GET', 'GET')).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(filterMatches('GET', 'get')).toBe(true);
    expect(filterMatches('get', 'GET')).toBe(true);
  });

  it('matches mixed case', () => {
    expect(filterMatches('Get', 'gET')).toBe(true);
  });

  it('does not match different strings', () => {
    expect(filterMatches('GET', 'POST')).toBe(false);
  });

  it('handles empty strings', () => {
    expect(filterMatches('', '')).toBe(true);
    expect(filterMatches('GET', '')).toBe(false);
  });

  it('handles special characters', () => {
    expect(filterMatches('user@test.com', 'USER@TEST.COM')).toBe(true);
  });
});

// ============================================================================
// filtersInclude Tests
// ============================================================================

describe('filtersInclude', () => {
  it('finds value in array', () => {
    expect(filtersInclude(['GET', 'POST'], 'GET')).toBe(true);
  });

  it('finds value case-insensitively', () => {
    expect(filtersInclude(['GET', 'POST'], 'get')).toBe(true);
    expect(filtersInclude(['get', 'post'], 'GET')).toBe(true);
  });

  it('returns false for missing value', () => {
    expect(filtersInclude(['GET', 'POST'], 'DELETE')).toBe(false);
  });

  it('handles empty array', () => {
    expect(filtersInclude([], 'GET')).toBe(false);
  });

  it('handles empty value', () => {
    expect(filtersInclude(['', 'GET'], '')).toBe(true);
  });

  it('finds value at different positions', () => {
    const arr = ['GET', 'POST', 'PUT', 'DELETE'];
    expect(filtersInclude(arr, 'get')).toBe(true);     // first
    expect(filtersInclude(arr, 'post')).toBe(true);    // middle
    expect(filtersInclude(arr, 'delete')).toBe(true);  // last
  });
});

// ============================================================================
// formatFilterForServer Tests
// ============================================================================

describe('formatFilterForServer', () => {
  describe('Uppercase categories', () => {
    it('methods: sends uppercase', () => {
      expect(formatFilterForServer('get', 'methods')).toBe('GET');
    });

    it('types: sends uppercase', () => {
      expect(formatFilterForServer('select', 'types')).toBe('SELECT');
    });

    it('tags: sends uppercase', () => {
      expect(formatFilterForServer('slow', 'tags')).toBe('SLOW');
    });
  });

  describe('Lowercase categories', () => {
    it('levels: sends lowercase', () => {
      expect(formatFilterForServer('ERROR', 'levels')).toBe('error');
    });

    it('sources: sends lowercase', () => {
      expect(formatFilterForServer('TypeORM', 'sources')).toBe('typeorm');
    });

    it('operations: sends lowercase', () => {
      expect(formatFilterForServer('SET', 'operations')).toBe('set');
    });
  });

  describe('Preserve categories', () => {
    it('statuses: preserves case', () => {
      expect(formatFilterForServer('200', 'statuses')).toBe('200');
    });

    it('names: preserves case', () => {
      expect(formatFilterForServer('ValidationError', 'names')).toBe('ValidationError');
    });
  });
});

// ============================================================================
// formatFiltersForServer Tests
// ============================================================================

describe('formatFiltersForServer', () => {
  it('formats array of values', () => {
    const result = formatFiltersForServer(['get', 'post'], 'methods');
    expect(result).toEqual(['GET', 'POST']);
  });

  it('handles empty array', () => {
    const result = formatFiltersForServer([], 'methods');
    expect(result).toEqual([]);
  });

  it('handles single element', () => {
    const result = formatFiltersForServer(['error'], 'levels');
    expect(result).toEqual(['error']);
  });

  it('handles mixed case array', () => {
    const result = formatFiltersForServer(['Error', 'WARN', 'debug'], 'levels');
    expect(result).toEqual(['error', 'warn', 'debug']);
  });

  it('preserves case for preserve categories', () => {
    const result = formatFiltersForServer(['TypeError', 'ValidationError'], 'names');
    expect(result).toEqual(['TypeError', 'ValidationError']);
  });
});
