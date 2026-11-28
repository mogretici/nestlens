/**
 * The post-release smoke tests wait for what `npm install` reads.
 *
 * 0.20.0 published both packages, then failed both nestlens-mcp smoke jobs:
 * `npm view nestlens-mcp@0.20.0` answered — it reads the full packument — and
 * `npx nestlens-mcp@0.20.0` failed with ETARGET ten seconds later, because
 * install reads the abbreviated packument and the CDN caches the two apart.
 * The MCP Registry job, which needs the smoke tests, was skipped.
 *
 * Following AAA (Arrange-Act-Assert).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import { installable, waitForInstallable, type FetchLike } from '../../scripts/registry-wait.mjs';

const ROOT = resolve(__dirname, '..', '..');

/** A registry whose abbreviated documents list `published[name]`, one round at a time. */
const registry = (rounds: Record<string, string[]>[]) => {
  const requests: { url: string; accept: string }[] = [];
  let round = 0;
  const fetchImpl: FetchLike = async (url, init) => {
    requests.push({ url: url.toString(), accept: init.headers.accept });
    const name = decodeURIComponent(url.pathname.slice(1));
    const versions = rounds[Math.min(round, rounds.length - 1)][name] ?? [];
    return {
      ok: true,
      json: async () => ({ versions: Object.fromEntries(versions.map((v) => [v, {}])) }),
    };
  };
  return { fetchImpl, requests, next: () => (round += 1) };
};

describe('registry-wait', () => {
  it('asks for the abbreviated packument, the document npm install reads', async () => {
    // Arrange
    const { fetchImpl, requests } = registry([{ 'nestlens-mcp': ['0.20.0'] }]);

    // Act
    const ready = await installable('nestlens-mcp', '0.20.0', { fetchImpl });

    // Assert
    expect(ready).toBe(true);
    expect(requests).toEqual([
      {
        url: 'https://registry.npmjs.org/nestlens-mcp',
        accept: 'application/vnd.npm.install-v1+json',
      },
    ]);
  });

  it('waits for every package the install needs, not only the one it names', async () => {
    // Arrange: the wrapper appears first, the library it pins one round later.
    const { fetchImpl, next } = registry([
      { 'nestlens-mcp': ['0.20.0'], nestlens: ['0.19.1'] },
      { 'nestlens-mcp': ['0.20.0'], nestlens: ['0.20.0'] },
    ]);
    const logged: string[] = [];

    // Act
    await waitForInstallable(
      [
        ['nestlens-mcp', '0.20.0'],
        ['nestlens', '0.20.0'],
      ],
      {
        attempts: 5,
        intervalMs: 1,
        fetchImpl,
        sleep: async () => {
          next();
        },
        log: (line) => logged.push(line),
      },
    );

    // Assert
    expect(logged).toEqual(['  … waiting for nestlens@0.20.0 to be installable (1/5)']);
  });

  it('gives up after its attempts and names what never appeared', async () => {
    // Arrange
    const { fetchImpl } = registry([{ 'nestlens-mcp': ['0.19.1'] }]);
    let slept = 0;

    // Act
    const waiting = waitForInstallable([['nestlens-mcp', '0.20.0']], {
      attempts: 3,
      intervalMs: 1,
      fetchImpl,
      sleep: async () => {
        slept += 1;
      },
      log: () => undefined,
    });

    // Assert
    await expect(waiting).rejects.toThrow('nestlens-mcp@0.20.0 never became installable');
    expect(slept).toBe(2);
  });

  it('treats a registry error as not yet installable rather than failing the wait', async () => {
    // Arrange
    let calls = 0;
    const fetchImpl: FetchLike = async () => {
      calls += 1;
      if (calls === 1) throw new Error('ECONNRESET');
      return { ok: true, json: async () => ({ versions: { '0.20.0': {} } }) };
    };

    // Act / Assert
    await expect(
      waitForInstallable([['nestlens', '0.20.0']], {
        attempts: 2,
        intervalMs: 1,
        fetchImpl,
        sleep: async () => undefined,
        log: () => undefined,
      }),
    ).resolves.toBeUndefined();
  });

  it.each(['smoke-published-package.mjs', 'smoke-mcp-package.mjs'])(
    '%s waits through it, not through npm view',
    (script) => {
      // Arrange
      const source = readFileSync(join(ROOT, 'scripts', script), 'utf8');

      // Assert
      expect(source).toContain("from './registry-wait.mjs'");
      expect(source).not.toMatch(/\['view'/);
    },
  );

  it('the MCP smoke waits for the library too, which the wrapper pins', () => {
    const source = readFileSync(join(ROOT, 'scripts', 'smoke-mcp-package.mjs'), 'utf8');

    expect(source).toMatch(/\['nestlens-mcp', target\],\s*\['nestlens', target\]/);
  });
});
