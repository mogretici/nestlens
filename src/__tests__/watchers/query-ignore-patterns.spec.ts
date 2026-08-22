/**
 * Which queries a configured pattern hides.
 *
 * `ignorePatterns` is a list of regular expressions a user writes, and it was
 * tested with `pattern.test(query)`. A `RegExp` carrying `g` or `y` remembers
 * where its last match ended and `test` resumes from there, so
 * `ignorePatterns: [/health/g]` hid every *other* health check and recorded
 * the ones in between:
 *
 *     test('SELECT 1')  true, false, true, false, …
 *
 * The flag is one character, and nothing about the outcome says it was the
 * cause — the list simply half-works.
 */
import { DiscoveryService } from '@nestjs/core';
import { CollectorService } from '../../core/collector.service';
import { QueryWatcher, QueryData } from '../../watchers/query/query.watcher';
import { NestLensConfig } from '../../nestlens.config';
import { QueryEntry } from '../../types';

/** Runs queries through the watcher and returns the ones it kept. */
const recorded = (ignorePatterns: RegExp[] | undefined, queries: string[]): string[] => {
  const kept: string[] = [];
  const collector = {
    collect: (_type: string, payload: QueryEntry['payload']) => {
      kept.push(payload.query);
    },
  } as unknown as CollectorService;

  const watcher = new QueryWatcher(
    collector,
    { getProviders: () => [] } as unknown as DiscoveryService,
    { watchers: { query: { ignorePatterns } } } as NestLensConfig,
  );

  const handle = (watcher as unknown as { handleQuery(data: QueryData): void }).handleQuery.bind(
    watcher,
  );

  for (const query of queries) {
    handle({ query, duration: 1, source: 'typeorm' });
  }

  return kept;
};

describe('ignoring queries by pattern', () => {
  it('records everything when no pattern is configured', () => {
    expect(recorded(undefined, ['SELECT 1', 'SELECT 2'])).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('hides what a pattern names', () => {
    expect(recorded([/health/], ['SELECT health', 'SELECT orders'])).toEqual(['SELECT orders']);
  });

  it('hides every one of them, not every other one', () => {
    // Four identical queries, one global pattern.
    const kept = recorded(
      [/health/g],
      ['SELECT health', 'SELECT health', 'SELECT health', 'SELECT health'],
    );

    expect(kept).toEqual([]);
  });

  it('is not confused by a sticky pattern either', () => {
    const kept = recorded([/SELECT/y], ['SELECT a', 'SELECT b', 'SELECT c']);

    expect(kept).toEqual([]);
  });

  it('keeps a query no pattern covers, whatever the flags', () => {
    const kept = recorded([/health/g], ['SELECT orders', 'SELECT health', 'SELECT items']);

    expect(kept).toEqual(['SELECT orders', 'SELECT items']);
  });

  it('takes any one of several patterns', () => {
    const kept = recorded([/health/g, /ping/g], ['SELECT health', 'SELECT ping', 'SELECT real']);

    expect(kept).toEqual(['SELECT real']);
  });

  it('records everything when the list is empty', () => {
    expect(recorded([], ['SELECT 1'])).toEqual(['SELECT 1']);
  });
});
