/**
 * The example application's own specs run in CI.
 *
 * The example has a Vitest unit project and an in-process e2e project that
 * boots AppModule — the whole library, every watcher, through a real Nest
 * application. Neither ran anywhere but a developer's machine: the Playwright
 * jobs install the example and start it, and nothing ran its specs, so a
 * library change that broke the example's bootstrap reached main with CI green
 * unless a browser happened to notice.
 *
 * The example installs NestLens from `file:..` as a copy, so its specs only
 * test the change when the library was built before the example was
 * installed. The order is part of what this checks.
 *
 * Its lint is checked in the same job. It had never run anywhere either, and
 * when it first did it found 738 problems: `any` standing in for entry
 * payload types, publishes nobody awaited, and a formatting pass nobody had
 * made. Type-aware rules need the example's dependencies installed, which
 * this job already does.
 *
 * Following AAA (Arrange-Act-Assert).
 */
import { describe, it, expect } from 'vitest';
import { allJobs, type Step } from './support/ci-matrix';

const inExample = (step: Step, run: RegExp): boolean =>
  step['working-directory'] === 'example' && run.test(step.run ?? '');

const isRootBuild = (step: Step): boolean =>
  step['working-directory'] === undefined && /^npm run build\b/.test(step.run ?? '');

const LINT = /^npm run lint$/;
const UNIT = /^npm test$/;
const E2E = /^npm run test:e2e$/;
const INSTALL = /^npm (ci|install)\b/;

const runningExampleSpecs = (): ReturnType<typeof allJobs> =>
  allJobs().filter(
    ({ steps }) =>
      steps.some((step) => inExample(step, UNIT)) && steps.some((step) => inExample(step, E2E)),
  );

describe("the example's specs in CI", () => {
  it('runs them in at least one job', () => {
    expect(runningExampleSpecs().map(({ name }) => name)).not.toEqual([]);
  });

  it.each(runningExampleSpecs().map(({ name }) => name))(
    '%s builds the library, then installs the example, then lints it and runs them',
    (name) => {
      const { steps } = runningExampleSpecs().find((job) => job.name === name)!;

      const build = steps.findIndex(isRootBuild);
      const install = steps.findIndex((step) => inExample(step, INSTALL));
      const lint = steps.findIndex((step) => inExample(step, LINT));
      const unit = steps.findIndex((step) => inExample(step, UNIT));
      const e2e = steps.findIndex((step) => inExample(step, E2E));

      expect(build).toBeGreaterThan(-1);
      expect(install).toBeGreaterThan(build);
      expect(lint, 'the example is linted in the same job').toBeGreaterThan(install);
      expect(unit).toBeGreaterThan(install);
      expect(e2e).toBeGreaterThan(install);
    },
  );

  it.each(runningExampleSpecs().map(({ name }) => name))(
    '%s runs on every pull request that changes the library or the example',
    (name) => {
      const { pullRequest } = runningExampleSpecs().find((job) => job.name === name)!;

      expect(pullRequest.runs).toBe(true);
      if (pullRequest.paths === undefined) return;
      expect(pullRequest.paths).toEqual(
        expect.arrayContaining(['src/**', 'example/**', 'package.json', 'package-lock.json']),
      );
    },
  );
});
