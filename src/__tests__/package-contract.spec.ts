/**
 * Package contract guard.
 *
 * Regression guard for issue #10: `@nestjs/swagger` was imported at module
 * scope by `api.controller.ts` and `tag.controller.ts` while being declared
 * only as a devDependency. It resolved fine from this repo's own
 * `node_modules`, so every test and the example app passed — but any consumer
 * without `@nestjs/swagger` installed crashed at bootstrap with
 * `MODULE_NOT_FOUND`.
 *
 * The rule this enforces: every package a shipped source file imports at
 * module scope (i.e. one that survives TypeScript's type elision and becomes a
 * real `require`) must be declared in `dependencies` or `peerDependencies`.
 *
 * Packages that are genuinely optional must be loaded lazily inside a function
 * with `require`, so importing NestLens never pulls them in.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { builtinModules } from 'module';
import { join, relative, resolve } from 'path';
import { compatibility, majorOf, smoke } from './support/ci-matrix';

const SRC_ROOT = resolve(__dirname, '..');
const REPO_ROOT = resolve(SRC_ROOT, '..');

interface StaticImport {
  packageName: string;
  file: string;
}

const packageJson = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  engines?: { node?: string };
  main?: string;
  types?: string;
  exports?: Record<string, string | Record<string, string>>;
  typesVersions?: Record<string, Record<string, string[]>>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
};

const declaredPackages = new Set([
  ...Object.keys(packageJson.dependencies ?? {}),
  ...Object.keys(packageJson.peerDependencies ?? {}),
]);

/** Tests may reach for anything installed, including dev-only packages. */
const installablePackages = new Set([
  ...declaredPackages,
  ...Object.keys(packageJson.devDependencies ?? {}),
]);

// `builtinModules` lists `path`, never `node:path`, so the prefixed form of
// every builtin has to be accepted too.
const nodeBuiltins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);

const toPackageName = (specifier: string): string =>
  specifier.startsWith('@')
    ? specifier.split('/').slice(0, 2).join('/')
    : (specifier.split('/')[0] as string);

/**
 * File contents with comments removed.
 *
 * The collectors below match raw text, so a specifier written inside a comment
 * — an example in a doc block, a commented-out import — reads as a real
 * dependency. This spec's own documentation was the first false positive.
 */
const readCode = (file: string): string =>
  readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const isRelative = (specifier: string): boolean =>
  specifier.startsWith('.') || specifier.startsWith('@/');

const collectAllFiles = (dir: string, acc: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const fullPath = join(dir, name);
    if (statSync(fullPath).isDirectory()) {
      collectAllFiles(fullPath, acc);
      continue;
    }
    if (name.endsWith('.ts') && !name.endsWith('.d.ts')) acc.push(fullPath);
  }
  return acc;
};

const collectSourceFiles = (dir: string, acc: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const fullPath = join(dir, name);
    if (statSync(fullPath).isDirectory()) {
      // Tests are not published, so their imports are exempt.
      if (name !== '__tests__') collectSourceFiles(fullPath, acc);
      continue;
    }
    if (name.endsWith('.ts') && !name.endsWith('.d.ts')) acc.push(fullPath);
  }
  return acc;
};

/**
 * Matches module-scope imports that emit a runtime `require`.
 * `import type ...` is excluded: TypeScript erases it entirely.
 */
