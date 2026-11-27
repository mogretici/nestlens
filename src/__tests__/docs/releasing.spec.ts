/**
 * RELEASING.md describes the release that actually runs.
 *
 * It had described one that did not: `npm run publish:patch`, `publish:minor`
 * and `release:minor`, scripts package.json had not had since releases moved
 * to semantic-release, and a "single command" that pushed and published from a
 * laptop. Nothing compared the page with the repository, so it drifted for as
 * long as nobody read it.
 *
 * It is the one copy: CLAUDE.md points to it instead of keeping its own, and
 * the error the workflow prints when the wrapper's first publish is missing
 * sends the reader here.
 *
 * Following AAA (Arrange-Act-Assert).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import { parse } from 'yaml';

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');
const releasing = (): string => read('RELEASING.md');

describe('RELEASING.md', () => {
  it('names only npm scripts package.json has', () => {
    const { scripts } = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    const named = [...releasing().matchAll(/npm run ([\w:-]+)/g)].map((match) => match[1]);

    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((name) => !(name in scripts))).toEqual([]);
  });

  it('names every job of the release workflow', () => {
    const { jobs } = parse(read('.github/workflows/release.yml')) as {
      jobs: Record<string, unknown>;
    };

    expect(Object.keys(jobs).filter((id) => !releasing().includes(`\`${id}\``))).toEqual([]);
  });

  it('names every file sync-versions writes', () => {
    const written = [...read('scripts/sync-versions.mjs').matchAll(/writeJson\('([^']+)'/g)].map(
      (match) => match[1] as string,
    );

    expect(written.length).toBeGreaterThan(3);
    expect(written.filter((path) => !releasing().includes(`\`${path}\``))).toEqual([]);
  });

  it('names every file the release commit carries', () => {
    const config = JSON.parse(read('.releaserc.json')) as { plugins: unknown[] };
    const git = config.plugins.find(
      (plugin): plugin is [string, { assets: string[] }] =>
        Array.isArray(plugin) && plugin[0] === '@semantic-release/git',
    );
    const assets = git?.[1].assets ?? [];

    expect(assets.length).toBeGreaterThan(0);
    expect(assets.filter((path) => !releasing().includes(`\`${path}\``))).toEqual([]);
  });

  it('is the one copy: CLAUDE.md points to it, and the workflow sends a failed first publish there', () => {
    const claude = read('CLAUDE.md');

    expect(claude).toContain('RELEASING.md');
    expect(claude).not.toContain('npm trust github');
    expect(releasing()).toContain('npm trust github nestlens-mcp');
    expect(read('.github/workflows/release.yml')).toMatch(/not on npm yet[^\n]*RELEASING\.md/);
  });
});
