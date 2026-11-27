/**
 * A release leaves the dashboard and the example at the library's version,
 * lockfiles included.
 *
 * semantic-release bumps the root package and `sync-versions` copies the
 * version into `dashboard/package.json`, but the dashboard's lockfile records
 * the version too and nothing wrote it: after 0.17.0 it still said 0.16.0, so
 * the first `npm install` in the dashboard after every release changed a
 * tracked file nobody had touched.
 *
 * The example's lockfile has the same problem one level down. It installs the
 * library from `file:..`, and npm copies the library's manifest into the
 * `node_modules/nestlens` entry: its version, but also its dependency ranges,
 * engines and bin. Nothing wrote any of it, so the entry was found saying
 * 0.17.1, `node >=20` and `better-sqlite3 ^11` under a 0.18.0 that asks for
 * Node 22.13 and better-sqlite3 12 — and the example installed 11.10.0, a
 * better-sqlite3 the library no longer declares.
 *
 * `server.json`, the MCP Registry entry, records the version twice as well:
 * the entry's and the npm package's it lists. The registry refuses a version it
 * has already published, and the package version has to be one npm serves, so
 * an entry left behind fails the publish that follows the release.
 *
 * `packages/mcp`, the `nestlens-mcp` package, is released alongside at the same
 * version and depends on exactly that `nestlens`: a wrapper left at the old
 * version would be refused by npm as already published, and one pinned to the
 * old library would install a server without the release's changes.
 *
 * Following AAA (Arrange-Act-Assert).
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const ROOT = resolve(__dirname, '..', '..');
const readFrom = (root: string, path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(root, path), 'utf8')) as Record<string, unknown>;
const read = (path: string): Record<string, unknown> => readFrom(ROOT, path);

interface Lockfile {
  version: string;
  packages: Record<string, Record<string, unknown>>;
}

/**
 * The manifest fields npm 11 copies into a lockfile entry, as
 * `@npmcli/arborist/lib/shrinkwrap.js` lists them in `pkgMetaKeys`. The
 * underscored ones and `hasInstallScript` are derived at install time rather
 * than copied, so a manifest cannot be compared with them.
 */
const COPIED_FIELDS = [
  'version',
  'dependencies',
  'peerDependencies',
  'peerDependenciesMeta',
  'optionalDependencies',
  'bundleDependencies',
  'acceptDependencies',
  'funding',
  'engines',
  'os',
  'cpu',
  'libc',
  'license',
  'bin',
  'deprecated',
  'workspaces',
] as const;

/**
 * What npm writes for a field: nothing for an empty object, and for `license`
 * alone the type of a license object (arborist's metaFieldFromPkg) — a
 * `funding` object, say, is kept whole.
 */
const asLocked = (field: string, value: unknown): unknown => {
  if (!value) return undefined;
  if (typeof value !== 'object') return value;
  if (field === 'license' && 'type' in value && typeof value.type === 'string') return value.type;

  return Object.keys(value).length > 0 ? value : undefined;
};

const REGENERATE =
  'run `npm install nestlens@file:.. --package-lock-only --ignore-scripts` in example/ ' +
  '— a plain `npm install` leaves an existing file: entry as it is';

describe('the versions a release writes', () => {
  const version = read('package.json').version;

  it('gives the dashboard the library version', () => {
    expect(read('dashboard/package.json').version).toBe(version);
  });

  it('gives the dashboard lockfile the library version, at both places it records one', () => {
    const lock = read('dashboard/package-lock.json') as unknown as Lockfile;

    expect(lock.version).toBe(version);
    expect(lock.packages[''].version).toBe(version);
  });

  it.each(COPIED_FIELDS)(
    'records the library in the example lockfile as package.json has it: %s',
    (field) => {
      const manifest = read('package.json');
      const entry = (read('example/package-lock.json') as unknown as Lockfile).packages[
        'node_modules/nestlens'
      ];

      expect(entry, 'example/package-lock.json has no node_modules/nestlens').toBeDefined();
      expect(entry[field], REGENERATE).toEqual(asLocked(field, manifest[field]));
    },
  );

  it('gives the MCP Registry entry the library version, at both places it records one', () => {
    const server = read('server.json') as { version: string; packages: { version: string }[] };

    expect(server.version).toBe(version);
    expect(server.packages.map((entry) => entry.version)).toEqual([version]);
  });

  it('commits both lockfiles and the registry entry with the release', () => {
    const config = read('.releaserc.json') as { plugins: unknown[] };
    const git = config.plugins.find(
      (plugin): plugin is [string, { assets: string[] }] =>
        Array.isArray(plugin) && plugin[0] === '@semantic-release/git',
    );

    expect(git?.[1].assets).toEqual(
      expect.arrayContaining([
        'dashboard/package.json',
        'dashboard/package-lock.json',
        'example/package-lock.json',
        'server.json',
        'packages/mcp/package.json',
      ]),
    );
  });
});

