/**
 * Hashing an entry must not depend on how long its text is.
 *
 * `generateFamilyHash` runs on every exception, every error log and every
 * query, on the event loop of the application being watched — and it normalises
 * its input with regular expressions over text the application does not
 * control. `throw new Error(untrustedInput)` is enough to reach it.
 *
 * The address pattern was unbounded on both sides of the `@`, so a long run
 * with no `@` in it had to restart at every position:
 *
 *     50,000 characters  ->  1,659 ms, all of it blocking
 *
 * That is a denial of service reachable from any endpoint that puts user input
 * into an error message. Two things fix it and both are kept: the input is
 * bounded before it is read, and the patterns that could backtrack are bounded
 * themselves, so neither is the only thing standing between a long string and
 * the event loop.
 */
import { FamilyHashService } from '../../core/family-hash.service';
import { Entry } from '../../types';

const service = new FamilyHashService();

const exception = (message: string, stack = ''): Entry =>
  ({ id: 1, type: 'exception', payload: { name: 'Error', message, stack } }) as unknown as Entry;

const query = (sql: string): Entry =>
  ({
    id: 1,
    type: 'query',
    payload: { query: sql, source: 'typeorm', duration: 1 },
  }) as unknown as Entry;

/** Milliseconds spent hashing, which is what an attacker is buying. */
const timeToHash = (entry: Entry): number => {
  const started = process.hrtime.bigint();
  service.generateFamilyHash(entry);
  return Number(process.hrtime.bigint() - started) / 1e6;
};

// Generous enough for a loaded CI runner, far under the 1,659ms it was.
const BUDGET_MS = 150;

describe('family hash input bounds', () => {
  describe('a long message cannot block the loop', () => {
    it.each([
      ['plain text', 'a'.repeat(50_000)],
      ['no @ anywhere', 'x'.repeat(50_000)],
      ['almost an address', `${'a'.repeat(50_000)}@`],
      ['slashes with no extension', `/${'a'.repeat(30_000)}`],
      ['path-like', '/a'.repeat(25_000)],
      ['an unclosed quote', `'${'a'.repeat(30_000)}`],
      ['an unclosed double quote', `"${'a'.repeat(30_000)}`],
      ['a URL that never ends', `http://${'a'.repeat(30_000)}`],
      ['dots', 'a.'.repeat(25_000)],
      ['dashes', 'a-'.repeat(25_000)],
    ])('hashes %s quickly', (_name, message) => {
      expect(timeToHash(exception(message))).toBeLessThan(BUDGET_MS);
    });

    it('hashes a long stack quickly', () => {
      expect(timeToHash(exception('x', `at ${'a'.repeat(50_000)}`))).toBeLessThan(BUDGET_MS);
    });

    it('hashes a long query quickly', () => {
      expect(timeToHash(query(`SELECT '${'a'.repeat(50_000)}`))).toBeLessThan(BUDGET_MS);
    });
  });

  describe('bounding the input does not change what it groups', () => {
    it('gives two identical errors the same hash', () => {
      const a = service.generateFamilyHash(exception('Connection refused'));
      const b = service.generateFamilyHash(exception('Connection refused'));

      expect(a).toBe(b);
      expect(a).toBeDefined();
    });

    it('gives two different errors different hashes', () => {
      const a = service.generateFamilyHash(exception('Connection refused'));
      const b = service.generateFamilyHash(exception('Permission denied'));

      expect(a).not.toBe(b);
    });

    it('still groups messages that differ only in their values', () => {
      // The point of the normalisation: one problem, one family.
      const a = service.generateFamilyHash(exception('User 123 not found'));
      const b = service.generateFamilyHash(exception('User 456 not found'));

      expect(a).toBe(b);
    });

    it('still replaces an address', () => {
      const a = service.generateFamilyHash(exception('no account for ada@example.com'));
      const b = service.generateFamilyHash(exception('no account for bob@example.org'));

      expect(a).toBe(b);
    });

    it('still replaces a file path', () => {
      const a = service.generateFamilyHash(exception('cannot read /srv/app/one.json'));
      const b = service.generateFamilyHash(exception('cannot read /srv/app/two.json'));

      expect(a).toBe(b);
    });

    it('still replaces a UUID', () => {
      const a = service.generateFamilyHash(
        exception('missing 123e4567-e89b-12d3-a456-426614174000'),
      );
      const b = service.generateFamilyHash(
        exception('missing 00000000-0000-0000-0000-000000000000'),
      );

      expect(a).toBe(b);
    });

    it('still groups queries that differ only in their literals', () => {
      const a = service.generateFamilyHash(query('SELECT * FROM users WHERE id = 1'));
      const b = service.generateFamilyHash(query('SELECT * FROM users WHERE id = 99'));

      expect(a).toBe(b);
    });

    it('separates two long messages that differ early', () => {
      // Truncation only loses what is past the limit, and what identifies a
      // family is at the front.
      const a = service.generateFamilyHash(exception(`timeout${'x'.repeat(50_000)}`));
      const b = service.generateFamilyHash(exception(`refused${'x'.repeat(50_000)}`));

      expect(a).not.toBe(b);
    });
  });
});
