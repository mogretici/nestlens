/**
 * The GraphQL sanitizer decides, for every key in every captured response,
 * whether the dashboard shows the value or `***`. It is the hottest code in the
 * watcher and the only thing standing between a production payload and storage,
 * so both properties are pinned here: what it masks, and what it costs.
 */
import { DataMaskerService } from '../../../core/data-masker.service';
import { isSanitized } from '../../../core/sanitized-payload';
import { GRAPHQL_DEFAULTS } from '../../../watchers/graphql/types';
import {
  sanitizeResponse,
  sanitizeVariables,
} from '../../../watchers/graphql/utils/variable-sanitizer';

const PATTERNS = GRAPHQL_DEFAULTS.sensitiveVariables;
const MASKED = '***';

/** Runs one key through the matcher and reports whether it was masked. */
const isMasked = (key: string, patterns: string[] = PATTERNS): boolean =>
  sanitizeVariables({ [key]: 'readable-value' }, patterns)?.[key] === MASKED;

describe('GraphQL variable sanitizer', () => {
  describe('field names that must be masked', () => {
    // Straight from the configured list, plus the spellings a real schema uses
    // for the same field. Each of these carries a credential.
    it.each([
      'password',
      'Password',
      'confirmPassword',
      'passwordHash',
      'passwordConfirmation',
      'token',
      'apiToken',
      'access_token',
      'accessToken',
      'refreshToken',
      'refresh_token',
      'secret',
      'clientSecret',
      'apiSecret',
      'stripeSecretKey',
      'apiKey',
      'api_key',
      'API-KEY',
      'privateKey',
      'private_key',
      'authorization',
      'creditCard',
      'credit_card',
      'creditCardNumber',
      'ssn',
      'pin',
      'pinCode',
    ])('masks %s', (key) => {
      expect(isMasked(key)).toBe(true);
    });
  });

  describe('field names that must not be masked', () => {
    /**
     * Every one of these was masked before word-boundary matching, because
     * `shipping`, `shopping`, `spinner`, `topping` and `isPinned` all contain
     * the letters of `pin`, `secretary` contains `secret`, and `tokenCount`
     * contains `token`.
     *
     * On a fashion payload that made the dashboard claim the API returned
     * `shippingAddress: '***'` when it had returned an address — which is worse
     * than showing nothing, because it is believed.
     */
    it.each([
      'shippingAddress',
      'shipping',
      'shippingMethod',
      'spinner',
      'isPinned',
      'tokenCount',
      'shoppingCart',
      'topping',
      'secretary',
      'passport',
      'keyboard',
      'monospaced',
    ])('leaves %s readable', (key) => {
      expect(isMasked(key)).toBe(false);
    });
  });

  describe('the forms one field name is written in', () => {
    /**
     * A schema names a collection for what it holds, and every one of these
     * reached storage in the clear when a term only matched its exact singular
     * — the first cut of whole-word matching narrowed `tokens` out along with
     * `topping`.
     */
    it.each(['tokens', 'passwords', 'secrets', 'apiKeys', 'accessTokens', 'creditCards'])(
      'masks the plural %s',
      (key) => {
        expect(isMasked(key)).toBe(true);
      },
    );

    it('does not let the plural widen a term past its own words', () => {
      expect(isMasked('toppings')).toBe(false);
      expect(isMasked('shippings')).toBe(false);
      expect(isMasked('tokenCounts')).toBe(false);
    });

    it('masks a term suffixed with an index or a revision', () => {
      // `token_2` and `token2` are the same field written two ways, and used
      // to disagree because only the separator produced a word boundary.
      expect(isMasked('token_2')).toBe(true);
      expect(isMasked('token2')).toBe(true);
      expect(isMasked('password1')).toBe(true);
      expect(isMasked('apiKeyV2')).toBe(true);
      expect(isMasked('apiKey2')).toBe(true);
    });

    it('still leaves a name that merely contains the digits alone', () => {
      expect(isMasked('shipping2')).toBe(false);
      expect(isMasked('base64Data')).toBe(false);
    });
  });

  describe('matching rules', () => {
    it('matches a term against whole words, in any spelling', () => {
      expect(isMasked('apiToken')).toBe(true);
      expect(isMasked('api_token')).toBe(true);
      expect(isMasked('API_TOKEN')).toBe(true);
      expect(isMasked('api-token')).toBe(true);
    });

    it('masks a name derived from a sensitive field but not one describing it', () => {
      // A hash of a password is as good as the password; a count of tokens is a
      // number.
      expect(isMasked('passwordHash')).toBe(true);
      expect(isMasked('tokenCount')).toBe(false);
      expect(isMasked('tokenExpiresAt')).toBe(false);
    });

    it('is case-insensitive about the configured patterns themselves', () => {
      expect(isMasked('sessionid', ['SessionID'])).toBe(true);
    });

    it('still honours wildcard patterns as a deliberate opt-in to breadth', () => {
      expect(isMasked('internalWhatever', ['internal*'])).toBe(true);
      expect(isMasked('notInternal', ['internal*'])).toBe(false);
    });

    it('ignores patterns that reduce to nothing', () => {
      expect(isMasked('password', ['', '   ', '-'])).toBe(false);
    });
  });

  describe('answers are remembered without going stale', () => {
    it('gives the same answer on the second pass through the same key', () => {
      const patterns = [...PATTERNS];
      const payload = { tokenCount: 1, apiToken: 'a', shoppingCart: {} };

      const first = sanitizeVariables(payload, patterns);
      const second = sanitizeVariables(payload, patterns);

      expect(second).toEqual(first);
      expect(second?.tokenCount).toBe(1);
      expect(second?.apiToken).toBe(MASKED);
    });

    it('does not let one pattern list answer for another', () => {
      const permissive: string[] = [];
      const strict = ['nickname'];

      expect(isMasked('nickname', permissive)).toBe(false);
      expect(isMasked('nickname', strict)).toBe(true);
      // ...and back again, in case the first answer was cached globally.
      expect(isMasked('nickname', permissive)).toBe(false);
    });

    it('stays correct past the size the memo is capped at', () => {
      const patterns = [...PATTERNS];
      const payload: Record<string, unknown> = {};

      // Comfortably more distinct names than the cap, so the tail is answered
      // by recomputation rather than by the memo.
      for (let i = 0; i < 3000; i += 1) {
        payload[`field_${i}`] = i;
        payload[`token_${i}`] = 'secret-value';
      }

      const result = sanitizeVariables(payload, patterns) as Record<string, unknown>;

      expect(result.field_0).toBe(0);
      expect(result.field_2999).toBe(2999);
      expect(result.token_0).toBe(MASKED);
      expect(result.token_2999).toBe(MASKED);
    });

    it('answers a repeated key without consulting the term list again', () => {
      // The memo is worth having because a GraphQL schema has a finite field
      // set: thousands of key occurrences over a few dozen names. If it stops
      // working the watcher pays full price on every key of every response.
      //
      // Counted rather than timed. The first version of this test compared two
      // wall-clock measurements and failed roughly one run in three under
      // parallel workers, which is a test that reports on the machine instead
      // of on the code. Every term lookup goes through `Set.prototype.has`, and
      // a memo hit performs none, so counting them says the same thing exactly.
      const termLookups = jest.spyOn(Set.prototype, 'has');

      try {
        // Fifty distinct names, five thousand occurrences — the shape a schema
        // produces.
        const names = Array.from({ length: 5000 }, (_, i) => `feedItemLabel${i % 50}`);
        const patterns = [...PATTERNS];

        termLookups.mockClear();
        for (const name of names) sanitizeVariables({ [name]: 1 }, patterns);

        // Each distinct name costs one walk of its word runs — a few lookups.
        // Without the memo every one of the 5,000 occurrences pays that again.
        expect(termLookups.mock.calls.length).toBeLessThan(names.length);
      } finally {
        termLookups.mockRestore();
      }
    });
  });

  describe('response size limit', () => {
    const overLimit = {
      rows: Array.from({ length: 4000 }, (_, i) => ({ id: i, label: 'x'.repeat(50) })),
    };

    it('rejects an oversized response without serializing it', () => {
      const result = sanitizeResponse(overLimit, PATTERNS, 64 * 1024) as Record<string, unknown>;

      expect(result._truncated).toBe(true);
      expect(result._maxSize).toBe(64 * 1024);
      // Reported as a floor: the probe stopped counting once it had proved the
      // response was too big, rather than serializing megabytes to find out by
      // how much.
      expect(result._sizeIsLowerBound).toBe(true);
      expect(result._size as number).toBeGreaterThan(64 * 1024);
    });

    it('never truncates a response that fits, however heavily it escapes', () => {
      // Escaping only makes JSON longer, so a size probe that estimates low is
      // safe and one that estimates high silently drops responses the user
      // asked to keep. This is the payload that would catch the latter.
      const quoted = { note: '"\n\t\\'.repeat(2000) };
      const exact = JSON.stringify(quoted).length;

      const kept = sanitizeResponse(quoted, PATTERNS, exact) as Record<string, unknown>;

      expect(kept._truncated).toBeUndefined();
      expect(kept.note).toBe(quoted.note);
    });

    it('reports an exact size when the limit is too large for the cheap probe', () => {
      // Above the probe's own ceiling, so the behaviour is what it always was:
      // serialize, measure exactly, decide.
      const bigLimit = 2 * 1024 * 1024;
      const huge = {
        rows: Array.from({ length: 200_000 }, (_, i) => ({ id: i, label: 'yyyyyyyyyy' })),
      };

      expect(JSON.stringify(huge).length).toBeGreaterThan(bigLimit);

      const result = sanitizeResponse(huge, PATTERNS, bigLimit) as Record<string, unknown>;

      expect(result._truncated).toBe(true);
      expect(result._sizeIsLowerBound).toBeUndefined();
      expect(result._size).toBe(JSON.stringify(huge).length);
    });

    it('keeps a response whose members vanish from the output', () => {
      // `undefined`, functions and symbols are dropped from an object — key
      // included. Counting those keys made the probe report more than the
      // payload costs, which rejects a response that would have fitted.
      const vanishing = { ['a'.repeat(64)]: undefined, ['b'.repeat(64)]: () => 1 };

      expect(JSON.stringify(vanishing)).toBe('{}');

      const result = sanitizeResponse(vanishing, PATTERNS, 16) as Record<string, unknown>;
      expect(result._truncated).toBeUndefined();
    });

    it('keeps a response whose values serialize shorter than their braces', () => {
      // `toJSON` may return anything, including a single digit — shorter than
      // the two braces the probe would otherwise assume an object costs.
      const compact = { a: { toJSON: () => 0 }, b: { toJSON: () => 1 } };

      expect(JSON.stringify(compact)).toBe('{"a":0,"b":1}');

      const result = sanitizeResponse(compact, PATTERNS, 13) as Record<string, unknown>;
      expect(result._truncated).toBeUndefined();
    });

    it('never rejects a payload that JSON.stringify would fit inside the limit', () => {
      // The probe is only sound while its count is a floor on the real output.
      // These shapes are the ones where a naive count is not.
      const shapes: unknown[] = [
        {},
        { a: undefined },
        { a: undefined, b: undefined, c: undefined },
        [undefined, undefined],
        { d: new Date(0) },
        { n: { toJSON: () => 1 } },
        { s: Symbol.iterator ? undefined : 1 },
        { nested: { deeper: { gone: undefined } } },
        { mixed: [1, undefined, 'x'] },
        { empty: [], obj: {} },
      ];

      for (const shape of shapes) {
        const exact = JSON.stringify(shape) ?? '';

        // At the tightest limit the payload still fits in, nothing may be
        // rejected.
        const result = sanitizeResponse(shape, PATTERNS, exact.length);

        expect((result as { _truncated?: boolean })?._truncated).toBeUndefined();
      }
    });

    it('falls back to the serializer for payloads it cannot measure', () => {
      const cyclic: Record<string, unknown> = { name: 'loop' };
      cyclic.self = cyclic;

      expect(sanitizeResponse(cyclic, PATTERNS, 64 * 1024)).toEqual({
        _error: 'Unable to serialize response',
      });
    });

    it('still masks inside a response that fits', () => {
      const result = sanitizeResponse(
        { user: { id: 1, apiToken: 'ak_live_x', tokenCount: 3 } },
        PATTERNS,
        64 * 1024,
      ) as { user: Record<string, unknown> };

      expect(result.user.apiToken).toBe(MASKED);
      expect(result.user.tokenCount).toBe(3);
      expect(result.user.id).toBe(1);
    });
  });

  describe('sanitized payloads are marked for the collector', () => {
    it('marks what it produced', () => {
      expect(isSanitized(sanitizeVariables({ a: 1 }, PATTERNS))).toBe(true);
      expect(isSanitized(sanitizeResponse({ a: 1 }, PATTERNS, 64 * 1024))).toBe(true);
      expect(isSanitized(sanitizeResponse({ a: 'x'.repeat(200_000) }, PATTERNS, 1024))).toBe(true);
    });

    it('marks nothing it did not build', () => {
      const untouched = { apiToken: 'plain' };

      expect(isSanitized(untouched)).toBe(false);
      expect(isSanitized(sanitizeVariables(undefined, PATTERNS))).toBe(false);
    });

    it('lets the masker skip the copy it already made, by identity', () => {
      const masker = new DataMaskerService();
      const responseData = sanitizeResponse(
        { feed: { tokenCount: 7, shoppingCart: { itemCount: 2 } } },
        PATTERNS,
        64 * 1024,
      );

      const masked = masker.maskBody({ responseData }) as Record<string, unknown>;

      // Not merely equal — the same object. A second deep clone of the largest
      // thing in the entry is the cost this avoids.
      expect(masked.responseData).toBe(responseData);
    });

    it('still masks everything the watcher did not sanitize', () => {
      const masker = new DataMaskerService();
      const responseData = sanitizeResponse({ feed: { tokenCount: 7 } }, PATTERNS, 64 * 1024);

      const masked = masker.maskBody({
        responseData,
        // A resolver puts whatever it likes in here and no watcher cleans it.
        errors: [{ message: 'nope', extensions: { token: 'leaked-value' } }],
        user: { id: 1, password: 'hunter2' },
      }) as Record<string, unknown>;

      const errors = masked.errors as { extensions: Record<string, unknown> }[];
      const user = masked.user as Record<string, unknown>;

      expect(errors[0].extensions.token).toBe('***REDACTED***');
      expect(user.password).toBe('***REDACTED***');
      expect(masked.responseData).toBe(responseData);
    });

    it('masks an unsanitized payload exactly as it always did', () => {
      const masker = new DataMaskerService();

      const masked = masker.maskBody({
        nested: { apiKey: 'ak_live_x', tokenCount: 3, harmless: 'kept' },
      }) as { nested: Record<string, unknown> };

      expect(masked.nested.apiKey).toBe('***REDACTED***');
      // Deliberately broad in the collector-wide masker — see the comment on
      // `matchesSensitiveTerm`. Only the GraphQL watcher narrowed.
      expect(masked.nested.tokenCount).toBe('***REDACTED***');
      expect(masked.nested.harmless).toBe('kept');
    });
  });
});
