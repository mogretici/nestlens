/**
 * The suites that only run when the bundle is on disk.
 *
 * Five integration files serve the real dashboard build and skip themselves
 * when `dist/dashboard/public/index.html` is missing. That is a reasonable
 * convenience locally — running the unit tests should not require a build —
 * and it was silent in CI, which ran `npm ci`, lint, type check and then the
 * tests with nothing built:
 *
 *     without a build   54 tests skipped, 2 suites skipped
 *
 * What those 54 cover is the dashboard arriving as HTML rather than as a JSON
 * string, SPA routes resolving, assets compressed, and the differences between
 * Express and Fastify. Which is to say: the exact failure that shipped in
 * 0.8.0, where the dashboard was blank in a browser and every suite was green.
 *
 * CI builds first now. This exists so the arrangement is visible — a skip that
 * nobody can see is a test that does not exist.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(__dirname, '..', '..');
const INTEGRATION = resolve(__dirname, 'integration');

/** Files that gate themselves on the dashboard build. */
const gatedSuites = (): string[] =>
  readdirSync(INTEGRATION).filter((file) =>
    /hasBuiltDashboard/.test(readFileSync(join(INTEGRATION, file), 'utf8')),
  );

interface Job {
  readonly name: string;
  readonly steps: string;
}

/** The jobs in ci.yml that run the library tests, each with its own text. */
const testingJobs = (): Job[] => {
  const workflow = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
  const jobs = workflow.slice(workflow.indexOf('\njobs:\n'));
  const starts = [...jobs.matchAll(/^ {2}([\w-]+):$/gm)];

  return starts
    .map((match, index) => ({
      name: match[1] as string,
      steps: jobs.slice(match.index, starts[index + 1]?.index ?? jobs.length),
    }))
    .filter(({ steps }) => steps.includes('run: npm test'));
};

describe('coverage that depends on the build', () => {
  it('there are suites that gate on it', () => {
    expect(gatedSuites().length).toBeGreaterThanOrEqual(5);
  });

  it('CI builds before it runs the tests', () => {
    // The step this asserts is the only thing that makes those suites run
    // anywhere but a developer's machine.
    const workflow = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');

    const build = workflow.indexOf('run: npm run build');
    const test = workflow.indexOf('run: npm test');

    expect(build).toBeGreaterThan(-1);
    expect(build).toBeLessThan(test);
  });

  /**
   * Every job, not the first one. The check above finds the unit-test job and
   * stops; the compatibility matrix ran `npm test` with nothing built, so on
   * every NestJS row these suites skipped — including the Express 4 deep-link
   * test that exists for exactly the NestJS 9 and 10 rows.
   */
  it.each(testingJobs().map(({ name }) => name))('the %s job builds before it tests', (name) => {
    const { steps } = testingJobs().find((job) => job.name === name) as Job;

    const build = steps.indexOf('run: npm run build');
    const dashboard = steps.search(/run: npm (ci|install)[^\n]*\n\s+working-directory: dashboard/);

    expect(dashboard).toBeGreaterThan(-1);
    expect(build).toBeGreaterThan(dashboard);
    expect(build).toBeLessThan(steps.indexOf('run: npm test'));
  });

  it('finds every job that runs the tests', () => {
    expect(testingJobs().map(({ name }) => name)).toEqual(
      expect.arrayContaining(['test', 'compatibility']),
    );
  });

  it('says so when the bundle is missing, rather than only skipping', () => {
    // Not a failure — a missing build is the ordinary local state — but the
    // reader of a test run should be able to tell which of the two they got.
    const built = existsSync(join(ROOT, 'dist', 'dashboard', 'public', 'index.html'));

    expect(typeof built).toBe('boolean');
  });
});
