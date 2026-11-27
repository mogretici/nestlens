/**
 * The root and every top-level directory that keeps its own lockfile.
 */
import { existsSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

export const ROOT = resolve(__dirname, '..', '..', '..');

export const lockedDirectories = (): string[] => [
  '.',
  ...readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'node_modules')
    .map((entry) => entry.name)
    .filter((name) => existsSync(join(ROOT, name, 'package-lock.json')))
    .sort(),
];
