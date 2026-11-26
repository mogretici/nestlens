// @ts-check
'use strict';

/**
 * Compiles ESM-only dependencies to CommonJS so Jest can load them.
 *
 * NestJS 12 publishes every `@nestjs/*` package as ESM only, and so do a few
 * packages around them (path-to-regexp 9, cookie 2). Node loads those from
 * CommonJS through `require(esm)`; Jest 29's module runtime does not, and
 * without this 181 of 215 suites failed on `Cannot use import statement
 * outside a module`. Jest 30 with `--experimental-vm-modules` needs Node 24.9,
 * which would drop NestJS 12 coverage from the Node 20 and 22 rows of the
 * matrix.
 *
 * A file is ESM by Node's rule — `.mjs`, or `.js` under a nearest
 * `package.json` that says `"type": "module"` — and only those are compiled.
 * On NestJS 9 to 11 the `@nestjs/*` packages are CommonJS and come back
 * unchanged; what is compiled there is the handful of ESM-only packages an
 * application on those versions installs as well — path-to-regexp 9 under
 * `@fastify/middie`, cookie under `light-my-request`, `@nestjs/cache-manager`
 * 12.
 *
 * Two things a plain compile gets wrong are handled on the syntax tree:
 *
 * - The CommonJS wrapper declares `require`, `module`, `exports`,
 *   `__filename` and `__dirname`; in a module none of them exist. NestJS 12
 *   writes `const require = createRequire(import.meta.url)`, and once compiled
 *   that declaration shadows the `require` the compiled imports call, which
 *   throws `Cannot access 'require' before initialization`. Every use of those
 *   names in a module is therefore renamed, which keeps ESM's meaning exactly:
 *   a reference that was unbound there is still unbound.
 * - `import.meta` becomes one object per module with Node's `url`,
 *   `filename` and `dirname`, built from the wrapper's own `__filename`.
 *   `import.meta.resolve` throws: CommonJS resolution would answer it wrongly.
 *
 * Not modelled: Node's syntax detection (a `.js` file with no `"type"` that
 * contains ESM syntax) and the `node_modules` boundary at which Node stops
 * looking for a `package.json`. Either one fails loudly in Jest, with a
 * syntax error, rather than quietly.
 */

const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const ts = require('typescript');

const WRAPPER_NAMES = new Set(['require', 'module', 'exports', '__filename', '__dirname']);

const OWN_SOURCE = readFileSync(__filename, 'utf8');

const COMPILER_OPTIONS = {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ESNext,
  allowJs: true,
  esModuleInterop: true,
  sourceMap: true,
  inlineSources: true,
};

/**
 * @param {ts.Identifier} node
 * @returns {boolean} whether the identifier names a property, label or
 *   exported name rather than a binding.
 */
const isNotAVariable = (node) => {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isPropertyAccessExpression(parent)) return parent.name === node;
  if (ts.isQualifiedName(parent)) return parent.right === node;
  if (ts.isMetaProperty(parent)) return true;
  if (ts.isLabeledStatement(parent) || ts.isBreakOrContinueStatement(parent)) {
    return parent.label === node;
  }
  if (ts.isBindingElement(parent) || ts.isImportSpecifier(parent)) {
    return parent.propertyName === node;
  }
  if (ts.isJsxAttribute(parent)) return parent.name === node;
  if (
    ts.isPropertyAssignment(parent) ||
    ts.isMethodDeclaration(parent) ||
    ts.isPropertyDeclaration(parent) ||
    ts.isGetAccessorDeclaration(parent) ||
    ts.isSetAccessorDeclaration(parent) ||
    ts.isEnumMember(parent)
  ) {
    return parent.name === node;
  }
  return false;
};

/**
 * @param {ts.Node} statement
 * @returns {boolean}
 */
const isNamedExport = (statement) => {
  const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
  if (!modifiers) return false;
  const kinds = modifiers.map((modifier) => modifier.kind);
  return (
    kinds.includes(ts.SyntaxKind.ExportKeyword) && !kinds.includes(ts.SyntaxKind.DefaultKeyword)
  );
};

/**
 * @param {ts.Statement} statement
 * @returns {string[]} names a top-level `export` declaration binds.
 */
