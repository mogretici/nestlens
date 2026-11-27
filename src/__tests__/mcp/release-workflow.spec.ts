/**
 * Every release publishes `nestlens-mcp` after `nestlens`, smoke-tests it as
 * npm serves it, and then publishes `server.json` to the official MCP Registry.
 *
 * Both npm packages are published with npm's trusted publishing — the OIDC
 * token of this workflow, no secret — and the registry accepts the same kind
 * of token, granting `io.github.<repository owner>/*` and nothing else
 * (registry: internal/api/handlers/v0/auth/github_oidc.go).
 *
 * The jobs are shaped by what goes wrong otherwise:
 *
 * - The library is published by semantic-release in the release job. The
 *   wrapper and the registry are jobs of their own, so a failure there cannot
 *   fail the release or skip the smoke test of the library.
 * - The commit the workflow ran on is not the release commit: the version
 *   bump, in `packages/mcp/package.json` and `server.json`, lives on the tag.
 * - A run that releases nothing must not publish, and a re-run after a
 *   partial failure must not try to publish a version npm already has.
 * - npm takes minutes to serve a new version, and the registry checks
 *   `mcpName` against what npm serves.
 * - The publisher binary is pinned and its Sigstore bundle verified, as the
 *   registry's own guide does, rather than fetched from `releases/latest`.
 *
 * Following AAA (Arrange-Act-Assert).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import { parse } from 'yaml';

const ROOT = resolve(__dirname, '..', '..', '..');

interface Step {
  readonly id?: string;
  readonly name?: string;
  readonly uses?: string;
  readonly run?: string;
  readonly with?: Record<string, unknown>;
  readonly 'working-directory'?: string;
}

interface Job {
  readonly needs?: string | readonly string[];
  readonly if?: string;
  readonly permissions?: Record<string, string>;
  readonly env?: Record<string, string>;
  readonly outputs?: Record<string, string>;
  readonly strategy?: { readonly matrix?: Record<string, unknown> };
  readonly steps: readonly Step[];
}

const workflow = (): Record<string, Job> =>
  (
    parse(readFileSync(join(ROOT, '.github', 'workflows', 'release.yml'), 'utf8')) as {
      jobs: Record<string, Job>;
    }
  ).jobs;

const needs = (job: Job): readonly string[] =>
  job.needs === undefined ? [] : typeof job.needs === 'string' ? [job.needs] : job.needs;

const runs = (step: Step, pattern: RegExp): boolean =>
  typeof step.run === 'string' && pattern.test(step.run);

const jobRunning = (pattern: RegExp, description: string): [string, Job] => {
  const found = Object.entries(workflow()).find(([, job]) =>
    job.steps.some((step) => runs(step, pattern)),
  );
  if (!found) throw new Error(`release.yml has no job that runs ${description}`);
  return found;
};

const wrapperPublisher = (): [string, Job] => jobRunning(/npm publish\b/, '`npm publish`');
const wrapperSmoke = (): [string, Job] =>
  jobRunning(/scripts\/smoke-mcp-package\.mjs/, 'scripts/smoke-mcp-package.mjs');
const registryPublisher = (): [string, Job] =>
  jobRunning(/mcp-publisher publish\b/, '`mcp-publisher publish`');

const RELEASE_TAG = 'v${{ needs.release.outputs.version }}';
const RELEASED = /needs\.release\.outputs\.released\s*==\s*'true'/;

describe('the release workflow', () => {
  it('decides "released" by comparing the version before and after semantic-release', () => {
    const { release } = workflow();
    const steps = release.steps;
    const semanticRelease = steps.findIndex((step) => runs(step, /semantic-release/));
    const reader = steps.findIndex((step) => runs(step, /released=/));
    const before = steps.findIndex(
      (step, index) =>
        index < semanticRelease && runs(step, /require\('\.\/package\.json'\)\.version/),
    );

    expect(release.outputs?.released).toMatch(/steps\.\w+\.outputs\.released/);
    expect(semanticRelease).toBeGreaterThan(-1);
    expect(before).toBeGreaterThan(-1);
    expect(reader).toBeGreaterThan(semanticRelease);
  });

  it('leaves nestlens-mcp out of semantic-release, which publishes the library only', () => {
    const config = JSON.parse(readFileSync(join(ROOT, '.releaserc.json'), 'utf8')) as {
      plugins: unknown[];
    };
    const npmPlugins = config.plugins.filter(
      (plugin) =>
        plugin === '@semantic-release/npm' ||
        (Array.isArray(plugin) && plugin[0] === '@semantic-release/npm'),
    );

    expect(npmPlugins).toHaveLength(1);
    expect(JSON.stringify(npmPlugins)).not.toMatch(/pkgRoot/);
  });

  it('does not hold up the smoke test of the library on anything after the release', () => {
    expect(needs(workflow().smoke)).toEqual(['release']);
  });
});

describe('publishing nestlens-mcp', () => {
  it('is a job of its own, after the release, only when something was released', () => {
    const [id, job] = wrapperPublisher();

    expect(id).not.toBe('release');
    expect(needs(job)).toEqual(['release']);
    expect(job.if).toMatch(RELEASED);
  });

  it('publishes packages/mcp from the release tag', () => {
    const [, job] = wrapperPublisher();
    const checkout = job.steps.find((step) => step.uses?.startsWith('actions/checkout@'));
    const publish = job.steps.find((step) => runs(step, /npm publish\b/));

    expect(checkout?.with?.ref).toBe(RELEASE_TAG);
    expect(publish?.['working-directory']).toBe('packages/mcp');
  });

  it('authenticates with the OIDC token of trusted publishing, and asks for nothing more', () => {
    const [, job] = wrapperPublisher();
    const setup = job.steps.find((step) => step.uses === './.github/actions/setup-node');

    expect(job.permissions).toEqual({ contents: 'read', 'id-token': 'write' });
    expect(setup?.with?.['registry-url']).toBe('https://registry.npmjs.org');
    expect(JSON.stringify(job)).not.toMatch(/secrets\.|NODE_AUTH_TOKEN|NPM_TOKEN/);
  });

  it('skips a version npm already has, so a re-run finishes the jobs after it', () => {
    const [, job] = wrapperPublisher();
    const publish = job.steps.find((step) => runs(step, /npm publish\b/));

    expect(publish?.run).toMatch(/npm view "nestlens-mcp@\$VERSION" version/);
    expect(publish?.run?.indexOf('npm view')).toBeLessThan(
      publish?.run?.indexOf('npm publish') ?? 0,
    );
  });
});

describe('smoke-testing nestlens-mcp', () => {
  it('starts what npm serves once it is published, on the Node versions the library is smoked on', () => {
    const [publisherId] = wrapperPublisher();
    const [, job] = wrapperSmoke();

    expect(needs(job)).toEqual(expect.arrayContaining(['release', publisherId]));
    expect(job.strategy?.matrix?.node).toEqual(workflow().smoke.strategy?.matrix?.node);
    expect(
      job.steps.some((step) =>
        runs(step, /smoke-mcp-package\.mjs \$\{\{ needs\.release\.outputs\.version \}\}/),
      ),
    ).toBe(true);
  });
});

describe('publishing to the MCP Registry', () => {
  it('is a job of its own, after nestlens-mcp is published', () => {
    const [publisherId] = wrapperPublisher();
    const [id, job] = registryPublisher();

    expect(id).not.toBe(publisherId);
    expect(needs(job)).toEqual(expect.arrayContaining(['release', publisherId]));
  });

  it('publishes the server.json of the release tag', () => {
    const [, job] = registryPublisher();
    const checkout = job.steps.find((step) => step.uses?.startsWith('actions/checkout@'));

    expect(checkout?.with?.ref).toBe(RELEASE_TAG);
  });

  it('authenticates with the OIDC token, and asks for nothing more', () => {
    const [, job] = registryPublisher();

    expect(job.permissions).toEqual({ contents: 'read', 'id-token': 'write' });
    expect(job.steps.some((step) => runs(step, /mcp-publisher login github-oidc\b/))).toBe(true);
    expect(JSON.stringify(job)).not.toMatch(/secrets\./);
  });

  it('waits until npm serves nestlens-mcp with the name the entry claims, before logging in', () => {
    const [, job] = registryPublisher();
    const wait = job.steps.findIndex(
      (step) => runs(step, /registry\.npmjs\.org\/nestlens-mcp\//) && runs(step, /mcpName/),
    );
    const login = job.steps.findIndex((step) => runs(step, /mcp-publisher login/));

    expect(wait).toBeGreaterThan(-1);
    expect(wait).toBeLessThan(login);
  });

  it('runs a pinned publisher whose signature it has checked', () => {
    const [, job] = registryPublisher();
    const source = JSON.stringify(job);

    expect(job.env?.MCP_PUBLISHER_VERSION).toMatch(/^v\d+\.\d+\.\d+$/);
    expect(source).not.toMatch(/releases\/latest/);
    expect(job.steps.some((step) => runs(step, /cosign verify-blob/))).toBe(true);
    expect(
      job.steps.find((step) => step.uses?.startsWith('sigstore/cosign-installer@'))?.uses,
    ).toMatch(/@[0-9a-f]{40}$/);
  });
});
