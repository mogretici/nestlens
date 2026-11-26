/**
 * The Jest transform that compiles ESM-only dependencies to CommonJS.
 *
 * NestJS 12 ships every `@nestjs/*` package as ESM only. Node loads them from
 * CommonJS through `require(esm)`; Jest's module runtime does not, and 181 of
 * 215 suites failed on `Cannot use import statement outside a module` until
 * this transform existed. It has to be a no-op on NestJS 9, 10 and 11, where
 * nothing it is asked about is ESM, and it has to keep the semantics of the
 * code it rewrites — two `@nestjs/*` 12 files declare
 * `const require = createRequire(import.meta.url)`, which a straight compile
 * turns into `Cannot access 'require' before initialization`.
 *
 * Following AAA (Arrange-Act-Assert).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';

interface TransformOptions {
  readonly configString: string;
}

interface Transformer {
  process(source: string, filename: string, options: TransformOptions): { code: string };
  getCacheKey(source: string, filename: string, options: TransformOptions): string;
}

const { createTransformer } = require('../../jest/esm-to-commonjs.js') as {
  createTransformer(): Transformer;
};

const OPTIONS: TransformOptions = { configString: '{}' };

/** Runs compiled code the way Jest's module wrapper does, and returns its exports. */
const run = (code: string, filename: string): Record<string, unknown> => {
  const module = { exports: {} as Record<string, unknown> };
  const evaluate = new Function('module', 'exports', 'require', '__dirname', '__filename', code);
  evaluate(module, module.exports, createRequire(filename), join(filename, '..'), filename);
  return module.exports;
};

