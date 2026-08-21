/**
 * Adding to a masking list versus standing in for it.
 *
 * Every masking option in NestLens used to be `[...defaults, ...configured]`
 * with no way to say the other thing, so an application that needed a default
 * term readable — an `orderNote` field genuinely called `pin`, a `secret`
 * column that holds a room number — had no option but to leave it redacted.
 * `{ replace: [...] }` is that way, and it has to be written out so it cannot
 * happen by accident.
 */
import { DataMaskerService } from '../../core/data-masker.service';
import { replacesDefaults, resolveMaskingTerms } from '../../core/masking-terms';

const DEFAULTS = ['password', 'token'];

describe('masking term lists', () => {
  describe('resolveMaskingTerms', () => {
    it('keeps the defaults when nothing is configured', () => {
      expect(resolveMaskingTerms(DEFAULTS)).toEqual(['password', 'token']);
    });

    it('adds an array to the defaults', () => {
      expect(resolveMaskingTerms(DEFAULTS, ['iban'])).toEqual(['password', 'token', 'iban']);
    });

    it('stands in for the defaults when asked to replace them', () => {
      expect(resolveMaskingTerms(DEFAULTS, { replace: ['iban'] })).toEqual(['iban']);
    });

    it('accepts an empty replacement as a request to mask nothing', () => {
      // Distinct from `[]`, which adds nothing and keeps the defaults. Saying
      // "mask nothing" is a real position for a service whose payloads are
      // public, and it should not be confusable with saying nothing.
      expect(resolveMaskingTerms(DEFAULTS, { replace: [] })).toEqual([]);
      expect(resolveMaskingTerms(DEFAULTS, [])).toEqual(['password', 'token']);
    });

    it('deduplicates either way', () => {
      expect(resolveMaskingTerms(DEFAULTS, ['token', 'iban'])).toEqual([
        'password',
        'token',
        'iban',
      ]);
      expect(resolveMaskingTerms(DEFAULTS, { replace: ['iban', 'iban'] })).toEqual(['iban']);
    });

    it('reports which shape it was given', () => {
      expect(replacesDefaults(undefined)).toBe(false);
      expect(replacesDefaults(['iban'])).toBe(false);
      expect(replacesDefaults({ replace: ['iban'] })).toBe(true);
    });
  });

  describe('the masker honours both shapes', () => {
    it('adds to its defaults', () => {
      const masker = new DataMaskerService({ sensitiveParams: ['iban'] });
      const masked = masker.maskBody({ password: 'p', iban: 'TR00', city: 'Istanbul' }) as Record<
        string,
        unknown
      >;

      expect(masked.password).toBe('***REDACTED***');
      expect(masked.iban).toBe('***REDACTED***');
      expect(masked.city).toBe('Istanbul');
    });

    it('masks only what a replacement names', () => {
      const masker = new DataMaskerService({ sensitiveParams: { replace: ['iban'] } });
      const masked = masker.maskBody({ password: 'p', iban: 'TR00' }) as Record<string, unknown>;

      expect(masked.password).toBe('p');
      expect(masked.iban).toBe('***REDACTED***');
    });

    it('applies the same rule to headers', () => {
      const masker = new DataMaskerService({ sensitiveHeaders: { replace: ['x-tenant-key'] } });
      const masked = masker.maskHeaders({
        authorization: 'Bearer live',
        'x-tenant-key': 'k',
      }) as Record<string, unknown>;

      expect(masked.authorization).toBe('Bearer live');
      expect(masked['x-tenant-key']).toBe('***REDACTED***');
    });

    it('applies the same rule to user fields', () => {
      const masker = new DataMaskerService({ sensitiveUserFields: { replace: ['nickname'] } });
      const masked = masker.maskUserInfo({ password: 'p', nickname: 'ada' }) as Record<
        string,
        unknown
      >;

      expect(masked.password).toBe('p');
      expect(masked.nickname).toBe('***REDACTED***');
    });
  });
});
