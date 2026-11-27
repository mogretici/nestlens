#!/usr/bin/env node
/**
 * Fails when the commits since the last release would make semantic-release
 * cut a major version while NestLens is still below 1.0.
 *
 * The commit analyzer finds a breaking change in any body line that starts —
 * case-insensitively — with "breaking change" or "breaking-change" followed by
 * a space or a colon, not only in a footer. A branch about to release 0.19.0
 * carried two such lines in prose ("BREAKING CHANGE footer: it would release
 * 1.0.0."), and the range analysed as `major`: merging it would have released
 * 1.0.0, a version this project means to cut on purpose. Reading the messages
 * did not catch it; running the analyzer did. This runs the same analyzer, with
 * the configuration `.releaserc.json` gives it, over the same range: every
 * commit since the newest `v*` tag, which on a pull request's merge commit is
 * what the release would read.
 *
 * Usage:
 *   node scripts/check-release-type.mjs            # <newest v* tag>..HEAD
 *   node scripts/check-release-type.mjs <from>..<to>
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { analyzeCommits } from '@semantic-release/commit-analyzer';

const ANALYZER = '@semantic-release/commit-analyzer';

/** The analyzer's options as `.releaserc.json` gives them: `{}` for a bare entry. */
export const analyzerConfig = (releaseConfig) => {
  const entry = releaseConfig.plugins.find(
    (plugin) => plugin === ANALYZER || (Array.isArray(plugin) && plugin[0] === ANALYZER),
  );
  if (entry === undefined) throw new Error(`.releaserc.json does not use ${ANALYZER}`);
  return Array.isArray(entry) ? (entry[1] ?? {}) : {};
};

const silent = { log: () => {}, error: () => {}, warn: () => {}, success: () => {} };

const typeOf = (config, commits, cwd) =>
  analyzeCommits(config, { commits, logger: silent, cwd, options: {} });

/** The lines of one message that the analyzer can read as a breaking change. */
const suspectLines = (message) => {
  const [header, ...body] = message.split('\n');
  const lines = [];
  if (/^\w+(\([^)]*\))?!:/.test(header ?? '')) lines.push(header);
  for (const line of body) {
    if (/^[\s|*]*breaking[ -]change[:\s]/i.test(line)) lines.push(line);
  }
  return lines;
};

/**
 * The release the commits make, and whether it may be made at `version`.
 * A major below 1.0 is refused, with every commit that alone makes it major
 * and the lines responsible.
 */
export const decide = async ({ version, commits, config = {}, cwd = process.cwd() }) => {
  const type = await typeOf(config, commits, cwd);
  const preOne = Number(version.split('.')[0]) < 1;
  if (type !== 'major' || !preOne) return { type, ok: true, offenders: [] };

  const offenders = [];
  for (const commit of commits) {
    if ((await typeOf(config, [commit], cwd)) === 'major') {
      offenders.push({ hash: commit.hash, lines: suspectLines(commit.message) });
    }
  }
  return { type, ok: false, offenders };
};

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

const commitsIn = (range) => {
  const raw = git('log', '--format=%H%x00%B%x1e', range);
  return raw
    .split('\x1e')
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [hash, ...message] = record.split('\x00');
      return { hash, message: message.join('\x00').trim() };
    });
};

const main = async () => {
  const range =
    process.argv[2] ?? `${git('describe', '--tags', '--abbrev=0', '--match', 'v*')}..HEAD`;
  const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
  const { version } = read('package.json');
  const commits = commitsIn(range);
  const result = await decide({
    version,
    commits,
    config: analyzerConfig(read('.releaserc.json')),
  });

  console.log(
    `${commits.length} commit(s) in ${range}: ${result.type ?? 'no release'} from ${version}`,
  );
  if (result.ok) return;

  console.error(
    `\nThese would release a major version, ${version} → 1.0.0, which is not made by accident:`,
  );
  for (const { hash, lines } of result.offenders) {
    console.error(`\n  ${hash.slice(0, 7)}`);
    for (const line of lines) console.error(`    ${line}`);
  }
  console.error(
    '\nThe analyzer reads any body line starting with "breaking change" or "breaking-change"' +
      ' followed by a space or colon, in any case, as a breaking change. Reword it so the phrase' +
      ' is not at the start of a line, or drop the `!` from the type.',
  );
  process.exitCode = 1;
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
