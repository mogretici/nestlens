/**
 * The API reference is generated. This is what keeps it that way.
 *
 * There were two of them. One was produced from the source by typedoc on every
 * build — into a directory outside the docs plugin's reach, so not one of its
 * seventy-two pages ever reached the site. The other was typed out by hand,
 * linked from the navbar, and had drifted:
 *
 *     4 config options missing   trustProxy, sampling, server, security
 *     16 interfaces missing      including every GraphQL type
 *     'graphql' missing          from both EntryType and the watcher list
 *     7 tokens called internal   6 of them were exported, and the 7th,
 *                                NESTLENS_SCHEDULER_REGISTRY, did not exist
 *     4 sensitive headers missing  including x-refresh-token
 *     5 storage methods missing  from a list presented as complete
 *
 * None of it was wrong when it was written. That is the point: a second copy of
 * a type is a copy that stops being true, and nothing was reading it.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..');

const read = (...path: string[]): string => readFileSync(join(ROOT, ...path), 'utf8');

describe('the API reference', () => {
  it('is generated inside the directory the docs plugin publishes', () => {
    // `out: 'api'` put it in `docs/api`, which Docusaurus never looks at.
    const config = read('docs', 'docusaurus.config.ts');

    expect(config).toMatch(/out: 'docs\/api-reference'/);
  });

  it('leaves third-party types out of it', () => {
    // Without this it inlines Express's `Request` and four thousand lines of
    // Node's typings, which MDX cannot render.
    expect(read('docs', 'docusaurus.config.ts')).toMatch(/excludeExternals: true/);
  });

  it('is reachable from the sidebar', () => {
    const sidebars = read('docs', 'sidebars.ts');

    expect(sidebars).toContain("dirName: 'api-reference'");
    expect(sidebars).toContain("label: 'API Reference'");
  });

  it('is built where the library it documents can be resolved', () => {
    // typedoc reads `../src`, so without the library's own dependencies it
    // resolves no import, writes no page, and the build fails on the links into
    // a reference that is not there. Measured on a clean checkout: with only
    // `docs/` installed, zero of the seventy-two pages are produced.
    expect(read('docs', 'vercel.json')).toContain('cd .. && npm ci');
    expect(read('.github', 'workflows', 'ci.yml')).toContain('Install library dependencies');
  });

  describe('the hand-written page', () => {
    const page = read('docs', 'docs', 'api', 'index.md');

    it('declares no interface of its own', () => {
      // Every one it declared was a copy that fell behind. Link instead.
      const declarations = [...page.matchAll(/^(?:export )?interface (\w+)/gm)].map((m) => m[1]);

      expect(declarations).toEqual([]);
    });

    it('names no entry type or watcher list to fall behind', () => {
      expect(page).not.toMatch(/^type EntryType =/m);
      expect(page).not.toContain('interface WatchersConfig');
    });

    it('points at the generated reference', () => {
      expect(page).toContain('../api-reference/interfaces/NestLensConfig.md');
    });
  });

  describe('the facts it does state', () => {
    const page = read('docs', 'docs', 'api', 'index.md');

    it('lists every default sensitive header', () => {
      const source = read('src', 'core', 'data-masker.service.ts');
      const block = source.slice(
        source.indexOf('const DEFAULT_SENSITIVE_HEADERS = ['),
        source.indexOf('];', source.indexOf('const DEFAULT_SENSITIVE_HEADERS = [')),
      );
      const headers = [...block.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);

      expect(headers.length).toBeGreaterThan(5);
      expect(headers.filter((header) => !page.includes(`\`${header}\``))).toEqual([]);
    });

    it('names only tokens that exist and are exported', () => {
      const exported = read('src', 'index.ts') + read('src', 'nestlens.config.ts');
      const named = [...page.matchAll(/^ {2}(NESTLENS_\w+|STORAGE|REQUEST_ID_HEADER),/gm)].map(
        (m) => m[1],
      );

      expect(named.length).toBeGreaterThan(10);

      const runtime = require('../../index') as Record<string, unknown>;
      expect(named.filter((token) => !(token in runtime))).toEqual([]);
      expect(exported.length).toBeGreaterThan(0);
    });

    it('states the number of storage methods the interface has', () => {
      const source = read('src', 'core', 'storage', 'storage.interface.ts');
      const body = source.slice(source.indexOf('export interface StorageInterface'));
      const methods = [...body.matchAll(/^ {2}([a-zA-Z]\w*)\(/gm)].length;

      expect(page).toContain(`${methods} methods in all`);
    });
  });
});
