/**
 * Date Utility Tests
 *
 * Tests for parseDate function that handles date parsing from backend.
 */
import { describe, it, expect } from 'vitest';
import { parseDate } from '../../utils/date';

describe('parseDate', () => {
  describe('ISO Format', () => {
    it('parses ISO format with Z suffix', () => {
      const result = parseDate('2025-12-17T18:29:37Z');

      expect(result).toBeInstanceOf(Date);
      expect(result.toISOString()).toBe('2025-12-17T18:29:37.000Z');
    });

    it('parses ISO format with positive timezone offset', () => {
      const result = parseDate('2025-12-17T18:29:37+00:00');

      expect(result).toBeInstanceOf(Date);
      expect(result.getUTCFullYear()).toBe(2025);
      expect(result.getUTCMonth()).toBe(11); // December is 11
      expect(result.getUTCDate()).toBe(17);
    });

    it('parses ISO format with timezone offset (+03:00)', () => {
      const result = parseDate('2025-12-17T21:29:37+03:00');

      expect(result).toBeInstanceOf(Date);
      // 21:29:37+03:00 = 18:29:37 UTC
      expect(result.getUTCHours()).toBe(18);
    });

    it('parses ISO format with milliseconds', () => {
      const result = parseDate('2025-12-17T18:29:37.123Z');

      expect(result).toBeInstanceOf(Date);
      expect(result.getUTCMilliseconds()).toBe(123);
    });
  });

  describe('Backend Format', () => {
    it('parses backend format (YYYY-MM-DD HH:mm:ss)', () => {
      const result = parseDate('2025-12-17 18:29:37');

      expect(result).toBeInstanceOf(Date);
      expect(result.getUTCFullYear()).toBe(2025);
      expect(result.getUTCMonth()).toBe(11);
      expect(result.getUTCDate()).toBe(17);
      expect(result.getUTCHours()).toBe(18);
      expect(result.getUTCMinutes()).toBe(29);
      expect(result.getUTCSeconds()).toBe(37);
    });

    it('treats backend format as UTC', () => {
      const result = parseDate('2025-12-17 00:00:00');

      expect(result.toISOString()).toBe('2025-12-17T00:00:00.000Z');
    });

    it('handles single-digit hours in backend format', () => {
      const result = parseDate('2025-01-05 09:05:03');

      expect(result.getUTCHours()).toBe(9);
      expect(result.getUTCMinutes()).toBe(5);
      expect(result.getUTCSeconds()).toBe(3);
    });
  });

  describe('Edge Cases', () => {
    it('handles leap year date (Feb 29)', () => {
      const result = parseDate('2024-02-29 12:00:00');

      expect(result.getUTCDate()).toBe(29);
      expect(result.getUTCMonth()).toBe(1); // February is 1
    });

    it('handles year boundary (Dec 31 23:59:59)', () => {
      const result = parseDate('2025-12-31 23:59:59');

      expect(result.getUTCFullYear()).toBe(2025);
      expect(result.getUTCMonth()).toBe(11);
      expect(result.getUTCDate()).toBe(31);
      expect(result.getUTCHours()).toBe(23);
    });

    it('handles year start (Jan 1 00:00:00)', () => {
      const result = parseDate('2025-01-01 00:00:00');

      expect(result.getUTCFullYear()).toBe(2025);
      expect(result.getUTCMonth()).toBe(0);
      expect(result.getUTCDate()).toBe(1);
    });

    it('handles midnight', () => {
      const result = parseDate('2025-06-15 00:00:00');

      expect(result.getUTCHours()).toBe(0);
      expect(result.getUTCMinutes()).toBe(0);
      expect(result.getUTCSeconds()).toBe(0);
    });

    it('handles end of day', () => {
      const result = parseDate('2025-06-15 23:59:59');

      expect(result.getUTCHours()).toBe(23);
      expect(result.getUTCMinutes()).toBe(59);
      expect(result.getUTCSeconds()).toBe(59);
    });
  });

  describe('Format Detection', () => {
    it('detects ISO format by T character', () => {
      const isoDate = parseDate('2025-12-17T18:29:37Z');
      const backendDate = parseDate('2025-12-17 18:29:37');

      // Both should produce valid dates
      expect(isoDate).toBeInstanceOf(Date);
      expect(backendDate).toBeInstanceOf(Date);

      // Both represent the same time
      expect(isoDate.getTime()).toBe(backendDate.getTime());
    });
  });
});
