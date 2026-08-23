/**
 * Which operation ran, and what it was called.
 *
 * Both were read with a regular expression: the type from `startsWith`, the
 * name from the first `query|mutation|subscription` anywhere in the document.
 * Measured on the old pair:
 *
 *     '# a note\nmutation AddOrder { … }'      -> type query
 *     'fragment F on Order { id } mutation M …' -> type query
 *     '# mutation Ghost { x }\n{ hello }'       -> name Ghost
 *     '{ user { query name } }'                 -> name name
 *
 * A mutation filed under "query" is the operation a reader is most often
 * looking for, in the wrong place. The parser skips comments and strings now
 * and only counts a keyword outside a selection set.
 */
import {
  declaredOperations,
  selectsIntrospection,
  extractOperationName,
  extractOperationType,
  truncateQuery,
  normalizeQuery,
  hashQuery,
} from '../../../watchers/graphql/utils/query-parser';

describe('hashing a very large query', () => {
  /**
   * Hashing normalises first — four passes with a regular expression each —
   * and it runs on every operation, on the event loop of the application being
   * watched:
   *
   * ```text
   * 100 KB query  ->    5 ms
   *   1 MB query  ->   47 ms
   *   5 MB query  ->  226 ms
   * ```
   *
   * What is stored is truncated at `maxQuerySize`, so reading further only
   * refines the grouping of queries nobody can see in full.
   */
  const long = (characters: number): string => `query { ${'a '.repeat(characters / 2)}}`;

  /**
   * The fastest of several runs, not one.
   *
   * Hashing five megabytes takes about a millisecond now that the input is
   * bounded, and a budget of a hundred is checking that the bound is still
   * there. Timed once, though, what it really measured was whether a garbage
   * collection landed inside the measurement — which, in a full run under
   * memory pressure, it sometimes did: this failed twice in one afternoon and
   * passed on every rerun, blocking a push each time.
   *
   * A regression to the 226ms this used to cost fails every sample; a pause
   * that hits one of them no longer fails the suite.
   */
  it('is quick', () => {
    const query = long(5_000_000);

    let fastest = Number.POSITIVE_INFINITY;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const started = Date.now();
      hashQuery(query);
      fastest = Math.min(fastest, Date.now() - started);
    }

    expect(fastest).toBeLessThan(100);
  });

  it('gives one query one hash', () => {
    expect(hashQuery(long(1_000_000))).toBe(hashQuery(long(1_000_000)));
  });

  it('tells two long queries of different length apart', () => {
    expect(hashQuery(long(1_000_000))).not.toBe(hashQuery(long(1_200_000)));
  });

  it('leaves an ordinary query hashing as it always did', () => {
    expect(hashQuery('{ hello }')).toBe(hashQuery('{ hello  }'));
  });
});

describe('which operation a document declares', () => {
  describe('the type', () => {
    it.each([
      ['a plain query', 'query GetOrders { orders { id } }', 'query'],
      ['a plain mutation', 'mutation AddOrder { addOrder { id } }', 'mutation'],
      ['a subscription', 'subscription OnOrder { orderAdded { id } }', 'subscription'],
      ['shorthand', '{ orders { id } }', 'query'],
      ['leading whitespace', '\n\n   mutation M { m }', 'mutation'],
      ['a comment first', '# a note\nmutation AddOrder { addOrder { id } }', 'mutation'],
      [
        'a fragment first',
        'fragment F on Order { id }\nmutation AddOrder { addOrder { ...F } }',
        'mutation',
      ],
      [
        'a comment before a subscription',
        '# note\nsubscription OnOrder { orderAdded { id } }',
        'subscription',
      ],
      ['a commented-out operation', '# mutation Ghost { x }\n{ hello }', 'query'],
      ['a field named query', '{ user { query name } }', 'query'],
      ['a field named mutation', '{ user { mutation } }', 'query'],
      ['a string holding a keyword', 'query Q { hello(text: "mutation X") }', 'query'],
      ['a block string holding a brace', 'query Q { hello(text: """ { mutation } """) }', 'query'],
    ])('reads %s', (_name, query, expected) => {
      expect(extractOperationType(query)).toBe(expected);
    });

    it('follows the operation the client named', () => {
      const document = 'query A { a }\nmutation B { b }';

      expect(extractOperationType(document, 'B')).toBe('mutation');
      expect(extractOperationType(document, 'A')).toBe('query');
    });

    it('falls back to the first when the named one is not there', () => {
      expect(extractOperationType('mutation B { b }', 'Missing')).toBe('mutation');
    });
  });

  describe('the name', () => {
    it.each([
      ['a named query', 'query GetOrders { orders { id } }', 'GetOrders'],
      ['a named mutation', 'mutation AddOrder { addOrder { id } }', 'AddOrder'],
      ['variables in the way', 'query Hi($name: String) { hello(name: $name) }', 'Hi'],
      ['a comment first', '# a note\nmutation AddOrder { x }', 'AddOrder'],
    ])('reads %s', (_name, query, expected) => {
      expect(extractOperationName(query)).toBe(expected);
    });

    it.each([
      ['an anonymous operation', 'query { orders { id } }'],
      ['shorthand', '{ orders { id } }'],
      ['a commented-out operation', '# mutation Ghost { x }\n{ hello }'],
      ['a field named query', '{ user { query name } }'],
    ])('reads nothing from %s', (_name, query) => {
      expect(extractOperationName(query)).toBeUndefined();
    });

    it('prefers what the client asked for', () => {
      expect(extractOperationName('query A { a } query B { b }', 'B')).toBe('B');
    });
  });

  it('lists every operation in a document', () => {
    const operations = declaredOperations('query A { a }\nmutation B { b }\nsubscription C { c }');

    expect(operations).toEqual([
      { type: 'query', name: 'A' },
      { type: 'mutation', name: 'B' },
      { type: 'subscription', name: 'C' },
    ]);
  });

  it('is not slowed down by a document that never closes a string', () => {
    // The query arrives from a client, so an unterminated one has to end.
    const hostile = `query Q { hello(text: "${'a'.repeat(200_000)}`;

    const started = process.hrtime.bigint();
    expect(extractOperationType(hostile)).toBe('query');
    const elapsed = Number(process.hrtime.bigint() - started) / 1e6;

    expect(elapsed).toBeLessThan(150);
  });

  it('is not slowed down by a document that never closes a comment or a brace', () => {
    const hostile = `${'{'.repeat(100_000)}\n# ${'x'.repeat(100_000)}`;

    const started = process.hrtime.bigint();
    expect(extractOperationType(hostile)).toBe('query');
    const elapsed = Number(process.hrtime.bigint() - started) / 1e6;

    expect(elapsed).toBeLessThan(150);
  });
});

