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
import { describe, it, expect } from 'vitest';
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

const compile = (code: string): string[] => {
  const file = join(ROOT, 'src', '__docs_snippet__.ts');
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
  const source = `${code}\n${READER_SUPPLIES}`;
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, languageVersion, ...rest) =>
    name === file
      ? ts.createSourceFile(name, source, languageVersion)
      : getSourceFile(name, languageVersion, ...rest);
  const fileExists = host.fileExists.bind(host);
  host.fileExists = (name) => name === file || fileExists(name);

  const program = ts.createProgram([file], options, host);

  return ts
    .getPreEmitDiagnostics(program, program.getSourceFile(file))
    .map(
      (diagnostic) =>
        `TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`,
    );
};

describe.each(SECTIONS)('the snippets of %s, %s', (page, heading) => {
  const snippets = snippetsOf(page, heading);

  it('are found', () => {
    expect(snippets.length).toBeGreaterThan(0);
  });

  it.each(snippets.map((code, index) => [index + 1, code]))(
    'snippet %i compiles',
    (_index, code) => {
      expect(compile(code)).toEqual([]);
    },
    60_000,
  );
});
