/**
 * The Node and NestJS versions CI runs, read from the workflows themselves.
 *
 * Parsed rather than matched: a regular expression over the text found the
 * first `node: [...]` in the file, which said nothing about which job it
 * belonged to and never saw a version added through `include`.
 */
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import { parse } from 'yaml';

const WORKFLOWS = resolve(__dirname, '..', '..', '..', '.github', 'workflows');

type MatrixValue = string | number;

interface Step {
  readonly uses?: string;
  readonly run?: string;
  readonly with?: Record<string, unknown>;
}

interface Job {
  readonly strategy?: {
    readonly matrix?: Record<string, unknown> & {
      readonly include?: ReadonlyArray<Record<string, MatrixValue>>;
    };
  };
  readonly steps?: readonly Step[];
}

const jobOf = (file: string, name: string): Job => {
  const document = parse(readFileSync(join(WORKFLOWS, file), 'utf8')) as {
    jobs?: Record<string, Job>;
  } | null;
  const job = document?.jobs?.[name];

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
