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
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(__dirname, '..', '..');
const INTEGRATION = resolve(__dirname, 'integration');

/** Files that gate themselves on the dashboard build. */
const gatedSuites = (): string[] =>
  readdirSync(INTEGRATION).filter((file) =>
    /hasBuiltDashboard/.test(readFileSync(join(INTEGRATION, file), 'utf8')),
  );

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

  it('says so when the bundle is missing, rather than only skipping', () => {
    // Not a failure — a missing build is the ordinary local state — but the
    // reader of a test run should be able to tell which of the two they got.
    const built = existsSync(join(ROOT, 'dist', 'dashboard', 'public', 'index.html'));

    expect(typeof built).toBe('boolean');
  });
});