const collectStaticImports = (file: string): StaticImport[] => {
  const source = readCode(file);
  const pattern = /(?:^|\n)\s*import\s+(type\s+)?(?:[^;'"]*?\sfrom\s+)?['"]([^'"]+)['"]/g;
  const found: StaticImport[] = [];

  for (const match of source.matchAll(pattern)) {
    const [, typeOnly, specifier] = match;
    if (typeOnly || !specifier || isRelative(specifier)) continue;
    found.push({ packageName: toPackageName(specifier), file: relative(REPO_ROOT, file) });
  }

  return found;
};

/**
 * Type-only imports are erased at runtime, so the guard above rightly ignores
 * them — but they are not free. A type that reaches an exported declaration
 * ends up in the published `.d.ts`, and a consumer compiling against it needs
 * that package's types to resolve. `express` did: `NestLensRequest extends
 * Request` put `import type { Request } from 'express'` into the shipped
 * declarations, and any application without `@types/express` — every Fastify
 * one — failed to compile with TS7016 unless it had `skipLibCheck` on.
 */
const collectTypeImports = (file: string): StaticImport[] => {
  const source = readCode(file);
  const pattern = /(?:^|\n)\s*import\s+type\s+(?:[^;'"]*?\sfrom\s+)?['"]([^'"]+)['"]/g;
  const found: StaticImport[] = [];

  for (const match of source.matchAll(pattern)) {
    const [, specifier] = match;
    if (!specifier || isRelative(specifier)) continue;
    found.push({ packageName: toPackageName(specifier), file: relative(REPO_ROOT, file) });
  }

  return found;
};

/** `express` is typed by `@types/express`, `node` by `@types/node`, and so on. */
const typesPackageFor = (packageName: string): string =>
  packageName.startsWith('@')
    ? `@types/${packageName.slice(1).replace('/', '__')}`
    : `@types/${packageName}`;

/**
 * `await import('x')` and `require('x')` inside a function, which the two
 * collectors above deliberately ignore: in `src` a lazy require is how an
 * optional integration is meant to be loaded, but a test that reaches for a
 * package still needs that package installed.
 */
const collectDeferredImports = (file: string): StaticImport[] => {
  const source = readCode(file);
  const pattern = /\b(?:import|require)\(\s*['"]([^'"]+)['"]\s*\)/g;
  const found: StaticImport[] = [];

  for (const match of source.matchAll(pattern)) {
    const [, specifier] = match;
    if (!specifier || isRelative(specifier)) continue;
    found.push({ packageName: toPackageName(specifier), file: relative(REPO_ROOT, file) });
  }

  return found;
};

describe('package contract', () => {
  const sourceFiles = collectSourceFiles(SRC_ROOT);

  const testImports = (): StaticImport[] =>
    collectAllFiles(SRC_ROOT)
      .filter((file) => file.includes('__tests__'))
      .flatMap((file) => [
        ...collectStaticImports(file),
        ...collectTypeImports(file),
        ...collectDeferredImports(file),
      ]);

  it('finds source files to inspect', () => {
    expect(sourceFiles.length).toBeGreaterThan(0);
  });

  it('declares every package imported at module scope', () => {
    const undeclared = sourceFiles
      .flatMap(collectStaticImports)
      .filter(({ packageName }) => !nodeBuiltins.has(packageName))
      .filter(({ packageName }) => !declaredPackages.has(packageName));

    const report = undeclared.map((i) => `${i.packageName} (imported by ${i.file})`).sort();

    expect(report).toEqual([]);
  });

  it('declares the types every published declaration depends on', () => {
    const undeclared = collectSourceFiles(SRC_ROOT)
      .flatMap(collectTypeImports)
      .filter(({ packageName }) => !nodeBuiltins.has(packageName))
      .filter(
        ({ packageName }) =>
          !declaredPackages.has(packageName) && !declaredPackages.has(typesPackageFor(packageName)),
      );

    const report = undeclared.map((i) => `${i.packageName} (typed by ${i.file})`).sort();

    expect([...new Set(report)]).toEqual([]);
  });

  /**
   * The build inherits `sourceMap` and `declarationMap` from the base config,
   * which is right for working here and wrong for publishing: `files` ships
   * `dist` alone, so the maps point at `../src/*.ts` that is not in the package
   * and carry no inlined sources. 218 of them once shipped, 1.1 MB, resolvable
   * by nothing.
   */
  it('publishes no source maps that resolve to nothing', () => {
    const buildConfig = JSON.parse(
      readFileSync(join(REPO_ROOT, 'tsconfig.build.json'), 'utf8').replace(/^\s*\/\/.*$/gm, ''),
    ) as { compilerOptions?: { sourceMap?: boolean; declarationMap?: boolean } };

    expect(buildConfig.compilerOptions?.sourceMap).toBe(false);
    expect(buildConfig.compilerOptions?.declarationMap).toBe(false);
  });

  /**
   * Tests are exempt from the rule above — they are not published — but not from
   * being installable. A package present in this repo's `node_modules` without
   * being declared anywhere runs here and is missing on a fresh checkout: the
   * whole matrix failed on `ioredis-mock`'s types, which this machine happened
   * to have and CI did not.
   */
  it('declares every package the tests reach for', () => {
    const undeclared = testImports()
      .filter(({ packageName }) => !nodeBuiltins.has(packageName))
      .filter(
        ({ packageName }) =>
          !installablePackages.has(packageName) &&
          !installablePackages.has(typesPackageFor(packageName)),
      );

    const report = undeclared.map((i) => `${i.packageName} (used by ${i.file})`).sort();

    expect([...new Set(report)]).toEqual([]);
  });

  /**
   * Declaring the package is not enough when its types live somewhere else.
   * `ioredis-mock` ships no declarations; this machine happened to have
   * `@types/ioredis-mock` pulled in behind the scenes, so the suite compiled
   * here and failed on every job in the matrix. If the types are what makes a
   * test compile, they are a dependency like any other.
   */
  it('declares the separate type packages the tests compile against', () => {
    const missing = testImports()
      .filter(({ packageName }) => !nodeBuiltins.has(packageName))
      .filter(({ packageName }) => {
        const typesPackage = typesPackageFor(packageName);

        return (
          existsSync(join(REPO_ROOT, 'node_modules', typesPackage)) &&
          !installablePackages.has(typesPackage)
        );
      })
      .map((i) => `${typesPackageFor(i.packageName)} (needed by ${i.file})`);

    expect([...new Set(missing)].sort()).toEqual([]);
  });

  /**
   * `engines` is a promise about which runtimes are supported, and the CI
   * matrix is the evidence for it. They drifted once already: the matrix tested
   * Node 18 and 20 long after both went end-of-life while Node 24, the current
   * LTS, was never run at all.
   *
   * A version in `engines` that the matrix never exercises is untested, and a
   * version the matrix exercises that `engines` excludes is a job proving
   * something the package refuses to install on. `node: 22` resolves to the
   * newest 22.x, so the exact floor is run by a row of its own.
   */
  describe('the Node versions it claims are the ones it runs', () => {
    const floor = (packageJson.engines?.node ?? '').replace(/^>=\s*/, '');
    const matrix = compatibility();
    const lines = [...matrix.nodes, ...matrix.includedNodes].map(majorOf).sort((a, b) => a - b);

    it('names an exact floor', () => {
      expect(floor).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it("the oldest line the matrix runs is the floor's", () => {
      expect(matrix.nodes.length).toBeGreaterThan(1);
      expect(lines[0]).toBe(majorOf(floor));
    });

    it('a compatibility row runs the floor itself', () => {
      expect(matrix.includedNodes).toContain(floor);
    });

    /**
     * An `include` row whose Node is not on the axis becomes a job of its own
     * and gets only the keys it names, so it carries its NestJS's companions in
     * full or tests the devDependencies' instead.
     */
    it('the floor row pins the same companions as its NestJS', () => {
      const row = matrix.include.find((entry) => String(entry.node) === floor);
      const companions = matrix.include.find(
        (entry) => entry.node === undefined && String(entry.nestjs) === String(row?.nestjs),
      );

      expect(row).toBeDefined();
      expect(companions).toBeDefined();
      expect({ ...row, node: undefined }).toEqual({ ...companions, node: undefined });
    });

    /**
     * The smoke test is the only check of what npm serves, and it ran on Node
     * 22 alone. A dependency that installs there and is dropped on the newest
     * line — better-sqlite3 11 on Node 26 — passes it, so it runs on the exact
     * floor and on the newest line the matrix tests.
     */
    it('smokes the published package on the floor and on the newest line', () => {
      const { nodes, steps } = smoke();
      const setup = steps.find((step) => step.uses === './.github/actions/setup-node');

      expect(nodes).toEqual([floor, String(lines[lines.length - 1])]);
      expect(setup?.with?.['node-version']).toBe('${{ matrix.node }}');
    });
  });

  /**
   * An optional dependency is installed into every application that installs
   * NestLens, and the suite runs whatever the devDependency names. They had
   * drifted a major apart: the suite ran better-sqlite3 12 while the package
   * asked for `^11.6.0`, which has no prebuilt binary for Node 26 and does not
   * compile against its V8 — npm dropped it silently, and `nestlens/storage/sqlite`
   * failed to load in every fresh install on a Node the matrix called green.
   *
   * The peer range has to say the same. npm installs the optional copy whatever
   * the application has, so a peer range wider than that line promised majors
   * nothing installs by default and nothing tests.
   */
  describe('the optional dependencies are the line the suite tests', () => {
    /** `^12.11.1` → [12, 11, 1]; anything not in that form is reported, not guessed at. */
    const caret = (range: string | undefined): number[] | undefined => {
      const parts = range?.match(/^\^(\d+)\.(\d+)\.(\d+)$/);
      return parts ? parts.slice(1).map(Number) : undefined;
    };
    const atLeast = (version: number[], floor: number[]): boolean => {
      const index = version.findIndex((part, i) => part !== floor[i]);
      return index === -1 || (version[index] as number) > (floor[index] as number);
    };
    const optional = Object.entries(packageJson.optionalDependencies ?? {});

    it('there are some', () => {
      expect(optional.length).toBeGreaterThan(0);
    });

    it('each shares its major with the devDependency and admits its version', () => {
      const drift = optional
        .map(([name, range]) => {
          const tested = packageJson.devDependencies?.[name];
          const floor = caret(range);
          const version = caret(tested);
          const drifted = `${name}: optional ${range}, devDependency ${tested ?? 'missing'}`;

          if (floor === undefined || version === undefined) return drifted;

          return floor[0] === version[0] && atLeast(version, floor) ? undefined : drifted;
        })
        .filter((line): line is string => line !== undefined);

      expect(drift).toEqual([]);
    });

    it('a peer of the same name admits the tested version, on that major and no other', () => {
      const drift = optional
        .filter(([name]) => packageJson.peerDependencies?.[name] !== undefined)
        .map(([name, range]) => {
          const peer = packageJson.peerDependencies?.[name] as string;
          const alternatives = peer.split('||').map((part) => caret(part.trim()));
          const line = caret(range)?.[0];
          const tested = caret(packageJson.devDependencies?.[name]);

          return tested !== undefined &&
            alternatives.every((floor) => floor !== undefined && floor[0] === line) &&
            alternatives.some((floor) => floor !== undefined && atLeast(tested, floor))
            ? undefined
            : `${name}: peer ${peer}, optional ${range}`;
        })
        .filter((line): line is string => line !== undefined);

      expect(drift).toEqual([]);
    });
  });

  /**
   * The `exports` map is the published surface. Before it existed, every file
   * under `dist/` was importable, which meant 1.0's "the API is frozen" would
   * have frozen the build layout too — every internal service, reachable and
   * therefore promised.
   *
   * Now that the map decides, it has to stay true: an entry pointing at a file
   * that no longer exists is a consumer's `ERR_PACKAGE_PATH_NOT_EXPORTED` at
   * install time, and this repo cannot notice on its own because it never
   * imports itself by name.
   */
  describe('published entry points', () => {
    const exportsMap = packageJson.exports ?? {};

    /** `./dist/core/storage/redis.storage.js` → `src/core/storage/redis.storage.ts` */
    const sourceFor = (distPath: string): string =>
      join(REPO_ROOT, distPath.replace(/^\.\//, '').replace(/^dist\//, 'src/')).replace(
        /\.(js|d\.ts)$/,
        '.ts',
      );

    const subpathTargets = Object.entries(exportsMap).filter(
      ([subpath]) => subpath !== './package.json',
    );

    it('publishes a root entry point that matches main and types', () => {
      const root = exportsMap['.'];

      expect(typeof root).toBe('object');
      expect((root as Record<string, string>).default).toBe(`./${packageJson.main}`);
      expect((root as Record<string, string>).types).toBe(`./${packageJson.types}`);
    });

    it('has at least one subpath beyond the root, so the map is doing something', () => {
      expect(subpathTargets.length).toBeGreaterThan(1);
    });

    it.each(subpathTargets)('%s resolves to a file that exists', (_subpath, target) => {
      const paths = typeof target === 'string' ? [target] : Object.values(target);

      for (const path of paths) {
        expect({ path, exists: existsSync(sourceFor(path)) }).toEqual({ path, exists: true });
      }
    });

    /**
     * TypeScript ignores `exports` under the `node`/`node10` resolution that
     * NestJS's own tsconfig still uses, so a subpath without a `typesVersions`
     * entry resolves at runtime and fails to type-check — the worst of the two.
     */
    it('mirrors every subpath in typesVersions, for node10 type resolution', () => {
      const declared = Object.keys(packageJson.typesVersions?.['*'] ?? {}).sort();
      const expected = subpathTargets
        .map(([subpath]) => subpath.replace(/^\.\//, ''))
        .filter((subpath) => subpath !== '.')
        .sort();

      expect(declared).toEqual(expected);
    });
  });

  it('keeps optional integrations out of module-scope imports', () => {
    // These must stay lazily required so consumers without them can boot.
    const optionalOnly = ['@nestjs/swagger', '@nestjs/cache-manager', 'bullmq', '@nestjs/graphql'];

    const leaked = sourceFiles
      .flatMap(collectStaticImports)
      .filter(({ packageName }) => optionalOnly.includes(packageName))
      .map((i) => `${i.packageName} (imported by ${i.file})`);

    expect(leaked).toEqual([]);
  });

  /**
   * A package reached for at runtime but never declared is invisible: nothing
   * installs it, nothing warns when the installed version is one NestLens does
   * not work with, and the only symptom is a `MODULE_NOT_FOUND` in production.
   * `@nestjs/cache-manager` and `bullmq` sat in this gap — required by two
   * watchers, mentioned in the documentation, declared nowhere.
   *
   * Declaring them as optional peers is what makes `peerDependenciesMeta` mean
   * anything: npm ignores an entry there that is not also a peer dependency.
   */
  it('declares every lazily required package as an optional peer', () => {
    const optionalPeers = new Set(Object.keys(packageJson.peerDependenciesMeta ?? {}));
    const declaredPeers = new Set(Object.keys(packageJson.peerDependencies ?? {}));

    const undeclared = sourceFiles
      .flatMap(collectDeferredImports)
      .filter(({ packageName }) => !nodeBuiltins.has(packageName))
      // Reached through a package that is already a hard dependency of the
      // adapter, not something a consumer installs on purpose.
      .filter(({ packageName }) => packageName !== 'express')
      .filter(
        ({ packageName }) => !declaredPeers.has(packageName) || !optionalPeers.has(packageName),
      )
      .map((i) => `${i.packageName} (required by ${i.file})`);

    expect([...new Set(undeclared)].sort()).toEqual([]);
  });
});
