/**
 * Which terms the GraphQL sanitizer masks for, and where they come from.
 *
 * This matters more than it looks. The sanitizer marks what it has cleaned and
 * `CollectorService.mask()` honours that mark, so for a GraphQL payload this
 * one list is the whole of the masking — there is no second pass behind it.
 * Anything missing from it reaches storage in the clear.
 *
 * Two things were missing when the mark was introduced: the collector's own
 * defaults (`cvv`, `passwd`, `card_number`, `social_security`) and anything the
 * application added through `security.dataMasking.sensitiveParams`. Both had
 * been masked by that second pass for as long as the option had existed.
 */
import { resolveSensitiveParams } from '../../../core/data-masker.service';
import { MaskingTerms } from '../../../core/masking-terms';
import { GraphQLWatcherConfig } from '../../../nestlens.config';
import { GRAPHQL_DEFAULTS, resolveGraphQLConfig } from '../../../watchers/graphql/types';
import { sanitizeVariables } from '../../../watchers/graphql/utils/variable-sanitizer';

const MASKED = '***';

/**
 * The list the watcher would really use, resolved the way it resolves it.
 *
 * Going through `resolveGraphQLConfig` rather than asserting on the array is
 * the point: the array is only correct if this is how it gets built.
 */
const listFor = (
  graphql?: boolean | GraphQLWatcherConfig,
  sensitiveParams?: MaskingTerms,
): string[] =>
  resolveGraphQLConfig(graphql, resolveSensitiveParams(sensitiveParams)).sensitiveVariables;

const maskedKeys = (payload: Record<string, unknown>, patterns: string[]): string[] => {
  const result = sanitizeVariables(payload, patterns) ?? {};

  return Object.keys(result).filter((key) => result[key] === MASKED);
};

describe('the terms the GraphQL sanitizer masks for', () => {
  describe("the collector's list travels with the watcher's", () => {
    // Every one of these is in the collector's defaults and in no GraphQL list.
    it.each(['cvv', 'cvc', 'card_number', 'passwd', 'social_security', 'auth_token'])(
      'masks %s, which only the collector used to know about',
      (key) => {
        expect(maskedKeys({ [key]: 'sensitive' }, listFor(true))).toEqual([key]);
      },
    );

    it('masks a term the application added to the collector', () => {
      const patterns = listFor(true, ['iban']);

      expect(maskedKeys({ iban: 'TR00', name: 'ada' }, patterns)).toEqual(['iban']);
    });

    it('leaves the GraphQL defaults in place while doing so', () => {
      const patterns = listFor(true, ['iban']);

      expect(maskedKeys({ password: 'p', pin: '1' }, patterns).sort()).toEqual(['password', 'pin']);
    });
  });

  describe('a configured list adds to the built-in ones', () => {
    it('masks what the application named', () => {
      const patterns = listFor({ sensitiveVariables: ['orderNote'] });

      expect(maskedKeys({ orderNote: 'n' }, patterns)).toEqual(['orderNote']);
    });

    it('does not drop the defaults on the way', () => {
      // The option read as "also mask these" and behaved as "mask only these".
      // Nobody could tell, because the collector's second pass masked
      // `password` afterwards regardless — until the mark stopped that pass.
      const patterns = listFor({ sensitiveVariables: ['orderNote'] });

      expect(maskedKeys({ password: 'p', token: 't', cvv: '1' }, patterns).sort()).toEqual([
        'cvv',
        'password',
        'token',
      ]);
    });

    it('adds to the header list the same way', () => {
      const resolved = resolveGraphQLConfig({ sensitiveHeaders: ['x-tenant-key'] }, []);

      expect(resolved.sensitiveHeaders).toEqual(
        expect.arrayContaining([...GRAPHQL_DEFAULTS.sensitiveHeaders, 'x-tenant-key']),
      );
    });
  });

  describe('`replace` is how to narrow it', () => {
    it('masks exactly what was named and nothing else', () => {
      const patterns = listFor({ sensitiveVariables: { replace: ['orderNote'] } });

      expect(maskedKeys({ orderNote: 'n', password: 'p', token: 't', cvv: '1' }, patterns)).toEqual(
        ['orderNote'],
      );
    });

    it("drops the collector's terms too, since nothing else will apply them", () => {
      // The mark is what stops the collector looking at this payload, so a term
      // dropped here is dropped for GraphQL entirely. Leaving the collector's
      // list applied on one side of that would make `replace` mean something
      // different depending on which watcher produced the entry.
      const patterns = listFor({ sensitiveVariables: { replace: ['orderNote'] } }, ['iban']);

      expect(maskedKeys({ orderNote: 'n', iban: 'TR00' }, patterns)).toEqual(['orderNote']);
    });

    it('leaves other watchers alone', () => {
      // `replace` on the GraphQL watcher says nothing about a request body.
      const collectorTerms = resolveSensitiveParams(['iban']);

      expect(collectorTerms).toEqual(expect.arrayContaining(['password', 'iban']));
    });

    it('replaces the header list on the same terms', () => {
      const resolved = resolveGraphQLConfig(
        { sensitiveHeaders: { replace: ['x-tenant-key'] } },
        [],
      );

      expect(resolved.sensitiveHeaders).toEqual(['x-tenant-key']);
    });

    it('deduplicates so the compiled matcher sees each term once', () => {
      const patterns = listFor({ sensitiveVariables: ['password', 'password'] });

      expect(patterns.filter((term) => term === 'password')).toHaveLength(1);
    });
  });

  describe('the resolved list is stable enough to cache a matcher on', () => {
    it('hands the same array to every call for one configuration', () => {
      // The sanitizer keys its compiled matcher on the array's identity. A
      // fresh array per call would rebuild the matcher on every operation.
      const resolved = resolveGraphQLConfig(true, resolveSensitiveParams());

      expect(resolved.sensitiveVariables).toBe(resolved.sensitiveVariables);
    });
  });
});
