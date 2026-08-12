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
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { builtinModules } from 'module';
import { join, relative, resolve } from 'path';

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
  engines?: { node?: string };
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
   * something the package refuses to install on.
   */
  it('tests every Node version it claims to support, and claims every one it tests', () => {
    const workflow = readFileSync(join(REPO_ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
    const matrix = workflow.match(/^\s*node:\s*\[([^\]]+)\]/m)?.[1];
    expect(matrix).toBeDefined();

    const tested = (matrix as string)
      .split(',')
      .map((value) => Number.parseInt(value.trim(), 10))
      .sort((a, b) => a - b);
    const minimum = Number.parseInt(
      (packageJson.engines?.node ?? '').replace(/[^\d.]/g, '').split('.')[0] as string,
      10,
    );

    expect(tested.length).toBeGreaterThan(0);
    expect(Number.isNaN(minimum)).toBe(false);
    // The floor of the matrix is what `engines` may promise: anything lower is
    // a claim nothing backs.
    expect(tested[0]).toBe(minimum);
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
});