describe('asking the server about itself', () => {
  it.each([
    [
      'the standard introspection query',
      'query IntrospectionQuery { __schema { types { name } } }',
    ],
    ['shorthand introspection', '{ __schema { queryType { name } } }'],
    ['a type lookup', 'query { __type(name: "Order") { fields { name } } }'],
    ['one behind a comment', '# looking\n{ __schema { types { name } } }'],
  ])('recognises %s', (_name, query) => {
    expect(selectsIntrospection(query)).toBe(true);
  });

  it.each([
    ['an ordinary query', '{ orders { id } }'],
    ['__typename, which every Apollo client adds', '{ orders { __typename id } }'],
    ['a mutation storing the word', 'mutation { saveDoc(text: "__schema is a field") { id } }'],
    ['an operation named around it', 'query NotAnIntrospectionQuery { orders { id } }'],
    ['a field whose name contains it', '{ user { my__schema } }'],
    ['a default value holding it', 'query Q($t: String = "introspectionquery") { orders { id } }'],
    ['a block string holding it', 'mutation { save(text: """ __schema """) { id } }'],
  ])('does not mistake %s for it', (_name, query) => {
    expect(selectsIntrospection(query)).toBe(false);
  });

  it('is not slowed down by a long document', () => {
    const long = `{ orders { ${'a '.repeat(100_000)} } }`;

    const started = process.hrtime.bigint();
    expect(selectsIntrospection(long)).toBe(false);
    expect(Number(process.hrtime.bigint() - started) / 1e6).toBeLessThan(150);
  });
});

describe('truncating a query', () => {
  it('leaves a short one alone', () => {
    expect(truncateQuery('{ hello }', 100)).toBe('{ hello }');
  });

  it('keeps what fits when the limit is small', () => {
    // `Math.max(lastBrace, lastComma, maxSize - 50)` is negative for any limit
    // below fifty with no brace before it, and `substring(0, -1)` is empty: the
    // marker was all that was recorded.
    const truncated = truncateQuery('{ hello world abc }', 10);

    expect(truncated).toContain('{ hello wo');
    expect(truncated).toContain('[truncated]');
  });

  it('cuts at a brace when one is near the limit', () => {
    const query = '{ a { b } }' + ' '.repeat(40) + 'trailing';

    expect(truncateQuery(query, 50)).toContain('[truncated]');
  });

  it('records nothing but the marker for a limit of zero', () => {
    expect(truncateQuery('{ hello }', 0)).toBe('... [truncated]');
  });

  it('never returns more than the limit plus the marker', () => {
    const query = 'x'.repeat(1_000);

    expect(truncateQuery(query, 100).replace('\n... [truncated]', '').length).toBeLessThanOrEqual(
      100,
    );
  });
});

describe('hashing a query', () => {
  it('gives two spellings of one query the same hash', () => {
    expect(hashQuery('{ orders { id } }')).toBe(hashQuery('{\n  orders {\n    id\n  }\n}'));
  });

  it('gives two different queries different hashes', () => {
    expect(hashQuery('{ orders { id } }')).not.toBe(hashQuery('{ orders { total } }'));
  });

  it('normalises comments away', () => {
    expect(normalizeQuery('{ orders { id } } # a note')).toBe('{orders{id}}');
  });
});
