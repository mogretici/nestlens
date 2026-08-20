/**
 * Documentation consistency guard.
 *
 * The docs drifted from the code in the past (e.g. "18 watchers" while the code
 * had 19, "SQLite by default" while the default is in-memory). This test ties the
 * drift-prone, code-derivable facts back to the source of truth so the docs cannot
 * silently fall out of sync again — if someone adds a watcher or changes a default,
 * this test fails until the docs are updated.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { DEFAULT_CONFIG } from '../nestlens.config';
import { GRAPHQL_DEFAULTS } from '../watchers/graphql/types';

const REPO_ROOT = join(__dirname, '..', '..');
const docsDir = join(REPO_ROOT, 'docs', 'docs');

function readDoc(relPath: string): string {
  const full = join(docsDir, relPath);
  return readFileSync(full, 'utf8');
}

describe('Documentation consistency with code', () => {
  // The canonical watcher set, derived from the code (not hard-coded here).
  const watcherKeys = Object.keys(DEFAULT_CONFIG.watchers ?? {});
  const watcherCount = watcherKeys.length;

  it('has a non-trivial, code-derived watcher count', () => {
    // Sanity: guards against an empty/partial DEFAULT_CONFIG breaking the asserts below.
    expect(watcherCount).toBeGreaterThanOrEqual(19);
  });

  describe('watcher count is documented correctly', () => {
    it('intro.md states the correct watcher count and not the old "18"', () => {
      const intro = readDoc('intro.md');
      expect(intro).toContain(`${watcherCount} watchers`);
      expect(intro).not.toMatch(/18 watchers/);
    });

    it('basic-config.md lists every watcher key from the code', () => {
      const basicConfig = readDoc('configuration/basic-config.md');
      const missing = watcherKeys.filter((key) => !basicConfig.includes(`${key}:`));
      expect(missing).toEqual([]);
    });
  });

  describe('default storage driver is documented correctly', () => {
    it("the code default is 'memory'", () => {
      expect(DEFAULT_CONFIG.storage?.driver).toBe('memory');
    });

    it('watchers/overview.md does not claim SQLite is the default', () => {
      const overview = readDoc('watchers/overview.md');
      expect(overview).not.toMatch(/SQLite by default/i);
    });
  });

  describe('rate limiting default is documented correctly', () => {
    it('the code default is disabled (false)', () => {
      expect(DEFAULT_CONFIG.rateLimit).toBe(false);
    });
  });

  describe('no stale numbers linger', () => {
    it('the old hard-coded test count is gone from intro.md', () => {
      const intro = readDoc('intro.md');
      expect(intro).not.toMatch(/1,312 tests/);
    });
  });

  /**
   * `maxResponseSize` was documented as "maximum response size to capture" and
   * nothing else, so raising it looked free. Someone set it to 5MB in
   * production, where every captured response of that size blocked the event
   * loop for tens of milliseconds. The option is only safe to expose if the
   * page exposing it says what it costs.
   */
  describe('the cost of raising maxResponseSize is documented', () => {
    const graphql = () => readDoc('watchers/graphql.md');

    it('states the default in bytes', () => {
      const { maxResponseSize } = GRAPHQL_DEFAULTS;
      expect(maxResponseSize).toBe(65536);
      expect(graphql()).toContain(`\`${maxResponseSize}\``);
    });

    it('carries measured per-operation costs rather than an adjective', () => {
      const doc = graphql();

      expect(doc).toMatch(/cost per operation/i);
      // The rows the table is useless without: the small case and the one that
      // caused the incident.
      expect(doc).toMatch(/70 KB/);
      expect(doc).toMatch(/4900 KB/);
      expect(doc).toMatch(/~27 ms/);
    });

    it('points at the benchmark that produced the figures', () => {
      expect(graphql()).toContain('benchmark:sanitizer');
    });
  });

  /**
   * The one change in 0.10.0 a user can see without reading the release notes:
   * a field that used to arrive as `***` now arrives readable.
   */
  describe('the narrowed GraphQL variable masking is documented', () => {
    const graphql = () => readDoc('watchers/graphql.md');

    it('says a term matches whole words', () => {
      expect(graphql()).toMatch(/matches whole words/i);
    });

    it('keeps the example of a name that no longer masks', () => {
      expect(graphql()).toContain('tokenCount');
    });
  });

  describe('referenced docs exist', () => {
    it.each([
      'getting-started/installation.md',
      'configuration/basic-config.md',
      'watchers/overview.md',
      'watchers/schedule.md',
      'dashboard/keyboard-shortcuts.md',
      'dashboard/navigation.md',
    ])('%s exists', (relPath) => {
      expect(existsSync(join(docsDir, relPath))).toBe(true);
    });
  });
});
