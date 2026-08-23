/**
 * Every configuration type an application can write is reachable from the
 * package root.
 *
 * `NestLensModule.forRoot(config)` takes a `NestLensConfig`, and anyone
 * building that object in a file of its own — a `nestlens.config.ts`, a factory,
 * a shared preset — needs the type of the part they are writing. A type that is
 * `export`ed from `nestlens.config.ts` but missing from `index.ts` cannot be
 * imported at all: the package compiles, the docs describe the option, and the
 * consumer gets `has no exported member`.
 *
 * Seven were missing when this was written — `GraphQLWatcherConfig`,
 * `SecurityConfig` and the alerting types among them — because the export list
 * is maintained by hand and a new option does not have to touch it. This reads
 * both files and compares, so the next one fails here.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (relative: string): string => readFileSync(join(__dirname, '..', relative), 'utf8');

/** Type names `nestlens.config.ts` declares for export. */
function declaredTypes(): string[] {
  const source = read('nestlens.config.ts');
  const names = [...source.matchAll(/^export (?:interface|type) (\w+)/gm)].map((m) => m[1]);

  return [...new Set(names)].sort();
}

/** Names re-exported from `index.ts`, whichever block they sit in. */
function exportedNames(): Set<string> {
  const source = read('index.ts');
  const names = new Set<string>();

  for (const block of source.matchAll(/export\s+(?:type\s+)?\{([\s\S]*?)\}\s*from/g)) {
    for (const raw of block[1].split(',')) {
      // Drop comments and `as` aliases, keep the exported identifier.
      const name = raw
        .replace(/\/\/[^\n]*/g, '')
        .split(/\s+as\s+/)[0]
        .trim();

      if (/^\w+$/.test(name)) names.add(name);
    }
  }

  for (const star of source.matchAll(/export \* from '([^']+)'/g)) {
    // A wildcard re-export carries everything in that module; recorded so a
    // type covered by one is not reported as missing.
    names.add(`*${star[1]}`);
  }

  return names;
}

describe('the public configuration surface', () => {
  const declared = declaredTypes();
  const exported = exportedNames();

  it('found the configuration types to check', () => {
    expect(declared).toContain('NestLensConfig');
    expect(declared.length).toBeGreaterThan(20);
  });

  it.each(declared)('exports %s from the package root', (name) => {
    expect(exported.has(name)).toBe(true);
  });

  it('exports the masking term type the security options are written in', () => {
    // Declared in `core/masking-terms.ts` rather than the config file, so the
    // sweep above does not cover it — and `sensitiveParams` cannot be typed
    // without it.
    expect(read('index.ts')).toContain('MaskingTerms');
  });
});
