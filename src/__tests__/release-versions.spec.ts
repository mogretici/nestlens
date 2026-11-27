/**
 * A release leaves the dashboard at the library's version, lockfile included.
 *
 * semantic-release bumps the root package and `sync-versions` copies the
 * version into `dashboard/package.json`, but the dashboard's lockfile records
 * the version too and nothing wrote it: after 0.17.0 it still said 0.16.0, so
 * the first `npm install` in the dashboard after every release changed a
 * tracked file nobody had touched.
 *
 * Following AAA (Arrange-Act-Assert).
 */
import { readFileSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(__dirname, '..', '..');
const read = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(ROOT, path), 'utf8')) as Record<string, unknown>;

describe('the versions a release writes', () => {
  const version = read('package.json').version;

  it('gives the dashboard the library version', () => {
    expect(read('dashboard/package.json').version).toBe(version);
  });

  it('gives the dashboard lockfile the library version, at both places it records one', () => {
    const lock = read('dashboard/package-lock.json') as {
      version: string;
      packages: Record<string, { version?: string }>;
    };

    expect(lock.version).toBe(version);
    expect(lock.packages[''].version).toBe(version);
  });

  it('commits the dashboard lockfile with the release', () => {
    const config = read('.releaserc.json') as { plugins: unknown[] };
    const git = config.plugins.find(
      (plugin): plugin is [string, { assets: string[] }] =>
        Array.isArray(plugin) && plugin[0] === '@semantic-release/git',
    );

    expect(git?.[1].assets).toEqual(
      expect.arrayContaining(['dashboard/package.json', 'dashboard/package-lock.json']),
    );
  });
});
