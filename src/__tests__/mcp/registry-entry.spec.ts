/**
 * `server.json` is what the official MCP Registry lists, and what a client
 * that installs from the registry turns into a command line.
 *
 * The registry checks the entry's shape and that the published npm manifest
 * carries an `mcpName` equal to the entry's `name`. It does not run the
 * command, so nothing outside this file notices an entry that installs and
 * then fails to start — and the first draft of one did not start: an entry for
 * the `nestlens` package itself makes clients run `npx nestlens@<version>`,
 * which stops at "@modelcontextprotocol/sdk is not installed" because the SDK
 * is an optional peer npm never installs. The entry lists the `nestlens-mcp`
 * package instead, which depends on the SDK, and this checks that the command a
 * client builds from it is the plain one.
 *
 * Following AAA (Arrange-Act-Assert).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import { parseCliOptions } from '../../mcp/cli';

const ROOT = resolve(__dirname, '..', '..', '..');

interface Input {
  readonly value?: string;
  readonly default?: string;
  readonly description?: string;
  readonly isRequired?: boolean;
  readonly isSecret?: boolean;
  readonly format?: string;
  readonly choices?: readonly string[];
}

interface Argument extends Input {
  readonly type: 'named' | 'positional';
  readonly name?: string;
  readonly valueHint?: string;
}

interface EnvironmentVariable extends Input {
  readonly name: string;
}

interface Package {
  readonly registryType: string;
  readonly registryBaseUrl?: string;
  readonly identifier: string;
  readonly version: string;
  readonly runtimeHint?: string;
  readonly transport: { readonly type: string };
  readonly runtimeArguments?: readonly Argument[];
  readonly packageArguments?: readonly Argument[];
  readonly environmentVariables?: readonly EnvironmentVariable[];
}

interface ServerJson {
  readonly $schema: string;
  readonly name: string;
  readonly title?: string;
  readonly description: string;
  readonly version: string;
  readonly websiteUrl?: string;
  readonly repository?: { readonly url: string; readonly source: string; readonly id?: string };
  readonly packages: readonly Package[];
  readonly remotes?: readonly unknown[];
}

interface PackageJson {
  readonly name: string;
  readonly version: string;
  readonly mcpName?: string;
  readonly repository: { readonly url: string };
  readonly files: readonly string[];
}

const read = <T>(path: string): T => JSON.parse(readFileSync(join(ROOT, path), 'utf8')) as T;
const server = (): ServerJson => read<ServerJson>('server.json');
const library = (): PackageJson => read<PackageJson>('package.json');
const wrapper = (): PackageJson => read<PackageJson>('packages/mcp/package.json');
const npmEntry = (): Package => {
  const entry = server().packages.find((candidate) => candidate.registryType === 'npm');
  if (!entry) throw new Error('server.json has no npm package');
  return entry;
};

/**
 * The published schema the registry validates against today
 * (registry docs, quickstart.mdx). A draft or an older dated schema is
 * refused or flagged as deprecated by `mcp-publisher validate`.
 */
const SCHEMA = 'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json';

/**
 * A literal argument as a client writes it: the flag, then its value when it
 * has one. An argument that has no value and a description or default is one
 * the client asks the user for, so it stands for what they would accept.
 */
const literal = (argument: Argument): string[] => {
  const value = argument.value ?? argument.default;
  if (argument.type === 'positional') return value === undefined ? [] : [value];
  return value === undefined ? [argument.name as string] : [argument.name as string, value];
};

/**
 * The command a registry client builds from an npm entry, in the order VS
 * Code's installer builds it (src/vs/platform/mcp/common/mcpManagementService.ts:
 * runtime arguments, then `identifier@version`, then package arguments), with
 * every prompted value at its default.
 */
const assembledCommand = (entry: Package): string[] => [
  entry.runtimeHint ?? 'npx',
  ...(entry.runtimeArguments ?? []).flatMap(literal),
  `${entry.identifier}@${entry.version}`,
  ...(entry.packageArguments ?? []).flatMap(literal),
];

