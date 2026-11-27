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
import { describe, it, expect } from 'vitest';
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

  /**
   * The configuration pages keep a summary of the interface they describe,
   * because a reader starting there wants the whole shape on one screen. They
   * had fallen behind the way the hand-written reference did — `NestLensConfig`
   * without `preset`, `sampling` and `alerting`, with `watchers` typed as a
   * `WatchersConfig` that has never existed, and `StorageConfig` without
   * `maxEntries` — so each summary is now read against its interface.
   */
  describe.each([
    ['NestLensConfig', 'configuration/basic-config.md'],
    ['StorageConfig', 'configuration/storage.md'],
    ['SqliteStorageConfig', 'configuration/storage.md'],
    ['RedisStorageConfig', 'configuration/storage.md'],
    ['AuthorizationConfig', 'configuration/authorization.md'],
    ['AuthUser', 'configuration/authorization.md'],
    ['AuthUser', 'security/access-control.md'],
    ['RateLimitConfig', 'configuration/rate-limiting.md'],
    ['PruningConfig', 'configuration/pruning.md'],
  ])('the %s summary in %s', (name, file) => {
    /** Top-level members of a TypeScript object body, with their types. */
    const membersOf = (body: string): Map<string, string> => {
      const members = new Map<string, string>();

      for (const [, member, type] of body.matchAll(/^ {2}(\w+)\??: ([^;\n]+);?/gm)) {
        members.set(member, type.replace(/\s*\/\/.*$/, '').trim());
      }

      return members;
    };

    const bodyOf = (text: string, opening: string): string => {
      const start = text.indexOf(opening);
      return start < 0 ? '' : text.slice(start, text.indexOf('\n}', start));
    };

    const source = membersOf(
      bodyOf(read('src', 'nestlens.config.ts'), `export interface ${name} {`),
    );
    const summary = membersOf(bodyOf(read('docs', 'docs', file), `interface ${name} {`));

    it('finds the members it is comparing', () => {
      // A pattern that matched nothing on either side would pass the rest.
      expect(source.size).toBeGreaterThan(0);
      expect(summary.size).toBeGreaterThan(0);
    });

    it('lists every member the interface has, and no other', () => {
      expect([...summary.keys()].sort()).toEqual([...source.keys()].sort());
    });

    it('gives each member the type the interface gives it', () => {
      const differing = [...source]
        .filter(([member, type]) => {
          const written = summary.get(member);
          if (written === undefined) return false;
          // An inline object type is summarised as `{ … }`.
          return type.startsWith('{') ? !written.startsWith('{') : written !== type;
        })
        .map(([member, type]) => `${member}: ${summary.get(member)} (interface: ${type})`);

      expect(differing).toEqual([]);
    });
  });

  /**
   * The storage guide prints the interface a backend implements, which is the
   * one copy a reader types against. It said `clear(): Promise<void>` after
   * `clear` had become `clear(type?: EntryType): Promise<number>`, so a backend
   * written from it did not compile — and its own Postgres example returned
   * nothing where the dashboard reads a count.
   */
  describe('the StorageInterface printed in advanced/extending-storage.md', () => {
    /** Each method's signature, comments gone and whitespace collapsed. */
    const methodsIn = (text: string): Map<string, string> => {
      const start = text.indexOf('interface StorageInterface {');
      if (start < 0) return new Map();

      const body = text
        .slice(text.indexOf('{', start) + 1)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      const methods = new Map<string, string>();
      let depth = 0;
      let member = '';

      for (const char of body) {
        if (depth === 0 && char === '}') break;
        if ('({[<'.includes(char)) depth += 1;
        if (')}]>'.includes(char)) depth -= 1;

        if (depth === 0 && char === ';') {
          const signature = member
            .replace(/\s+/g, ' ')
            .replace(/,\s*\)/g, ')')
            .replace(/\(\s+/g, '(')
            .trim();
          const name = signature.match(/^(\w+)\(/)?.[1];
          if (name) methods.set(name, signature);
          member = '';
        } else {
          member += char;
        }
      }

      return methods;
    };

    const source = methodsIn(read('src', 'core', 'storage', 'storage.interface.ts'));
    const printed = methodsIn(read('docs', 'docs', 'advanced', 'extending-storage.md'));

    it('finds the methods it is comparing', () => {
      expect(source.size).toBeGreaterThan(20);
      expect(printed.size).toBeGreaterThan(20);
    });

    it('prints every method with the signature the interface has', () => {
      const differing = [...source]
        .filter(([name, signature]) => printed.get(name) !== signature)
        .map(
          ([name, signature]) =>
            `${printed.get(name) ?? `${name}: missing`}  (interface: ${signature})`,
        );

      expect(differing).toEqual([]);
      expect([...printed.keys()].filter((name) => !source.has(name))).toEqual([]);
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

    it('names only tokens that exist and are exported', async () => {
      const exported = read('src', 'index.ts') + read('src', 'nestlens.config.ts');
      const named = [...page.matchAll(/^ {2}(NESTLENS_\w+|STORAGE|REQUEST_ID_HEADER),/gm)].map(
        (m) => m[1],
      );

      expect(named.length).toBeGreaterThan(10);

      const runtime = (await import('../../index')) as Record<string, unknown>;
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
