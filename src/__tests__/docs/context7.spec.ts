/**
 * `context7.json` tells Context7 what to index and hands its `rules` to every
 * coding agent that asks it about NestLens.
 *
 * A rule is a claim about the code, read by an agent as an instruction, and
 * nothing else in the repository checks it: a default that changes leaves the
 * rule teaching the old one. Context7 also drops the whole rule set when one
 * entry is invalid, so a rule over its length limit silently removes all of
 * them. This ties the facts the rules state to the code that decides them.
 *
 * Following AAA (Arrange-Act-Assert).
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { DEFAULT_CONFIG, NESTLENS_API_PREFIX } from '../../nestlens.config';
import { parseCliOptions } from '../../mcp/cli';
import { JobWatcher } from '../../watchers/job.watcher';
import { ModelWatcher } from '../../watchers/model.watcher';

const ROOT = resolve(__dirname, '..', '..', '..');

interface Context7 {
  readonly description: string;
  readonly folders: readonly string[];
  readonly excludeFolders: readonly string[];
  readonly excludeFiles: readonly string[];
  readonly rules: readonly string[];
}

/** The fields https://context7.com/schema/context7.json allows; it rejects any other. */
const SCHEMA_FIELDS = [
  '$schema',
  'projectTitle',
  'description',
  'branch',
  'folders',
  'excludeFolders',
  'excludeFiles',
  'includeExtensions',
  'rules',
  'disallow',
  'redirect',
  'previousVersions',
  'url',
  'public_key',
];

const raw = (): Record<string, unknown> =>
  JSON.parse(readFileSync(join(ROOT, 'context7.json'), 'utf8')) as Record<string, unknown>;
const config = (): Context7 => raw() as unknown as Context7;
const rules = (): string => config().rules.join('\n');

describe('context7.json', () => {
  it('uses only fields the schema allows, within its limits', () => {
    const { description, rules: list } = config();

    expect(Object.keys(raw()).filter((key) => !SCHEMA_FIELDS.includes(key))).toEqual([]);
    expect(description.length).toBeLessThanOrEqual(500);
    expect(list.length).toBeGreaterThan(0);
    expect(list.length).toBeLessThanOrEqual(50);
    expect(list.filter((rule) => rule.length > 255)).toEqual([]);
  });

  it('indexes folders that exist, so the include list is not silently empty', () => {
    const { folders, excludeFolders } = config();

    expect(folders.filter((folder) => !existsSync(join(ROOT, folder)))).toEqual([]);
    expect(
      excludeFolders
        .filter((folder) => folder !== 'node_modules')
        .filter((folder) => !existsSync(join(ROOT, folder))),
    ).toEqual([]);
  });

  it('keeps contributor files out of what agents are given', () => {
    expect(config().excludeFiles).toEqual(
      expect.arrayContaining(['CHANGELOG.md', 'CONTRIBUTING.md', 'RELEASING.md', 'CLAUDE.md']),
    );
  });

  it('is not published with the package', () => {
    const { files } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      files: string[];
    };

    expect(files).not.toContain('context7.json');
  });

  describe('states the defaults the code has', () => {
    it('the dashboard path and the API under it', () => {
      expect(rules()).toContain(`${DEFAULT_CONFIG.path} by default`);
      expect(rules()).toContain(`<path>/${NESTLENS_API_PREFIX}/api`);
    });

    it('the environments the dashboard answers in', () => {
      const environments = DEFAULT_CONFIG.authorization.allowedEnvironments ?? [];
      const spoken = `${environments.slice(0, -1).join(', ')} or ${environments.at(-1)}`;

      expect(rules()).toContain(`NODE_ENV is ${spoken}`);
    });

    it('the storage driver', () => {
      expect(DEFAULT_CONFIG.storage?.driver).toBe('memory');
      expect(rules()).toMatch(/Storage is in memory by default/);
    });

    it('the GraphQL watcher being off', () => {
      expect(DEFAULT_CONFIG.watchers?.graphql).toBe(false);
      expect(rules()).toMatch(/GraphQL watcher is off by default/);
    });

    it('the MCP server being read-only, and the flag that changes it', () => {
      expect(parseCliOptions([], {}).allowWrite).toBe(false);
      expect(parseCliOptions(['--allow-write'], {}).allowWrite).toBe(true);
      expect(rules()).toContain('read-only unless --allow-write is set');
    });
  });

  it('names setup methods the watchers have', () => {
    expect(JobWatcher.prototype.setupQueue).toBeInstanceOf(Function);
    expect(ModelWatcher.prototype.setupPrismaClient).toBeInstanceOf(Function);
    expect(rules()).toContain('setupQueue(queue, name)');
    expect(rules()).toContain('setupPrismaClient(client)');
  });
});
