/**
 * Copies the library's version into the dashboard and the example, their
 * lockfiles included.
 *
 * semantic-release runs this between bumping the root package and committing
 * the release. The dashboard's lockfile records the version twice — at its top
 * and as the root package — and was left behind when only package.json was
 * written.
 *
 * The example installs the library from `file:..`, and its lockfile records
 * the library's manifest under `node_modules/nestlens`. Only the version
 * changes at release time: every other field it copies — dependency ranges,
 * engines, bin — changes in a commit of its own, where
 * src/__tests__/release-versions.spec.ts fails until the entry is regenerated
 * and npm re-resolves what those ranges pull in. Writing them here instead
 * would leave the lockfile naming ranges its own resolutions do not satisfy.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

const { version } = readJson('package.json');

const dashboard = readJson('dashboard/package.json');
writeJson('dashboard/package.json', { ...dashboard, version });

const lock = readJson('dashboard/package-lock.json');
lock.version = version;
lock.packages[''].version = version;
writeJson('dashboard/package-lock.json', lock);

const example = readJson('example/package-lock.json');
example.packages['node_modules/nestlens'].version = version;
writeJson('example/package-lock.json', example);
