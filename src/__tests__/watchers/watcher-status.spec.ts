/**
 * Every entry type has a watcher that can say whether it is recording.
 *
 * An enabled watcher with nothing to observe records nothing, and its tab looks
 * like a quiet system: a production application had its Redis, HTTP client and
 * Logs tabs empty for months. The status is what says so, and a watcher added
 * without one would bring the silence back for its own tab.
 *
 * Following AAA (Arrange-Act-Assert).
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { ENTRY_TYPES } from '../../types';
import { WATCHER_STATUS_REGISTRY } from '../../watchers/watcher-status.registry';
import { WATCHER_STATES, hostWatcherStatus } from '../../watchers/watcher-status';

const ROOT = resolve(__dirname, '..', '..', '..');
const DOCS = join(ROOT, 'docs', 'docs');
const WATCHERS = join(ROOT, 'src', 'watchers');

const sources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sources(join(dir, entry.name))
      : entry.name.endsWith('.ts')
        ? [readFileSync(join(dir, entry.name), 'utf8')]
        : [],
  );

/**
 * Every fix link a status can carry, read from the source: a status a test
 * does not reach still sends a reader somewhere.
 */
const fixLinks = (): string[] =>
  sources(WATCHERS).flatMap((source) => [
    ...[...source.matchAll(/watcherDocs\(\s*'([^']+)'\s*\)/g)].map((match) => match[1]),
    ...[...source.matchAll(/page: '([^']+)',\s*section: '([^']+)'/g)].map(
      (match) => `${match[1]}#${match[2]}`,
    ),
  ]);

/** The anchor Docusaurus gives a heading: github-slugger's rule, or an explicit `{#id}`. */
const anchorsOf = (page: string): Set<string> =>
  new Set(
    [...readFileSync(join(DOCS, `${page}.md`), 'utf8').matchAll(/^#{2,6} (.+)$/gm)].map(
      ([, heading]) => {
        const explicit = /\{#([^}]+)\}\s*$/.exec(heading);
        if (explicit) return explicit[1];

        return heading
          .replace(/`/g, '')
          .trim()
          .toLowerCase()
          .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
          .replace(/ /g, '-');
      },
    ),
  );

describe('the watcher status registry', () => {
  it('has a source for every entry type', () => {
    // Act
    const missing = ENTRY_TYPES.filter((type) => !(type in WATCHER_STATUS_REGISTRY));

    // Assert
    expect(missing).toEqual([]);
  });

  it('names nothing that is not an entry type', () => {
    expect(Object.keys(WATCHER_STATUS_REGISTRY).sort()).toEqual([...ENTRY_TYPES].sort());
  });

  it.each(ENTRY_TYPES.map((type) => [type]))('has a %s reporter that reports', (type) => {
    // Arrange
    const { reporter } = WATCHER_STATUS_REGISTRY[type];

    // Assert
    expect(typeof (reporter.prototype as { watcherStatus?: unknown }).watcherStatus).toBe(
      'function',
    );
  });

  it.each(ENTRY_TYPES.map((type) => [type]))('names a %s page that exists', (type) => {
    expect(existsSync(join(DOCS, `${WATCHER_STATUS_REGISTRY[type].page}.md`))).toBe(true);
  });
});

describe('the fix links', () => {
  const links = fixLinks();

  it('finds the links it checks', () => {
    // A scan that matches nothing passes. Every watcher links its page at least.
    expect(links.length).toBeGreaterThanOrEqual(ENTRY_TYPES.length);
  });

  it.each(fixLinks().map((link) => [link]))('%s names a page and a heading that exist', (link) => {
    // Arrange
    const [page, anchor] = link.split('#');

    // Assert
    expect(existsSync(join(DOCS, `${page}.md`))).toBe(true);
    if (anchor !== undefined) expect([...anchorsOf(page)]).toContain(anchor);
  });
});

describe('every NestLens link in a message the library prints', () => {
  const SRC = join(ROOT, 'src');
  const README_SLUGS = new Set(
    [...readFileSync(join(ROOT, 'README.md'), 'utf8').matchAll(/^#{1,6} (.+)$/gm)].map(([, h]) =>
      h
        .replace(/`/g, '')
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
        .replace(/ /g, '-'),
    ),
  );

  /** Library sources, not the specs, which name made-up links on purpose. */
  const library = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.name === '__tests__'
        ? []
        : entry.isDirectory()
          ? library(join(dir, entry.name))
          : entry.name.endsWith('.ts')
            ? [readFileSync(join(dir, entry.name), 'utf8')]
            : [],
    );

  const links = library(SRC).flatMap((source) =>
    [
      ...source.matchAll(
        /https:\/\/(?:nestlens-docs\.vercel\.app\/docs\/[\w/-]+(?:#[\w-]+)?|github\.com\/mogretici\/nestlens#[\w-]+)/g,
      ),
    ].map(([url]) => url),
  );

  it('finds the links it checks', () => {
    expect(links.length).toBeGreaterThan(0);
  });

  it.each(links.map((url) => [url]))('%s lands on a heading that exists', (url) => {
    const readme = /^https:\/\/github\.com\/mogretici\/nestlens#(.+)$/.exec(url);
    if (readme) {
      expect([...README_SLUGS]).toContain(readme[1]);
      return;
    }

    const [page, anchor] = url.replace('https://nestlens-docs.vercel.app/docs/', '').split('#');
    expect(existsSync(join(DOCS, `${page}.md`))).toBe(true);
    if (anchor !== undefined) expect([...anchorsOf(page)]).toContain(anchor);
  });
});

describe('a host watcher status', () => {
  const facts = {
    enabled: true,
    page: 'watchers/redis',
    section: 'provide-redis-client-to-nestlens',
    missing: 'Nothing is provided.',
  };

  it('is off when switched off, whatever else is true', () => {
    expect(hostWatcherStatus({ ...facts, enabled: false, recording: 'yes' }).state).toBe('off');
  });

  it('is recording when something is installed', () => {
    expect(hostWatcherStatus({ ...facts, recording: 'Recording.' })).toEqual({
      state: 'recording',
      reason: 'Recording.',
      docs: 'https://nestlens-docs.vercel.app/docs/watchers/redis#provide-redis-client-to-nestlens',
    });
  });

  it('is waiting when what was handed over could not be wrapped', () => {
    expect(hostWatcherStatus({ ...facts, unusable: 'Nothing to wrap.' }).state).toBe('waiting');
  });

  it('is waiting when nothing was handed over', () => {
    expect(hostWatcherStatus(facts).state).toBe('waiting');
  });

  it('is manual for a watcher whose manual API records call by call', () => {
    expect(hostWatcherStatus({ ...facts, whenMissing: 'manual' }).state).toBe('manual');
  });
});

describe('the documentation of watcher states', () => {
  const overview = readFileSync(join(DOCS, 'watchers', 'overview.md'), 'utf8');

  it.each(WATCHER_STATES.map((state) => [state]))('describes the %s state', (state) => {
    expect(overview).toContain(`| \`${state}\` |`);
  });
});
