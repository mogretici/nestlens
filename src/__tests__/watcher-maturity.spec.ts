/**
 * Every watcher is classified, and the classification is the published one.
 *
 * `1.0` promises that the stable watchers do not change without a major
 * release, and says plainly that the opt-in ones attach to libraries NestLens
 * does not control and can break when those libraries move. A promise like that
 * is only worth something if it covers everything: a watcher added later and
 * never classified would inherit whichever guarantee the reader assumed.
 *
 * So the two lists in the documentation are compared against the watchers the
 * configuration actually accepts. Adding a watcher without saying which kind it
 * is fails here, by name.
 *
 * Following AAA (Arrange-Act-Assert).
 */
import { readFileSync } from 'fs';
import { join, resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '..', '..');
const POLICY = join(REPO_ROOT, 'docs', 'docs', 'getting-started', 'versioning-and-support.md');
const CONFIG = join(REPO_ROOT, 'src', 'nestlens.config.ts');

/** The keys `watchers: { … }` accepts, read from the type consumers compile against. */
const configuredWatchers = (): string[] => {
  const source = readFileSync(CONFIG, 'utf8');
  const start = source.indexOf('  watchers?: {');
  const end = source.indexOf('\n  };', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);

  return [...source.slice(start, end).matchAll(/^\s{4}(\w+)\?:/gm)].map(
    (match) => match[1] as string,
  );
};

/** The watchers named in a section of the policy, written as `` `name` `` lists. */
const documentedWatchers = (heading: string): string[] => {
  const document = readFileSync(POLICY, 'utf8');
  const start = document.indexOf(heading);
  expect(start).toBeGreaterThan(-1);

  const section = document.slice(start, document.indexOf('###', start + heading.length));

  return [...section.matchAll(/`(\w+)`/g)].map((match) => match[1] as string);
};

describe('watcher maturity', () => {
  const configured = configuredWatchers();
  const stable = documentedWatchers('### Stable — under the 1.0 guarantee');
  const optIn = documentedWatchers('### Opt-in — depends on a third-party library');

  it('reads the watchers the configuration accepts', () => {
    expect(configured.length).toBeGreaterThan(10);
    expect(configured).toContain('request');
  });

  it('classifies every watcher exactly once', () => {
    const classified = [...stable, ...optIn].sort();

    expect(classified).toEqual([...new Set(classified)].sort());
    expect(classified).toEqual([...configured].sort());
  });

  /**
   * The stable list is what the 1.0 guarantee covers, so it cannot quietly grow
   * to include something that wraps a third-party library.
   */
  it('keeps the guarantee on the watchers that read from NestJS itself', () => {
    expect([...stable].sort()).toEqual(['exception', 'graphql', 'log', 'query', 'request']);
  });
});
