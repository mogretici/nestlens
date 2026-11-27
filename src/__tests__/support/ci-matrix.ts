/**
 * What CI runs — the Node and NestJS versions, and the steps of each job —
 * read from the workflows themselves.
 *
 * Parsed rather than matched: a regular expression over the text found the
 * first `node: [...]` in the file, which said nothing about which job it
 * belonged to and never saw a version added through `include`.
 */
import { readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { parse } from 'yaml';

const WORKFLOWS = resolve(__dirname, '..', '..', '..', '.github', 'workflows');

type MatrixValue = string | number;

export interface Step {
  readonly name?: string;
  readonly uses?: string;
  readonly run?: string;
  readonly with?: Record<string, unknown>;
  readonly 'working-directory'?: string;
}

interface Job {
  readonly strategy?: {
    readonly matrix?: Record<string, unknown> & {
      readonly include?: ReadonlyArray<Record<string, MatrixValue>>;
    };
  };
  readonly steps?: readonly Step[];
}

interface Workflow {
  readonly on?:
    | string
    | readonly string[]
    | { readonly pull_request?: { readonly paths?: readonly string[] } | null };
  readonly jobs?: Record<string, Job>;
}

const workflowOf = (file: string): Workflow =>
  (parse(readFileSync(join(WORKFLOWS, file), 'utf8')) as Workflow | null) ?? {};

const jobOf = (file: string, name: string): Job => {
  const job = workflowOf(file).jobs?.[name];

  if (job === undefined) throw new Error(`${file} declares no job named ${name}`);

  return job;
};

const listOf = (job: Job, key: string): string[] => {
  const values = job.strategy?.matrix?.[key];

  return Array.isArray(values) ? values.map(String) : [];
};

const includedOf = (job: Job, key: string): string[] =>
  (job.strategy?.matrix?.include ?? [])
    .map((row) => row[key])
    .filter((value): value is MatrixValue => value !== undefined)
    .map(String);

/** `22.13.0` → 22, `26` → 26 */
export const majorOf = (version: string): number =>
  Number.parseInt(version.split('.')[0] ?? '', 10);

/** `ci.yml`'s compatibility job: its axes, and the rows `include` adds. */
export const compatibility = (): {
  readonly nodes: string[];
  readonly nestjs: string[];
  readonly includedNodes: string[];
  readonly include: ReadonlyArray<Record<string, MatrixValue>>;
} => {
  const job = jobOf('ci.yml', 'compatibility');

  return {
    nodes: listOf(job, 'node'),
    nestjs: listOf(job, 'nestjs'),
    includedNodes: includedOf(job, 'node'),
    include: job.strategy?.matrix?.include ?? [],
  };
};

/** `release.yml`'s smoke job: the Node versions it runs on, and its own steps. */
export const smoke = (): { readonly nodes: string[]; readonly steps: readonly Step[] } => {
  const job = jobOf('release.yml', 'smoke');

  return { nodes: listOf(job, 'node'), steps: job.steps ?? [] };
};

const isList = (value: unknown): value is readonly string[] => Array.isArray(value);

/** `on:` written as a name, a list of names, or a map of events to their filters. */
const pullRequestOf = (
  on: Workflow['on'],
): { readonly runs: boolean; readonly paths?: readonly string[] } => {
  if (on === undefined) return { runs: false };
  if (typeof on === 'string') return { runs: on === 'pull_request' };
  if (isList(on)) return { runs: on.includes('pull_request') };

  return { runs: 'pull_request' in on, paths: on.pull_request?.paths };
};

/** Every job in every workflow, with the paths its workflow runs on for a pull request. */
export const allJobs = (): ReadonlyArray<{
  readonly name: string;
  readonly steps: readonly Step[];
  readonly pullRequest: { readonly runs: boolean; readonly paths?: readonly string[] };
}> =>
  readdirSync(WORKFLOWS)
    .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
    .flatMap((file) => {
      const workflow = workflowOf(file);
      const pullRequest = pullRequestOf(workflow.on);

      return Object.entries(workflow.jobs ?? {}).map(([name, job]) => ({
        name: `${file} ${name}`,
        steps: job.steps ?? [],
        pullRequest,
      }));
    });
