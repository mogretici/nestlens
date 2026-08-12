/**
 * Services that exist but are wired to nothing.
 *
 * `DataMaskerService` was written, tested, documented as "the global
 * DataMaskerService … across watchers", and named in the architecture note as
 * the step between collection and storage. Nothing ever provided it and no
 * watcher ever called it, so request bodies reached storage exactly as they
 * arrived — passwords included. `InputValidator` was the same story with the
 * limits under `security.validation`.
 *
 * Both were invisible because a class that compiles, has tests and is exported
 * looks finished. The question this asks is the one nobody was asking: is
 * anything using it?
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';

const SRC_ROOT = resolve(__dirname, '..');
const REPO_ROOT = resolve(SRC_ROOT, '..');

const sourceFiles = (dir: string, acc: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== '__tests__') sourceFiles(path, acc);
      continue;
    }
    if (name.endsWith('.ts') && !name.endsWith('.d.ts')) acc.push(path);
  }
  return acc;
};

/** Barrels re-export everything; being listed in one is not being used. */
const isBarrel = (path: string): boolean => path.endsWith('index.ts');

describe('every injectable service is wired to something', () => {
  const files = sourceFiles(SRC_ROOT);
  const contents = new Map(files.map((file) => [file, readFileSync(file, 'utf8')]));

  const injectables: Array<{ name: string; file: string }> = [];
  for (const [file, source] of contents) {
    for (const match of source.matchAll(/@Injectable\(\)\s*export class (\w+)/g)) {
      injectables.push({ name: match[1], file });
    }
  }

  it('finds services to check', () => {
    expect(injectables.length).toBeGreaterThan(10);
  });

  it.each(injectables.map(({ name, file }) => [name, file]))(
    '%s is referenced outside its own file',
    (name, file) => {
      const users = [...contents]
        .filter(([path]) => path !== file && !isBarrel(path))
        .filter(([, source]) => new RegExp(`\\b${name}\\b`).test(source))
        .map(([path]) => relative(REPO_ROOT, path));

      expect(users).not.toEqual([]);
    },
  );
});
