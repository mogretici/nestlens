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
import { readdirSync, readFileSync, statSync } from 'fs';
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
  peerDependencies?: Record<string, string>;
};

const declaredPackages = new Set([
  ...Object.keys(packageJson.dependencies ?? {}),
  ...Object.keys(packageJson.peerDependencies ?? {}),
]);

const nodeBuiltins = new Set(builtinModules);

const toPackageName = (specifier: string): string =>
  specifier.startsWith('@')
    ? specifier.split('/').slice(0, 2).join('/')
    : (specifier.split('/')[0] as string);

const isRelative = (specifier: string): boolean =>
  specifier.startsWith('.') || specifier.startsWith('@/');

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
  const source = readFileSync(file, 'utf8');
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
  const source = readFileSync(file, 'utf8');
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

describe('package contract', () => {
  const sourceFiles = collectSourceFiles(SRC_ROOT);

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
