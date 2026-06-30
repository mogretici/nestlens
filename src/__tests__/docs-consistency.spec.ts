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
