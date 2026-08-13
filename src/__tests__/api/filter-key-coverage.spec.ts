/**
 * The named filters and the declared ones are the same set.
 *
 * `toFilters()` reads by name from a fixed list rather than copying whatever
 * properties the request produced — a key that came from a query string should
 * never decide which property gets written. The cost of naming them is that the
 * list can fall behind: add a filter to the DTO, forget the list, and the
 * dashboard sends it, the API validates it, and the storage never sees it. No
 * error anywhere; the results are simply unfiltered.
 *
 * So the list is compared against the properties the DTO declares. A filter
 * added to one and not the other fails here, by name.
 *
 * Following AAA (Arrange-Act-Assert).
 */
import { readFileSync } from 'fs';
import { join, resolve } from 'path';

const SOURCE = join(resolve(__dirname, '..', '..'), 'api', 'dto', 'cursor-query.dto.ts');

const source = readFileSync(SOURCE, 'utf8');

/** Everything the class declares, minus the pagination controls. */
const declaredFilters = (): string[] => {
  const body = source.slice(
    source.indexOf('export class CursorQueryDto'),
    source.indexOf('  private static readonly PAGINATION_KEYS'),
  );
  const pagination = ['type', 'limit', 'beforeSequence', 'afterSequence'];

  return [...body.matchAll(/^ {2}(\w+)\??!?:/gm)]
    .map((match) => match[1] as string)
    .filter((name) => !pagination.includes(name));
};

/** The names `toFilters()` is allowed to read. */
const namedFilters = (): string[] => {
  const start = source.indexOf('FILTER_KEYS = [');
  const list = source.slice(start, source.indexOf('] as const;', start));

  return [...list.matchAll(/'(\w+)'/g)].map((match) => match[1] as string);
};

describe('filter keys', () => {
  const declared = declaredFilters();
  const named = namedFilters();

  it('finds both lists', () => {
    expect(declared.length).toBeGreaterThan(20);
    expect(named.length).toBeGreaterThan(20);
  });

  it('names every filter the DTO declares, and no others', () => {
    expect([...named].sort()).toEqual([...declared].sort());
  });

  it('names each one once', () => {
    expect([...new Set(named)]).toHaveLength(named.length);
  });
});
