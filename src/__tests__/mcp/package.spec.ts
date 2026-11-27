/**
 * `packages/mcp` is the `nestlens-mcp` package: the command an MCP client
 * runs, with the MCP SDK as a dependency instead of an optional peer.
 *
 * Before it existed the command was a bin of `nestlens` itself, which works
 * only in a project that has installed both `nestlens` and the SDK. Outside
 * one, `npx nestlens-mcp` looked for a package of that name and got a 404;
 * inside one without the SDK it stopped at "@modelcontextprotocol/sdk is not
 * installed". Both were measured, as was what happens when both packages
 * declare the same bin: npm links whichever it reaches first — the library's
 * in a project that installs both, and in npx's cache — refuses a global
 * install of the second with EEXIST, and in a project with `nestlens` but no
 * SDK, `npx -y nestlens-mcp` runs the library's bin and fails. So the command
 * belongs to this package alone.
 *
 * The package is a bin and nothing else. The CLI is `runNestLensMcpCli` from
 * `nestlens/mcp`, tested where it is written, and this package pins the exact
 * `nestlens` it was released with.
 *
 * Following AAA (Arrange-Act-Assert).
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import * as mcp from '../../mcp';

const ROOT = resolve(__dirname, '..', '..', '..');
const PACKAGE = join(ROOT, 'packages', 'mcp');

interface PackageJson {
  readonly name: string;
  readonly version: string;
  readonly bin?: Record<string, string>;
  readonly files?: readonly string[];
  readonly exports?: Record<string, unknown>;
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
  readonly optionalDependencies?: Record<string, string>;
  readonly scripts?: Record<string, string>;
  readonly engines?: Record<string, string>;
  readonly license?: string;
  readonly repository?: {
    readonly type: string;
    readonly url: string;
    readonly directory?: string;
  };
}

const library = (): PackageJson =>
  JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as PackageJson;
const wrapper = (): PackageJson =>
  JSON.parse(readFileSync(join(PACKAGE, 'package.json'), 'utf8')) as PackageJson;

const SDK = '@modelcontextprotocol/sdk';

describe('the nestlens-mcp package', () => {
  it('is named after the command it ships, and ships only that', () => {
    const { name, bin } = wrapper();

    expect(name).toBe('nestlens-mcp');
    expect(bin).toEqual({ 'nestlens-mcp': 'bin.js' });
  });

  it('owns the command: the library declares no bin of the same name, or any', () => {
    expect(library().bin).toBeUndefined();
  });

  it('runs the CLI that nestlens/mcp exports, and nothing of its own', () => {
    const source = readFileSync(join(PACKAGE, 'bin.js'), 'utf8');
    const requires = [...source.matchAll(/require\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]);
    const called = /require\('nestlens\/mcp'\)\.(\w+)\(\)/.exec(source)?.[1];

    expect(source.startsWith('#!/usr/bin/env node\n')).toBe(true);
    expect(requires).toEqual(['nestlens/mcp']);
    expect(called).toBe('runNestLensMcpCli');
    expect(typeof (mcp as Record<string, unknown>)[called as string]).toBe('function');
    expect(library().exports?.['./mcp']).toBeDefined();
  });

  it('is released with the library, at its version, depending on exactly that version', () => {
    const { version } = library();

    expect(wrapper().version).toBe(version);
    expect(wrapper().dependencies?.nestlens).toBe(version);
  });

  it('depends on the MCP SDK at the range the library supports, and on nothing else', () => {
    expect(wrapper().dependencies).toEqual({
      nestlens: library().version,
      [SDK]: library().peerDependencies?.[SDK],
    });
    expect(wrapper().devDependencies).toBeUndefined();
    expect(wrapper().peerDependencies).toBeUndefined();
    expect(wrapper().optionalDependencies).toBeUndefined();
  });

  it('runs no scripts at install, build or publish time', () => {
    expect(wrapper().scripts).toBeUndefined();
  });

  it('keeps no lockfile, since npm ignores one in a published package and it has no dev tools', () => {
    expect(existsSync(join(PACKAGE, 'package-lock.json'))).toBe(false);
  });

  it('publishes the bin, and the readme and licence npm adds of its own accord', () => {
    expect(wrapper().files).toEqual(['bin.js']);
    expect(existsSync(join(PACKAGE, 'README.md'))).toBe(true);
    expect(readFileSync(join(PACKAGE, 'LICENSE'), 'utf8')).toBe(
      readFileSync(join(ROOT, 'LICENSE'), 'utf8'),
    );
  });

  it('claims the Node versions and licence the library claims', () => {
    expect(wrapper().engines).toEqual(library().engines);
    expect(wrapper().license).toBe(library().license);
  });

  it('points at this repository, in its own directory', () => {
    expect(wrapper().repository).toEqual({ ...library().repository, directory: 'packages/mcp' });
  });
});
