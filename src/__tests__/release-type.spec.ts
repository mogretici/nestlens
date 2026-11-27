/**
 * scripts/check-release-type.mjs refuses a major release below 1.0.
 *
 * The commit analyzer reads a breaking change in any body line that starts,
 * in any case, with "breaking change" or "breaking-change" and a space or a
 * colon — prose included. Two such lines in the 0.19.0 branch analysed as
 * `major`, which would have released 1.0.0. These cases run the real analyzer.
 *
 * Following AAA (Arrange-Act-Assert).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import { analyzerConfig, decide } from '../../scripts/check-release-type.mjs';

const ROOT = resolve(__dirname, '..', '..');
const config = analyzerConfig(
  JSON.parse(readFileSync(join(ROOT, '.releaserc.json'), 'utf8')) as { plugins: unknown[] },
);
const commit = (message: string, hash = 'a'.repeat(40)) => ({ hash, message });
const check = (version: string, ...messages: string[]) =>
  decide({
    version,
    config,
    commits: messages.map((message, index) => commit(message, String(index).repeat(40))),
  });

describe('check-release-type', () => {
  it('reads the analyzer configuration .releaserc.json gives', () => {
    expect(config).toEqual({});
  });

  it('lets a feat through as a minor', async () => {
    expect(await check('0.18.1', 'feat(mcp): a new channel\n\nWhy it exists.')).toEqual({
      type: 'minor',
      ok: true,
      offenders: [],
    });
  });

  it('refuses a body line that starts with "breaking change:", in any case', async () => {
    const result = await check(
      '0.18.1',
      'docs: unrelated',
      'feat: something\n\nSome prose.\nbreaking change: the CLI moved.',
    );

    expect(result.type).toBe('major');
    expect(result.ok).toBe(false);
    expect(result.offenders).toEqual([
      { hash: '1'.repeat(40), lines: ['breaking change: the CLI moved.'] },
    ]);
  });

  it('refuses the prose line that slipped into the 0.19.0 branch', async () => {
    const result = await check(
      '0.18.1',
      'feat(mcp): x\n\nNo footer here, since a\nBREAKING CHANGE footer: it would release 1.0.0.',
    );

    expect(result.ok).toBe(false);
  });

  it('lets the phrase through in the middle of a line', async () => {
    const result = await check(
      '0.18.1',
      'feat(mcp): x\n\nThe commit carries no breaking change footer: it would release 1.0.0.',
    );

    expect(result).toMatchObject({ type: 'minor', ok: true });
  });

  it('reads `feat!:` as no release at all, because the angular preset has no `!`', async () => {
    // .releaserc.json names no preset, so the analyzer uses angular, whose
    // header pattern does not allow `!`: the commit does not parse, and makes
    // neither a major nor a minor. Measured, not assumed — a `!` is no way to
    // mark a breaking change here, and no way to cut 1.0 by accident either.
    expect(await check('0.18.1', 'feat!: drop the bin')).toEqual({
      type: null,
      ok: true,
      offenders: [],
    });
  });

  it('allows a major from 1.0 on', async () => {
    expect(await check('1.2.0', 'feat: x\n\nBREAKING CHANGE: the bin moved.')).toMatchObject({
      type: 'major',
      ok: true,
    });
  });
});