describe('the MCP Registry entry', () => {
  it('uses the schema the registry publishes today', () => {
    expect(server().$schema).toBe(SCHEMA);
  });

  it('is named in the GitHub namespace of the repository that publishes it', () => {
    const owner = /github\.com\/([^/]+)\//.exec(library().repository.url)?.[1];

    expect(owner).toBeDefined();
    expect(server().name).toMatch(new RegExp(`^io\\.github\\.${owner}/[a-zA-Z0-9._-]+$`));
  });

  it('carries the name the registry looks for in the package it lists, and only there', () => {
    expect(wrapper().mcpName).toBe(server().name);
    expect(library().mcpName).toBeUndefined();
  });

  it('keeps the description within the 100 characters the registry accepts', () => {
    const { description } = server();

    expect(description.length).toBeGreaterThan(0);
    expect(description.length).toBeLessThanOrEqual(100);
  });

  it('points at the repository package.json names', () => {
    const repository = library()
      .repository.url.replace(/^git\+/, '')
      .replace(/\.git$/, '');

    expect(server().repository).toMatchObject({ url: repository, source: 'github' });
  });

  it('lists the nestlens-mcp package from the public npm registry, over stdio', () => {
    const entry = npmEntry();

    expect(server().packages).toHaveLength(1);
    expect(server().remotes).toBeUndefined();
    expect(entry).toMatchObject({
      registryType: 'npm',
      identifier: wrapper().name,
      transport: { type: 'stdio' },
    });
    expect(entry.registryBaseUrl ?? 'https://registry.npmjs.org').toBe(
      'https://registry.npmjs.org',
    );
  });

  it('is at the version package.json releases, in both places it records one', () => {
    expect(server().version).toBe(library().version);
    expect(npmEntry().version).toBe(library().version);
  });

  it('builds the plain npx command, with nothing passed to npx itself', () => {
    expect(npmEntry().runtimeArguments).toBeUndefined();
    expect(assembledCommand(npmEntry())).toEqual([
      'npx',
      `nestlens-mcp@${library().version}`,
      '--url',
      parseCliOptions([], {}).url,
    ]);
  });

  it('asks for the NestLens address, defaulting to the one the server defaults to', () => {
    const url = npmEntry().packageArguments?.find((argument) => argument.name === '--url');

    expect(url).toMatchObject({ type: 'named', default: parseCliOptions([], {}).url });
    expect(url?.value).toBeUndefined();
    expect(url?.description).toBeTruthy();
  });

  it('declares only environment variables the server reads', () => {
    const variables = npmEntry().environmentVariables ?? [];
    const samples: Record<string, string> = {
      NESTLENS_HEADERS: '{"Authorization":"Bearer x"}',
      NESTLENS_MCP_ALLOW_WRITE: 'true',
    };

    expect(variables.map(({ name }) => name).sort()).toEqual(Object.keys(samples).sort());
    for (const { name } of variables) {
      expect(parseCliOptions([], { [name]: samples[name] }), name).not.toEqual(
        parseCliOptions([], {}),
      );
    }
  });

  it('treats the headers as a secret nobody is made to give', () => {
    const headers = npmEntry().environmentVariables?.find(
      ({ name }) => name === 'NESTLENS_HEADERS',
    );

    expect(headers).toMatchObject({ isSecret: true, isRequired: false });
    expect(parseCliOptions([], { NESTLENS_HEADERS: '' }).headers).toEqual({});
  });

  it('leaves the write tools off unless the user turns them on', () => {
    const allowWrite = npmEntry().environmentVariables?.find(
      ({ name }) => name === 'NESTLENS_MCP_ALLOW_WRITE',
    );

    expect(allowWrite).toMatchObject({ format: 'boolean', isRequired: false });
    expect(parseCliOptions([], { NESTLENS_MCP_ALLOW_WRITE: allowWrite?.default }).allowWrite).toBe(
      false,
    );
  });

  it('stays out of both npm packages, since the registry does not read it from npm', () => {
    expect(library().files).not.toContain('server.json');
    expect(wrapper().files).not.toContain('server.json');
  });
});
