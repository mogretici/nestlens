/**
 * Every dependency's install script has been reviewed.
 *
 * npm 12 runs a dependency's `preinstall`, `install` and `postinstall` only
 * when the project's `allowScripts` approves the package, and skips every
 * other one; npm 11 still runs them all and only warns. better-sqlite3's
 * install script is what fetches its native addon, so under npm 12 a missing
 * approval leaves SQLite storage without a binary while the install itself
 * succeeds.
 *
 * A lockfile marks each registry package that has one (`hasInstallScript`).
 * A local directory dependency is not marked, and npm runs its `prepare` as
 * well: the example installs NestLens from `file:..`, whose `prepare` sets up
 * the repository's git hooks. Each of those has an entry in the
 * `allowScripts` of the manifest beside it: `true` where the script does work
 * the package needs, `false` where the package works without it. Registry
 * entries carry no version: npm matches a pinned `pkg@1.2.3` against that
 * version only, so every Dependabot bump would drop the approval. Bundled
 * dependencies are left out, as npm never runs their scripts.
 *
 * Following AAA (Arrange-Act-Assert).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { lockedDirectories, ROOT } from './support/locked-directories';

interface LockedPackage {
  readonly resolved?: string;
  readonly hasInstallScript?: boolean;
  readonly inBundle?: boolean;
}

interface Manifest {
  readonly allowScripts?: Record<string, unknown>;
  readonly scripts?: Record<string, string>;
}

const INSTALL_SCRIPTS = ['preinstall', 'install', 'postinstall', 'prepare'];

interface Lockfile {
  readonly packages: Record<string, LockedPackage>;
}

const read = <T>(directory: string, file: string): T =>
  JSON.parse(readFileSync(join(ROOT, directory, file), 'utf8')) as T;

const allowScripts = (directory: string): Record<string, unknown> =>
  read<Manifest>(directory, 'package.json').allowScripts ?? {};

const isLocal = (entry: LockedPackage): boolean => entry.resolved?.startsWith('file:') ?? false;

/** Whether a local directory dependency declares a script npm runs on install. */
const localHasInstallScript = (directory: string, entry: LockedPackage): boolean => {
  const { scripts = {} } = read<Manifest>(
    join(directory, (entry.resolved ?? '').slice('file:'.length)),
    'package.json',
  );
  return INSTALL_SCRIPTS.some((name) => name in scripts);
};

/**
 * The packages in a lockfile that have an install script, each as allowScripts
 * names it: a registry package by its name, a local one by its `file:` spec.
 */
const withInstallScripts = (directory: string): string[] => [
  ...new Set(
    Object.entries(read<Lockfile>(directory, 'package-lock.json').packages)
      .filter(([path, entry]) => path !== '' && !entry.inBundle)
      .flatMap(([path, entry]): string[] => {
        if (isLocal(entry)) {
          return localHasInstallScript(directory, entry) ? [entry.resolved ?? ''] : [];
        }
        return entry.hasInstallScript
          ? [path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length)]
          : [];
      }),
  ),
];

describe('install scripts', () => {
  it('are found in the root lockfile, better-sqlite3 among them', () => {
    expect(withInstallScripts('.')).toContain('better-sqlite3');
  });

  it("are found in the example's NestLens, installed from the directory above", () => {
    expect(withInstallScripts('example')).toContain('file:..');
  });

  describe.each(lockedDirectories())('in %s', (directory) => {
    it('are each approved or denied in allowScripts', () => {
      const reviewed = Object.keys(allowScripts(directory));

      const unreviewed = withInstallScripts(directory).filter((name) => !reviewed.includes(name));

      expect(unreviewed).toEqual([]);
    });

    it('are the only packages allowScripts names', () => {
      const scripted = withInstallScripts(directory);

      const stale = Object.keys(allowScripts(directory)).filter((key) => !scripted.includes(key));

      expect(stale).toEqual([]);
    });

    it('are reviewed by name with a yes or a no', () => {
      const entries = Object.entries(allowScripts(directory));

      const malformed = entries.filter(([, value]) => typeof value !== 'boolean');

      expect(malformed).toEqual([]);
    });
  });

  it.each([
    ['.', 'better-sqlite3'],
    ['example', 'better-sqlite3'],
    ['dashboard', 'esbuild'],
  ])('in %s run for %s, which needs what its script builds', (directory, name) => {
    expect(allowScripts(directory)[name]).toBe(true);
  });
});
