import 'reflect-metadata';
import * as path from 'node:path';
import * as ts from 'typescript';

/**
 * The dashboard and the API have to agree on filter names.
 *
 * A badge in the dashboard turns a click into `?levels=error`, and the storage
 * layer reads `filters.levels`. Nothing connects those two names: they live in
 * separate packages, compiled separately, and a filter added on one side simply
 * does nothing on the other — the request succeeds, the list comes back
 * unfiltered, and no test notices.
 *
 * The previous version of this file listed both sides as hand-copied string
 * arrays and then asserted things like `expect(KEYS).toContain(key)` for each
 * `key` of `KEYS` — 34 tests that could not fail, and two constants that had
 * drifted from the code they were transcribed from. It reported a contract it
 * never read.
 *
 * These resolve both sides through the TypeScript checker instead. `FilterUrlKey`
 * is a derived type (`ExtractUrlKeys<typeof ENTRY_TYPES[...]>`), so only the
 * checker can say what it currently expands to — which is exactly the point:
 * adding an entry type to the dashboard config changes this set silently.
 */

const REPO_ROOT = path.join(__dirname, '..', '..', '..');
const BACKEND_TYPES = path.join(REPO_ROOT, 'src', 'types', 'entry.types.ts');
const DASHBOARD_CONFIG = path.join(REPO_ROOT, 'dashboard', 'src', 'config', 'entryTypes.ts');
const DASHBOARD_API = path.join(REPO_ROOT, 'dashboard', 'src', 'api.ts');

/** Building the program is the slow part, so both suites share one. */
const program = ts.createProgram([BACKEND_TYPES, DASHBOARD_CONFIG, DASHBOARD_API], {
  target: ts.ScriptTarget.ES2021,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
  strict: true,
  skipLibCheck: true,
  noEmit: true,
});
const checker = program.getTypeChecker();

function sourceFile(filePath: string): ts.SourceFile {
  const file = program.getSourceFile(filePath);
  if (!file) {
    throw new Error(`Could not load ${filePath} — the contract cannot be checked.`);
  }
  return file;
}

/** Literal members of a string-union type alias, expanded by the checker. */
function unionMembers(filePath: string, aliasName: string): string[] {
  const members: string[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isTypeAliasDeclaration(node) && node.name.text === aliasName) {
      const type = checker.getTypeAtLocation(node.name);
      for (const part of type.isUnion() ? type.types : [type]) {
        if (part.isStringLiteral()) {
          members.push(part.value);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile(filePath));

  if (members.length === 0) {
    throw new Error(`${aliasName} resolved to no string members — check the alias still exists.`);
  }
  return members;
}

/** Property names of an interface, or of one of its object-typed properties. */
function interfaceKeys(filePath: string, interfaceName: string, property?: string): string[] {
  let keys: string[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === interfaceName) {
      const type = checker.getTypeAtLocation(node.name);
      const target = property
        ? checker.getTypeOfSymbolAtLocation(
            checker.getPropertyOfType(type, property) as ts.Symbol,
            node,
          )
        : type;
      const nonNullable = target.getNonNullableType();
      keys = nonNullable.getProperties().map((symbol) => symbol.getName());
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile(filePath));

  if (keys.length === 0) {
    throw new Error(`${interfaceName}${property ? `.${property}` : ''} resolved to no keys.`);
  }
  return keys;
}

/**
 * Keys the dashboard sends that the API deliberately handles outside the
 * `filters` object: `tags` and `search` are top-level query parameters, and
 * `path` / `requestId` address a single entry rather than filtering a list.
 */
const HANDLED_OUTSIDE_FILTERS = new Set(['tags', 'search', 'path', 'requestId']);

describe('filter names agree across the dashboard and the API', () => {
  const backendFilterKeys = interfaceKeys(BACKEND_TYPES, 'CursorPaginationParams', 'filters');
  const dashboardFilterKeys = interfaceKeys(DASHBOARD_API, 'CursorFilters');
  const badgeUrlKeys = unionMembers(DASHBOARD_CONFIG, 'FilterUrlKey');

  it('resolves both sides from source rather than from a copied list', () => {
    // Guards the guard: a resolution that silently returned little would make
    // every assertion below pass by default.
    expect(backendFilterKeys.length).toBeGreaterThan(20);
    expect(dashboardFilterKeys.length).toBeGreaterThan(20);
    expect(badgeUrlKeys.length).toBeGreaterThan(20);
  });

  it.each(['levels', 'statuses', 'methods', 'queues'])(
    'reads %s from the real backend type',
    (key) => {
      expect(backendFilterKeys).toContain(key);
    },
  );

  it('sends no filter the API would ignore', () => {
    const unknown = dashboardFilterKeys.filter((key) => !backendFilterKeys.includes(key));

    expect(unknown).toEqual([]);
  });

  it('offers no badge filter the API would ignore', () => {
    const unknown = badgeUrlKeys.filter(
      (key) => !backendFilterKeys.includes(key) && !HANDLED_OUTSIDE_FILTERS.has(key),
    );

    expect(unknown).toEqual([]);
  });
});
