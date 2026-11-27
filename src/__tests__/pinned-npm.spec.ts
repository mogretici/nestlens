/**
 * One npm writes and reads every lockfile.
 *
 * The four lockfiles had been written by three npm majors — CI's Node 22 ships
 * npm 10, contributors run 11, Dependabot defaults to 12 — and they disagree:
 * an npm 11 lock failed `npm ci` on npm 10 over an optional peer, npm 10.9
 * crashed resolving the dashboard's vitest, and npm 11.6.2 and 11.21.3 write the
 * example's lockfile differently.
 *
 * So each `package.json` beside a lockfile names the same npm, exactly, twice:
 * `packageManager`, which Dependabot installs through Corepack, and
 * `devEngines`, which npm 10.9 and later enforce before any command. CI cannot
 * rely on either — the runner's npm is whatever its Node ships — so every job
 * sets Node up through `.github/actions/setup-node`, which installs the npm
 * `packageManager` names before anything runs Node. And npm scripts call the
 * `npm` in `node_modules/.bin`, not the one on PATH, so the root lockfile has
 * to install that same version there.
 *
 * Workflows are read with a YAML parser, not as text: quoting, comments, CRLF
 * line endings and commented-out steps all fooled a text scan, and the rule is
 * tested against each of them below.
 *
 * Following AAA (Arrange-Act-Assert).
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { parse } from 'yaml';

const ROOT = resolve(__dirname, '..', '..');
const WORKFLOWS = join(ROOT, '.github', 'workflows');
const COMPOSITE = './.github/actions/setup-node';

interface Manifest {
  readonly packageManager?: string;
  readonly overrides?: Record<string, unknown>;
  readonly devEngines?: {
    readonly packageManager?: {
      readonly name?: string;
      readonly version?: string;
      readonly onFail?: string;
    };
  };
}

interface Step {
  readonly uses?: unknown;
  readonly run?: unknown;
  readonly with?: Record<string, unknown>;
}

interface Job {
  readonly id: string;
  readonly steps: readonly Step[];
}

/** The root and every top-level directory that keeps its own lockfile. */
const lockedDirectories = (): string[] => [
  '.',
  ...readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'node_modules')
    .map((entry) => entry.name)
    .filter((name) => existsSync(join(ROOT, name, 'package-lock.json')))
    .sort(),
];

const manifest = (directory: string): Manifest =>
  JSON.parse(readFileSync(join(ROOT, directory, 'package.json'), 'utf8')) as Manifest;

const pinnedSpec = (): string => manifest('.').packageManager ?? '';
const pinnedVersion = (): string => pinnedSpec().replace(/^npm@/, '');

/** The jobs a workflow declares, each with its steps in order. */
const jobsOf = (file: string, source: string): Job[] => {
  const document = parse(source) as { jobs?: Record<string, { steps?: Step[] }> } | null;

  return Object.entries(document?.jobs ?? {}).map(([name, job]) => ({
    id: `${file}:${name}`,
    steps: job?.steps ?? [],
  }));
};

