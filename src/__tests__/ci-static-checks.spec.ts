/**
 * Checks that only CI runs, and so only a workflow can lose.
 *
 * Every lockfile's dependency tree. The example's lockfile had grown from a
 * tree in which chokidar 4 owned the top of node_modules, and four copies of
 * @angular-devkit/core resolved their optional peer (`^5.0.0`) to it. `npm ci`
 * installs such a lock without a word; `npm ls --all --package-lock-only`
 * exits non-zero on it, reading the lockfile alone.
 *
 * The documentation site's type check. `npm run typecheck` in docs/ failed on
 * React 19's removal of the global `JSX` namespace while the build stayed
 * green, because only the build ran.
 *
 * The `nestlens-mcp` package. It has no build and no tests of its own, so
 * nothing would notice its bin calling a name `nestlens/mcp` no longer exports
 * until a release published it: CI type-checks the bin against the source and
 * starts it from freshly packed tarballs of both packages.
 *
 * Following AAA (Arrange-Act-Assert).
 */
import { describe, it, expect } from 'vitest';
import { allJobs } from './support/ci-matrix';
import type { Step } from './support/ci-matrix';
import { lockedDirectories } from './support/locked-directories';

const LS = 'npm ls --all --package-lock-only';

const stepsOf = (name: string): readonly Step[] =>
  allJobs().find((job) => job.name === name)?.steps ?? [];

/** The directories a `for dir in …; do` loop around `npm ls` walks. */
const checkedDirectories = (): string[] =>
  allJobs()
    .flatMap((job) => job.steps)
    .map((step) => step.run ?? '')
    .filter((run) => run.includes(LS))
    .flatMap((run) => /for dir in ([^;\n]+);/.exec(run)?.[1]?.trim().split(/\s+/) ?? []);

describe('CI', () => {
  it('checks the dependency tree of every lockfile', () => {
    const checked = checkedDirectories();

    const unchecked = lockedDirectories().filter((directory) => !checked.includes(directory));

    expect(unchecked).toEqual([]);
  });

  it('type-checks the documentation site where it builds it', () => {
    const steps = stepsOf('ci.yml docs');

    const typecheck = steps.find(
      (step) => step.run === 'npm run typecheck' && step['working-directory'] === 'docs',
    );

    expect(typecheck).toBeDefined();
  });

  it('type-checks the nestlens-mcp bin against the source of nestlens/mcp', () => {
    expect(stepsOf('ci.yml test').some((step) => step.run === 'npx tsc -p packages/mcp')).toBe(
      true,
    );
  });

  it('starts nestlens-mcp from tarballs of both packages, after the build', () => {
    const steps = stepsOf('ci.yml test');
    const build = steps.findIndex((step) => step.run === 'npm run build');
    const smoke = steps.findIndex((step) =>
      /smoke-mcp-package\.mjs --tarball .* --library-tarball /.test(step.run ?? ''),
    );

    expect(build).toBeGreaterThan(-1);
    expect(smoke).toBeGreaterThan(build);
  });
});