/**
 * The script itself, run the way semantic-release runs it: after the root
 * package has been bumped, from the repository root. The lockfiles are this
 * repository's own, so a field the script forgets is a field the real ones
 * carry.
 */
describe('sync-versions', () => {
  const run = (): { readonly root: string; readonly cleanup: () => void } => {
    const root = mkdtempSync(join(tmpdir(), 'nestlens-sync-versions-'));
    mkdirSync(join(root, 'dashboard'));
    mkdirSync(join(root, 'example'));
    mkdirSync(join(root, 'scripts'));
    mkdirSync(join(root, 'packages', 'mcp'), { recursive: true });
    for (const path of [
      'scripts/sync-versions.mjs',
      'dashboard/package.json',
      'dashboard/package-lock.json',
      'example/package-lock.json',
      'server.json',
      'packages/mcp/package.json',
    ]) {
      cpSync(join(ROOT, path), join(root, path));
    }
    writeFileSync(
      join(root, 'package.json'),
      `${JSON.stringify({ ...read('package.json'), version: '99.1.2' }, null, 2)}\n`,
    );

    execFileSync(process.execPath, ['scripts/sync-versions.mjs'], { cwd: root });

    return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
  };

  it('writes the new version into the registry entry, at both places, and nothing else', () => {
    const { root, cleanup } = run();

    try {
      const before = read('server.json') as { packages: Record<string, unknown>[] };

      expect(readFrom(root, 'server.json')).toEqual({
        ...before,
        version: '99.1.2',
        packages: before.packages.map((entry) => ({ ...entry, version: '99.1.2' })),
      });
    } finally {
      cleanup();
    }
  });

  it('releases nestlens-mcp at the new version, depending on exactly it, and nothing else', () => {
    const { root, cleanup } = run();

    try {
      const before = read('packages/mcp/package.json') as {
        dependencies: Record<string, string>;
      };

      expect(readFrom(root, 'packages/mcp/package.json')).toEqual({
        ...before,
        version: '99.1.2',
        dependencies: { ...before.dependencies, nestlens: '99.1.2' },
      });
    } finally {
      cleanup();
    }
  });

  it('writes nestlens-mcp in the format it is committed in', () => {
    const { root, cleanup } = run();

    try {
      const written = readFileSync(join(root, 'packages/mcp/package.json'), 'utf8');
      const original = readFileSync(join(ROOT, 'packages/mcp/package.json'), 'utf8');

      expect(written).toBe(
        original
          .replace(/^( {2}"version": )"[^"]+"/m, '$1"99.1.2"')
          .replace(/^( {4}"nestlens": )"[^"]+"/m, '$1"99.1.2"'),
      );
    } finally {
      cleanup();
    }
  });

  it('writes the registry entry in the format it is committed in', () => {
    const { root, cleanup } = run();

    try {
      const written = readFileSync(join(root, 'server.json'), 'utf8');
      const original = readFileSync(join(ROOT, 'server.json'), 'utf8');

      expect(written).toBe(original.replace(/("version": )"[^"]+"/g, '$1"99.1.2"'));
    } finally {
      cleanup();
    }
  });

  it('writes the new version into the dashboard and the example, and nothing else', () => {
    const { root, cleanup } = run();

    try {
      const dashboard = readFrom(root, 'dashboard/package-lock.json') as unknown as Lockfile;
      const example = readFrom(root, 'example/package-lock.json') as unknown as Lockfile;
      const before = read('example/package-lock.json') as unknown as Lockfile;

      expect(readFrom(root, 'dashboard/package.json').version).toBe('99.1.2');
      expect(dashboard.version).toBe('99.1.2');
      expect(dashboard.packages[''].version).toBe('99.1.2');
      expect(example.packages['node_modules/nestlens'].version).toBe('99.1.2');
      expect(example).toEqual({
        ...before,
        packages: {
          ...before.packages,
          'node_modules/nestlens': {
            ...before.packages['node_modules/nestlens'],
            version: '99.1.2',
          },
        },
      });
    } finally {
      cleanup();
    }
  });

  it('writes the example lockfile byte for byte as npm does', () => {
    const { root, cleanup } = run();

    try {
      const written = readFileSync(join(root, 'example/package-lock.json'), 'utf8');
      const original = readFileSync(join(ROOT, 'example/package-lock.json'), 'utf8');

      expect(written).not.toBe(original);
      expect(written).toBe(
        original.replace(/("node_modules\/nestlens": \{\n {6}"version": )"[^"]+"/, '$1"99.1.2"'),
      );
    } finally {
      cleanup();
    }
  });
});