describe('ESM to CommonJS transform for Jest', () => {
  let root: string;

  const writePackage = (dir: string, manifest: Record<string, unknown>): void => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest));
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'nestlens-esm-transform-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('leaves a file from a CommonJS package exactly as it was', () => {
    // Arrange — every package on NestJS 9 to 11 looks like this.
    writePackage(join(root, 'cjs'), { name: 'cjs' });
    const filename = join(root, 'cjs', 'index.js');
    const source = 'module.exports = { answer: 42 };\n';

    // Act
    const { code } = createTransformer().process(source, filename, OPTIONS);

    // Assert
    expect(code).toBe(source);
  });

  it('compiles a file from a "type": "module" package to CommonJS that runs', () => {
    // Arrange
    writePackage(join(root, 'esm'), { name: 'esm', type: 'module' });
    const filename = join(root, 'esm', 'index.js');
    const source = [
      "import { basename } from 'node:path';",
      'export const name = basename("/a/b.txt");',
      'export default function greet() { return "hi"; }',
    ].join('\n');

    // Act
    const { code } = createTransformer().process(source, filename, OPTIONS);
    const exports = run(code, filename);

    // Assert
    expect(exports.name).toBe('b.txt');
    expect((exports.default as () => string)()).toBe('hi');
  });

  it('treats .mjs as ESM whatever the package says', () => {
    // Arrange
    writePackage(join(root, 'mixed'), { name: 'mixed', type: 'commonjs' });
    const filename = join(root, 'mixed', 'index.mjs');

    // Act
    const { code } = createTransformer().process('export const x = 1;', filename, OPTIONS);

    // Assert
    expect(run(code, filename).x).toBe(1);
  });

  it('lets the nearest package.json decide, as Node does', () => {
    // Arrange — a CommonJS build nested inside an ESM package.
    writePackage(join(root, 'dual'), { name: 'dual', type: 'module' });
    writePackage(join(root, 'dual', 'cjs'), { type: 'commonjs' });
    const filename = join(root, 'dual', 'cjs', 'index.js');
    const source = 'exports.x = 1;\n';

    // Act
    const { code } = createTransformer().process(source, filename, OPTIONS);

    // Assert
    expect(code).toBe(source);
  });

  it('keeps a module that declares its own require working', () => {
    // Arrange — the shape of `@nestjs/mapped-types` and `@nestjs/typeorm` 12.
    writePackage(join(root, 'esm'), { name: 'esm', type: 'module' });
    const filename = join(root, 'esm', 'helpers.js');
    const source = [
      "import { createRequire } from 'node:module';",
      'const require = createRequire(import.meta.url);',
      "export const sep = require('node:path').sep;",
      'export function load(name) { return require(name); }',
      'export const local = { require };',
    ].join('\n');

    // Act
    const { code } = createTransformer().process(source, filename, OPTIONS);
    const exports = run(code, filename);

    // Assert
    expect(exports.sep).toBe(require('path').sep);
    expect((exports.load as (name: string) => unknown)('node:os')).toBe(require('os'));
    expect(typeof (exports.local as { require: unknown }).require).toBe('function');
  });

  it('does not collide with the names the CommonJS wrapper declares', () => {
    // Arrange — legal in a module, a redeclaration inside Jest's wrapper.
    writePackage(join(root, 'esm'), { name: 'esm', type: 'module' });
    const filename = join(root, 'esm', 'names.js');
    const source = [
      'const module = "m";',
      'let exports = "e";',
      'const __dirname = "d";',
      'class __filename {}',
      'export { module, exports };',
      'export const both = module + exports + __dirname + typeof __filename;',
    ].join('\n');

    // Act
    const { code } = createTransformer().process(source, filename, OPTIONS);
    const exports = run(code, filename);

    // Assert
    expect(exports.module).toBe('m');
    expect(exports.exports).toBe('e');
    expect(exports.both).toBe('medfunction');
  });

  it('keeps the key of a destructured property with one of those names', () => {
    // Arrange — `const { providers, exports } = relatedModule` in @nestjs/core 12.
    writePackage(join(root, 'esm'), { name: 'esm', type: 'module' });
    const filename = join(root, 'esm', 'destructure.js');
    const source = [
      'const ref = { exports: new Set([1]), require: 2 };',
      'const { exports, require: loader } = ref;',
      'export const size = exports.size;',
      'export const both = loader;',
    ].join('\n');

    // Act
    const { code } = createTransformer().process(source, filename, OPTIONS);
    const exports = run(code, filename);

    // Assert
    expect(exports.size).toBe(1);
    expect(exports.both).toBe(2);
  });

  it('still reads an import bound to one of those names', () => {
    // Arrange
    writePackage(join(root, 'esm'), { name: 'esm', type: 'module' });
    const filename = join(root, 'esm', 'imports.js');
    const source = [
      "import * as module from 'node:path';",
      "import { createRequire as require } from 'node:module';",
      'export const sep = module.sep;',
      'export const make = require;',
    ].join('\n');

    // Act
    const { code } = createTransformer().process(source, filename, OPTIONS);
    const exports = run(code, filename);

    // Assert
    expect(exports.sep).toBe(require('path').sep);
    expect(exports.make).toBe(createRequire);
  });

  it('refuses an exported declaration with one of those names rather than miscompile it', () => {
    // Arrange — renaming it would rename the export.
    writePackage(join(root, 'esm'), { name: 'esm', type: 'module' });
    const filename = join(root, 'esm', 'exported.js');

    // Act
    const compile = (): unknown =>
      createTransformer().process('export const require = () => 1;', filename, OPTIONS);

    // Assert
    expect(compile).toThrow(/exports a declaration named `require`/);
  });

  it('answers import.meta with the file it is in', () => {
    // Arrange
    writePackage(join(root, 'esm'), { name: 'esm', type: 'module' });
    const filename = join(root, 'esm', 'meta.js');
    const source = [
      'export const url = import.meta.url;',
      'export const file = import.meta.filename;',
      'export const dir = import.meta.dirname;',
    ].join('\n');

    // Act
    const { code } = createTransformer().process(source, filename, OPTIONS);
    const exports = run(code, filename);

    // Assert
    expect(exports.url).toBe(pathToFileURL(filename).href);
    expect(exports.file).toBe(filename);
    expect(exports.dir).toBe(join(root, 'esm'));
  });

  it('gives a module one import.meta, as Node does', () => {
    // Arrange
    writePackage(join(root, 'esm'), { name: 'esm', type: 'module' });
    const filename = join(root, 'esm', 'same.js');
    const source = [
      'const first = import.meta;',
      'export const same = first === import.meta;',
      'function later() { return import.meta; }',
      'export const sameLater = later() === first;',
    ].join('\n');

    // Act
    const { code } = createTransformer().process(source, filename, OPTIONS);
    const exports = run(code, filename);

    // Assert
    expect(exports.same).toBe(true);
    expect(exports.sameLater).toBe(true);
  });

  it('refuses import.meta.resolve rather than answer it with CommonJS resolution', () => {
    // Arrange — Node resolves with the import conditions and answers
    // `node:fs` for a builtin; require.resolve would answer neither.
    writePackage(join(root, 'esm'), { name: 'esm', type: 'module' });
    const filename = join(root, 'esm', 'resolve.js');
    const source = "export const where = () => import.meta.resolve('node:fs');";

    // Act
    const { code } = createTransformer().process(source, filename, OPTIONS);
    const where = run(code, filename).where as () => string;

    // Assert
    expect(where).toThrow(/import\.meta\.resolve/);
  });

  it('leaves the members of another object alone', () => {
    // Arrange — `x.require` and `x.exports` are properties, not the wrapper's
    // names, and must survive the renaming untouched.
    writePackage(join(root, 'esm'), { name: 'esm', type: 'module' });
    const filename = join(root, 'esm', 'members.js');
    const source = [
      'const x = { require: 1, exports: 2, module: 3 };',
      'x.require += 10;',
      'export const total = x.require + x.exports + x["module"];',
      'export class Holder { exports = 4; require() { return this.exports; } }',
    ].join('\n');

    // Act
    const { code } = createTransformer().process(source, filename, OPTIONS);
    const exports = run(code, filename);

    // Assert
    expect(exports.total).toBe(16);
    expect(new (exports.Holder as new () => { require(): number })().require()).toBe(4);
  });

  it('reads a named import called require', () => {
    // Arrange — a fixture module exporting `require`, imported by name.
    writePackage(join(root, 'esm'), { name: 'esm', type: 'module' });
    writeFileSync(join(root, 'esm', 'lib.cjs'), 'exports.require = () => "from lib";');
    const filename = join(root, 'esm', 'named.js');
    const source = [
      "import { require } from './lib.cjs';",
      'export const answer = require();',
    ].join('\n');

    // Act
    const { code } = createTransformer().process(source, filename, OPTIONS);
    const exports = run(code, filename);

    // Assert
    expect(exports.answer).toBe('from lib');
  });

  describe('cache key', () => {
    it('changes when the package a file belongs to changes module type', () => {
      // Arrange — same file, same bytes; only package.json moved.
      writePackage(join(root, 'pkg'), { name: 'pkg' });
      const filename = join(root, 'pkg', 'index.js');
      const source = 'export const x = 1;';
      const before = createTransformer().getCacheKey(source, filename, OPTIONS);

      // Act
      writePackage(join(root, 'pkg'), { name: 'pkg', type: 'module' });
      const after = createTransformer().getCacheKey(source, filename, OPTIONS);

      // Assert
      expect(after).not.toBe(before);
    });

    it('changes with the source, and only then', () => {
      // Arrange
      writePackage(join(root, 'esm'), { name: 'esm', type: 'module' });
      const filename = join(root, 'esm', 'index.js');
      const transformer = createTransformer();

      // Act
      const first = transformer.getCacheKey('export const x = 1;', filename, OPTIONS);
      const again = transformer.getCacheKey('export const x = 1;', filename, OPTIONS);
      const edited = transformer.getCacheKey('export const x = 2;', filename, OPTIONS);

      // Assert
      expect(again).toBe(first);
      expect(edited).not.toBe(first);
    });
  });
});
