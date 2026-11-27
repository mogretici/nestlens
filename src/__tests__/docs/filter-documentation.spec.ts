/**
 * What the filtering documentation promises has to be what the API accepts.
 *
 * Unknown query parameters are stripped rather than rejected, so a documented
 * link that names one wrong filters nothing and says nothing about it. The
 * dashboard pages carried three of those:
 *
 *     /nestlens/requests?status=500&method=POST   ->  every request, unfiltered
 *
 * The real names are plural. The count in the same page was wrong too — "over
 * 60 filter types" against fifty — which is the kind of number that is right on
 * the day it is written and never again.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CursorQueryDto } from '../../api/dto/cursor-query.dto';

const DOCS = join(__dirname, '..', '..', '..', 'docs', 'docs', 'dashboard');

const read = (file: string): string => readFileSync(join(DOCS, file), 'utf8');

const accepted = (CursorQueryDto as unknown as { FILTER_KEYS: readonly string[] }).FILTER_KEYS;

/**
 * Named in a URL but not a filter: pagination, the tag endpoint's own options,
 * and the two the dashboard keeps for itself.
 */
const NOT_A_FILTER = new Set([
  'type',
  'limit',
  'beforeSequence',
  'afterSequence',
  'logic',
  // Read by the dashboard, turned into `from` and `minDuration` on the way out.
  'window',
  'slower',
]);

/** Every query parameter named anywhere in a page. */
const parametersIn = (markdown: string): string[] => {
  const names = new Set<string>();

  for (const [, query] of markdown.matchAll(/\?([A-Za-z0-9_=,&./*:%-]+)/g)) {
    for (const pair of query.split('&')) {
      const name = pair.split('=')[0];
      if (name) names.add(name);
    }
  }

  return [...names];
};

describe('the filtering documentation', () => {
  it.each(['filtering.md', 'navigation.md'])(
    'names only parameters the API accepts in %s',
    (file) => {
      const unknown = parametersIn(read(file)).filter(
        (name) => !accepted.includes(name) && !NOT_A_FILTER.has(name),
      );

      expect(unknown).toEqual([]);
    },
  );

  it('states how many filters there are, and states the right number', () => {
    const stated = read('filtering.md').match(/accepts (\d+) filter parameters/);

    expect(stated).not.toBeNull();
    expect(Number(stated?.[1])).toBe(accepted.length);
  });

  it('documents the two range filters', () => {
    const page = read('filtering.md');

    expect(page).toContain('window=');
    expect(page).toContain('slower=');
  });

  /**
   * The catalogue under "Filter Types" names each filter by its parameter, so
   * both directions can be read: four filters were documented that existed in
   * no layer — query connections, cache hit or miss, mail recipients and
   * subjects, Redis key patterns — and the event and GraphQL filters, wired from
   * the DTO to the storage, were not documented at all.
   */
  describe('the catalogue of filters', () => {
    const catalogue = (): string => {
      const page = read('filtering.md');
      return page.slice(page.indexOf('## Filter Types'), page.indexOf('## Filter UI Components'));
    };

    /** The parameter each catalogue line names: `- **Label** (`param`)`. */
    const named = (): string[] =>
      [...catalogue().matchAll(/^- \*\*[^*]+\*\* \(`(\w+)`/gm)].map((m) => m[1]);

    it('names a parameter on every line', () => {
      const lines = [...catalogue().matchAll(/^- \*\*[^*]+\*\*.*$/gm)].map((m) => m[0]);

      expect(lines.length).toBeGreaterThan(30);
      expect(lines.filter((line) => !/^- \*\*[^*]+\*\* \(`\w+`/.test(line))).toEqual([]);
    });

    it('names only filters the API accepts', () => {
      const unknown = named().filter((name) => !accepted.includes(name) && !NOT_A_FILTER.has(name));

      expect(unknown).toEqual([]);
    });

    it('documents every filter the API accepts', () => {
      const page = read('filtering.md');

      expect(accepted.filter((name) => !page.includes(`\`${name}\``))).toEqual([]);
    });
  });

  /**
   * The watcher pages each kept a list of their own: "filter by connection
   * name", "by cache hit/miss", "by key pattern", "by query hash", "by IP
   * address", "by HTTP status code" and "by context" on pages whose filters
   * had none of them. They name their parameters now, and are read the same
   * way as the catalogue.
   */
  it.each(['log', 'query', 'graphql', 'exception', 'cache', 'request'])(
    "names only accepted filters in watchers/%s.md's list",
    (page) => {
      const text = readFileSync(join(DOCS, '..', 'watchers', `${page}.md`), 'utf8');
      const start = text.indexOf('### Filters Available');
      const section = text.slice(start, text.indexOf('\n## ', start));
      const lines = [...section.matchAll(/^- .*$/gm)].map((m) => m[0]);
      const names = lines.map((line) => line.match(/^- \*\*[^*]+\*\* \(`(\w+)`\)/)?.[1]);

      expect(start).toBeGreaterThan(0);
      expect(lines.length).toBeGreaterThan(0);
      expect(
        names.filter((name) => !name || (!accepted.includes(name) && !NOT_A_FILTER.has(name))),
      ).toEqual([]);
    },
  );

  it('finds the parameters it is checking', () => {
    // A regex that matched nothing would pass every case above.
    expect(parametersIn(read('filtering.md')).length).toBeGreaterThan(3);
  });
});
