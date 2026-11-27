/**
 * Copies the library's version into the dashboard, its lockfile included.
 *
 * semantic-release runs this between bumping the root package and committing
 * the release. The lockfile records the version twice — at its top and as the
 * root package — and was left behind when only package.json was written.
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