/** Whether a shell script runs node, npm or npx, ignoring its comments. */
const runsNode = (script: string): boolean =>
  script
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line))
    .some((line) => /(^|[\s;&|(`$"'])(node|npm|npx)(\s|$)/.test(line));

const setsUpNode = (step: Step): boolean => step.uses === COMPOSITE;

const usesSetupNodeDirectly = (step: Step): boolean =>
  typeof step.uses === 'string' && step.uses.startsWith('actions/setup-node@');

/**
 * What is wrong with one workflow's use of npm. Empty when nothing is: every
 * job that runs Node has set it up through the composite action first, and
 * none reaches for actions/setup-node itself. Scripts count — the smoke job's
 * `node scripts/…` installs a package with npm, and no step of it says so.
 */
const violations = (file: string, source: string): string[] => {
  const jobs = jobsOf(file, source);
  if (jobs.length === 0) return [`${file}: declares no jobs`];

  return jobs.flatMap(({ id, steps }) => {
    const problems: string[] = [];
    const setup = steps.findIndex(setsUpNode);
    const first = steps.findIndex((step) => typeof step.run === 'string' && runsNode(step.run));

    if (first > -1 && (setup === -1 || setup > first)) {
      problems.push(`${id}: step ${first + 1} runs Node before ${COMPOSITE}`);
    }
    if (steps.some(usesSetupNodeDirectly)) {
      problems.push(`${id}: uses actions/setup-node directly`);
    }
    return problems;
  });
};

const workflows = (): { file: string; source: string }[] =>
  readdirSync(WORKFLOWS)
    .filter((file) => /\.ya?ml$/.test(file))
    .map((file) => ({ file, source: readFileSync(join(WORKFLOWS, file), 'utf8') }));

describe('the pinned npm', () => {
  describe('in package.json', () => {
    it('is named by the root as an exact version', () => {
      expect(pinnedSpec()).toMatch(/^npm@\d+\.\d+\.\d+$/);
    });

    it('finds every directory that keeps a lockfile', () => {
      expect(lockedDirectories()).toEqual(
        expect.arrayContaining(['.', 'dashboard', 'example', 'docs']),
      );
    });

    it.each(lockedDirectories())(
      '%s pins the same npm, and devEngines refuses every other version',
      (directory) => {
        const { packageManager, devEngines } = manifest(directory);

        expect(packageManager).toBe(pinnedSpec());
        expect(devEngines?.packageManager).toEqual({
          name: 'npm',
          version: pinnedVersion(),
          onFail: 'error',
        });
      },
    );

    /**
     * `npm run` puts `node_modules/.bin` first on PATH, so `build` calling
     * `npm run build` in the dashboard and `test:e2e` calling `npx playwright`
     * run the npm semantic-release installs there — not the pinned one CI put
     * on PATH. The override holds it to the pin; the lockfile shows it took.
     */
    it('is also the npm the root lockfile installs into node_modules/.bin', () => {
      const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8')) as {
        packages: Record<string, { version?: string }>;
      };

      expect(manifest('.').overrides?.npm).toBe(pinnedVersion());
      expect(lock.packages['node_modules/npm']?.version).toBe(pinnedVersion());
    });
  });

  describe('in CI', () => {
    const all = workflows();

    it('reads every workflow and finds the jobs that run Node', () => {
      const ids = all.flatMap(({ file, source }) => jobsOf(file, source));
      const running = ids.filter(({ steps }) =>
        steps.some((step) => typeof step.run === 'string' && runsNode(step.run)),
      );

      expect(all.length).toBeGreaterThan(3);
      expect(running.map(({ id }) => id)).toEqual(
        expect.arrayContaining([
          'ci.yml:test',
          'ci.yml:compatibility',
          'ci.yml:docs',
          'e2e.yml:e2e',
          'e2e.yml:production',
          'release.yml:release',
          'release.yml:smoke',
        ]),
      );
    });

    it.each(all.map(({ file }) => file))(
      '%s sets Node up through the composite action, before anything runs it',
      (file) => {
        const { source } = all.find((workflow) => workflow.file === file) as {
          source: string;
        };

        expect(violations(file, source)).toEqual([]);
      },
    );

    it('the composite action installs what package.json names, and keeps setup-node from caching', () => {
      const action = parse(readFileSync(join(ROOT, COMPOSITE, 'action.yml'), 'utf8')) as {
        runs: { steps: Step[] };
      };
      const steps = action.runs.steps;
      const setupNode = steps.find(usesSetupNodeDirectly);
      const install = steps.findIndex(
        (step) =>
          typeof step.run === 'string' &&
          /require\([^)]*package\.json'\)\.packageManager/.test(step.run) &&
          step.run.includes('npm install --global'),
      );

      expect(setupNode?.with?.['package-manager-cache']).toBe(false);
      expect(setupNode?.with).not.toHaveProperty('cache');
      expect(install).toBeGreaterThan(steps.indexOf(setupNode as Step));
    });
  });

  /**
   * Each of these got past the text scan this replaced. They are here so the
   * rule is seen to fail, not assumed to.
   */
  describe('the rule', () => {
    const job = (steps: string): string =>
      `on: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n${steps}`;
    const setup = `      - uses: ${COMPOSITE}\n        with:\n          node-version: 22\n`;

    it('passes a job that sets Node up first', () => {
      expect(violations('ok.yml', job(`${setup}      - run: npm ci\n`))).toEqual([]);
    });

    it.each([
      ['a double-quoted command', `      - run: "npm ci"\n`],
      ['a single-quoted command', `      - run: 'npx playwright test'\n`],
      [
        'a script that installs with npm',
        `      - run: node scripts/smoke-published-package.mjs\n`,
      ],
      ['a block script', `      - run: |\n          echo start\n          npm test\n`],
    ])('fails %s with no setup', (_name, steps) => {
      expect(violations('bad.yml', job(steps))).toHaveLength(1);
    });

    it('fails a setup that is commented out', () => {
      const steps = `      # - uses: ${COMPOSITE}\n      - run: npm ci\n`;

      expect(violations('bad.yml', job(steps))).toHaveLength(1);
    });

    it('fails a setup that comes after the first npm command', () => {
      expect(violations('bad.yml', job(`      - run: npm ci\n${setup}`))).toHaveLength(1);
    });

    it('fails actions/setup-node used directly', () => {
      const steps = `      - uses: actions/setup-node@v7\n${setup}      - run: npm ci\n`;

      expect(violations('bad.yml', job(steps))).toHaveLength(1);
    });

    it('reads `jobs:` with a comment after it', () => {
      const source = job(`      - run: npm ci\n`).replace('jobs:\n', 'jobs: # all of them\n');

      expect(violations('bad.yml', source)).toHaveLength(1);
    });

    it('reads CRLF line endings', () => {
      const source = job(`      - run: npm ci\n`).replace(/\n/g, '\r\n');

      expect(violations('bad.yml', source)).toHaveLength(1);
    });

    it('keeps a job with a comment after its name apart from the one before it', () => {
      const source =
        job(`${setup}      - run: npm ci\n`) +
        `  second: # no setup here\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm test\n`;

      expect(violations('bad.yml', source)).toEqual([
        `bad.yml:second: step 1 runs Node before ${COMPOSITE}`,
      ]);
    });

    it('fails a workflow it cannot find any jobs in', () => {
      expect(violations('bad.yml', 'on: push\n')).toEqual(['bad.yml: declares no jobs']);
    });
  });

  /**
   * Vercel builds with the npm its Node ships — 10 on Node 22, and on Node 24
   * an 11 older than the pin (24.22.1 ships 11.19.1) — and reads
   * `packageManager` only when Corepack is switched on in the project's
   * settings, outside the repository.
   */
  it('the documentation deployment installs it, and checks it, before its first npm command', () => {
    const { installCommand } = JSON.parse(
      readFileSync(join(ROOT, 'docs', 'vercel.json'), 'utf8'),
    ) as { installCommand?: string };

    const [install, check, ...rest] = (installCommand ?? '').split(' && ');

    expect(install).toBe(
      'npm install --global "$(node -p "require(\'../package.json\').packageManager")"',
    );
    expect(check).toBe(
      'test "npm@$(npm --version)" = "$(node -p "require(\'../package.json\').packageManager")"',
    );
    expect(rest.join(' && ')).toContain('npm ci');
  });

  it('CONTRIBUTING.md names the pinned version, and no other', () => {
    const guide = readFileSync(join(ROOT, 'CONTRIBUTING.md'), 'utf8');

    const named = [...guide.matchAll(/npm@\d+\.\d+\.\d+/g)].map(([spec]) => spec);

    expect(named.length).toBeGreaterThan(0);
    expect(new Set(named)).toEqual(new Set([pinnedSpec()]));
  });
});
