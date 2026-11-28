/**
 * The code the documentation asks a reader to paste compiles.
 *
 * The GraphQL page's Manual Wiring section registered Mercurius hooks with
 * `fastify.graphql.addHook(name, hook)` in a loop. Mercurius types `addHook`
 * as one overload per literal hook name, so a `string` name matches none of
 * them, and the snippet failed with TS2769 against the installed types.
 *
 * Each TypeScript block of the sections below is compiled, strict, against the
 * repository's own dependencies, with `nestlens` resolving to `src/`. What the
 * page says comes from the reader's application — the Nest application, the
 * schema, a Fastify instance with Mercurius registered — is declared for it.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import * as ts from 'typescript';

const ROOT = resolve(__dirname, '..', '..', '..');

/** `[page, heading]` of each section whose snippets are compiled. */
const SECTIONS: readonly [string, string][] = [['watchers/graphql.md', '### Manual Wiring']];

const READER_SUPPLIES = `
import type { INestApplication } from '@nestjs/common';
import type { FastifyInstance } from 'fastify';
import 'mercurius';
declare const app: INestApplication;
declare const typeDefs: string;
declare const resolvers: { Query: Record<string, () => unknown> };
declare const fastify: FastifyInstance;
export {};
`;

/** The TypeScript blocks between a heading and the next heading of its level or higher. */
const snippetsOf = (page: string, heading: string): string[] => {
  const text = readFileSync(join(ROOT, 'docs', 'docs', page), 'utf8');
  const start = text.indexOf(`\n${heading}\n`);
  if (start < 0) return [];

  const level = heading.split(' ')[0];
  const rest = text.slice(start + heading.length + 2);
  const end = rest.search(new RegExp(`\\n#{1,${level.length}} `));
  const section = end < 0 ? rest : rest.slice(0, end);

  return [...section.matchAll(/```(?:typescript|ts)\n([\s\S]*?)```/g)].map(([, code]) => code);
};

/**
 * Every snippet as a file of its own in one program, so the library's sources
 * and the dependencies' types are read once for all of them.
 */
const compileAll = (snippets: readonly string[]): string[][] => {
  const files = snippets.map((_code, index) => join(ROOT, 'src', `__docs_snippet_${index}__.ts`));
  const sources = new Map(
    files.map((file, index) => [file, `${snippets[index]}\n${READER_SUPPLIES}`]),
  );
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2021,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    esModuleInterop: true,
    experimentalDecorators: true,
    emitDecoratorMetadata: true,
    skipLibCheck: true,
    types: ['node'],
    baseUrl: ROOT,
    paths: { nestlens: ['src/index.ts'], '@/*': ['src/*'] },
  };

  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, languageVersion, ...rest) => {
    const source = sources.get(name);
    return source === undefined
      ? getSourceFile(name, languageVersion, ...rest)
      : ts.createSourceFile(name, source, languageVersion);
  };
  const fileExists = host.fileExists.bind(host);
  host.fileExists = (name) => sources.has(name) || fileExists(name);

  const program = ts.createProgram(files, options, host);

  return files.map((file) =>
    ts
      .getPreEmitDiagnostics(program, program.getSourceFile(file))
      .map(
        (diagnostic) =>
          `TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`,
      ),
  );
};

describe.each(SECTIONS)('the snippets of %s, %s', (page, heading) => {
  const snippets = snippetsOf(page, heading);
  let diagnostics: string[][] = [];

  beforeAll(() => {
    diagnostics = compileAll(snippets);
  }, 60_000);

  it('are found', () => {
    expect(snippets.length).toBeGreaterThan(0);
  });

  it.each(snippets.map((_code, index) => [index + 1]))('snippet %i compiles', (number) => {
    expect(diagnostics[number - 1]).toEqual([]);
  });
});