const exportedDeclarationNames = (statement) => {
  if (!isNamedExport(statement)) return [];
  /** @type {string[]} */
  const names = [];
  /** @param {ts.BindingName} name */
  const collect = (name) => {
    if (ts.isIdentifier(name)) {
      names.push(name.text);
      return;
    }
    for (const element of name.elements) {
      if (!ts.isOmittedExpression(element)) collect(element.name);
    }
  };
  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) collect(declaration.name);
  } else if (
    (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
    statement.name
  ) {
    names.push(statement.name.text);
  }
  return names;
};

/**
 * @param {string} source
 * @param {string} name
 * @returns {string} a name the file does not already use.
 */
const freshName = (source, name) => {
  let candidate = `__esm_${name}`;
  while (source.includes(candidate)) candidate = `_${candidate}`;
  return candidate;
};

/**
 * @param {string} source
 * @param {string} filename
 * @returns {ts.TransformerFactory<ts.SourceFile>}
 */
const moduleToScript = (source, filename) => (context) => {
  const { factory } = context;
  /** @type {Map<string, string>} */
  const renamed = new Map();
  /** @param {string} name */
  const renameOf = (name) => {
    let next = renamed.get(name);
    if (!next) {
      next = freshName(source, name);
      renamed.set(name, next);
    }
    return next;
  };

  /** @param {ts.Identifier} node */
  const renamedIdentifier = (node) => {
    const next = factory.createIdentifier(renameOf(node.text));
    ts.setOriginalNode(next, node);
    return ts.setTextRange(next, node);
  };

  const wrapper = (/** @type {string} */ name) => factory.createIdentifier(name);
  const callRequire = (/** @type {string} */ specifier) =>
    factory.createCallExpression(wrapper('require'), undefined, [
      factory.createStringLiteral(specifier),
    ]);
  const fileUrl = (/** @type {ts.Expression} */ path) =>
    factory.createPropertyAccessExpression(
      factory.createCallExpression(
        factory.createPropertyAccessExpression(callRequire('node:url'), 'pathToFileURL'),
        undefined,
        [path],
      ),
      'href',
    );

  /** @type {string | undefined} the one identifier every `import.meta` becomes. */
  let importMetaName;

  /**
   * `{ url, filename, dirname }`, built once per module as Node builds it.
   *
   * `resolve` throws instead of answering: Node resolves with the import
   * conditions and answers `node:fs` for a builtin, and the only thing
   * available here is `require.resolve`, which does neither. A wrong URL would
   * fail somewhere far from its cause; this fails where it was asked.
   */
  const importMetaDeclaration = (/** @type {string} */ name) =>
    factory.createVariableStatement(
      undefined,
      factory.createVariableDeclarationList(
        [
          factory.createVariableDeclaration(
            name,
            undefined,
            undefined,
            factory.createObjectLiteralExpression([
              factory.createPropertyAssignment('url', fileUrl(wrapper('__filename'))),
              factory.createPropertyAssignment('filename', wrapper('__filename')),
              factory.createPropertyAssignment('dirname', wrapper('__dirname')),
              factory.createPropertyAssignment(
                'resolve',
                factory.createArrowFunction(
                  undefined,
                  undefined,
                  [],
                  undefined,
                  undefined,
                  factory.createBlock([
                    factory.createThrowStatement(
                      factory.createNewExpression(wrapper('Error'), undefined, [
                        factory.createStringLiteral(
                          `import.meta.resolve is not available in ${filename} under Jest: ` +
                            'jest/esm-to-commonjs.js compiles it to CommonJS, where only ' +
                            'require.resolve exists, and that resolves differently.',
                        ),
                      ]),
                    ),
                  ]),
                ),
              ),
            ]),
          ),
        ],
        ts.NodeFlags.Const,
      ),
    );

  /** @type {ts.Visitor} */
  const visit = (node) => {
    if (
      ts.isMetaProperty(node) &&
      node.keywordToken === ts.SyntaxKind.ImportKeyword &&
      node.name.text === 'meta'
    ) {
      importMetaName ??= freshName(source, 'import_meta');
      return ts.setTextRange(factory.createIdentifier(importMetaName), node);
    }

    if (ts.isShorthandPropertyAssignment(node) && WRAPPER_NAMES.has(node.name.text)) {
      const value = renamedIdentifier(node.name);
      return factory.createPropertyAssignment(
        node.name.text,
        node.objectAssignmentInitializer
          ? factory.createAssignment(
              value,
              ts.visitNode(node.objectAssignmentInitializer, visit, ts.isExpression),
            )
          : value,
      );
    }

    if (
      ts.isBindingElement(node) &&
      !node.propertyName &&
      !node.dotDotDotToken &&
      ts.isIdentifier(node.name) &&
      WRAPPER_NAMES.has(node.name.text) &&
      ts.isObjectBindingPattern(node.parent)
    ) {
      return factory.updateBindingElement(
        node,
        undefined,
        factory.createIdentifier(node.name.text),
        renamedIdentifier(node.name),
        ts.visitNode(node.initializer, visit, ts.isExpression),
      );
    }

    if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      return node;
    }

    if (ts.isExportSpecifier(node)) {
      const local = node.propertyName ?? node.name;
      if (!ts.isIdentifier(local) || !WRAPPER_NAMES.has(local.text)) return node;
      return factory.updateExportSpecifier(
        node,
        node.isTypeOnly,
        renamedIdentifier(local),
        node.propertyName ? node.name : factory.createIdentifier(local.text),
      );
    }

    if (ts.isIdentifier(node) && WRAPPER_NAMES.has(node.text) && !isNotAVariable(node)) {
      return renamedIdentifier(node);
    }

    return ts.visitEachChild(node, visit, context);
  };

  return (sourceFile) => {
    for (const statement of sourceFile.statements) {
      const clash = exportedDeclarationNames(statement).find((name) => WRAPPER_NAMES.has(name));
      if (clash) {
        throw new Error(
          `esm-to-commonjs: ${filename} exports a declaration named \`${clash}\`, ` +
            'which this transform cannot rename without changing the export.',
        );
      }
    }
    const visited = ts.visitEachChild(sourceFile, visit, context);
    if (!importMetaName) return visited;
    return factory.updateSourceFile(visited, [
      importMetaDeclaration(importMetaName),
      ...visited.statements,
    ]);
  };
};

/** @returns {import('@jest/transform').SyncTransformer} */
const createTransformer = () => {
  /** @type {Map<string, boolean>} */
  const moduleTypeByDirectory = new Map();

  /**
   * @param {string} directory
   * @returns {boolean} whether the nearest package.json says `"type": "module"`.
   */
  const isModulePackage = (directory) => {
    const known = moduleTypeByDirectory.get(directory);
    if (known !== undefined) return known;

    let isModule;
    try {
      const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
      isModule = manifest.type === 'module';
    } catch (error) {
      const code = /** @type {NodeJS.ErrnoException} */ (error).code;
      if (code !== 'ENOENT' && code !== 'ENOTDIR') throw error;
      const parent = dirname(directory);
      isModule = parent === directory ? false : isModulePackage(parent);
    }

    moduleTypeByDirectory.set(directory, isModule);
    return isModule;
  };

  /** @param {string} filename */
  const isEsm = (filename) => {
    if (filename.endsWith('.mjs')) return true;
    if (filename.endsWith('.cjs')) return false;
    return isModulePackage(dirname(filename));
  };

  return {
    getCacheKey(source, filename, options) {
      return createHash('sha256')
        .update(OWN_SOURCE)
        .update('\0')
        .update(ts.version)
        .update('\0')
        .update(options.configString)
        .update('\0')
        .update(filename)
        .update('\0')
        .update(isEsm(filename) ? 'esm' : 'cjs')
        .update('\0')
        .update(source)
        .digest('hex');
    },

    process(source, filename) {
      if (!isEsm(filename)) return { code: source };

      const output = ts.transpileModule(source, {
        fileName: filename.replace(/\.mjs$/, '.js'),
        compilerOptions: COMPILER_OPTIONS,
        transformers: { before: [moduleToScript(source, filename)] },
      });

      const map = JSON.parse(/** @type {string} */ (output.sourceMapText));
      map.sources = [filename];

      return {
        code: output.outputText.replace(/\n\/\/# sourceMappingURL=.*\s*$/, '\n'),
        map,
      };
    },
  };
};

module.exports = { createTransformer };
