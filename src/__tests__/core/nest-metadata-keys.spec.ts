/**
 * Nest's metadata keys, inlined.
 *
 * `@nestjs/common/constants` is not part of the package's public API, so the
 * library inlines the keys it reads or writes (as the response interceptor and
 * the tool manifest already did) and these assert they still match. Measured
 * identical in @nestjs/common 9.4.3, 10.4.22, 11.2.12 and 12.6.3.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { FILTER_CATCH_EXCEPTIONS, PATH_METADATA, VERSION_METADATA } from '@nestjs/common/constants';
import {
  FILTER_CATCH_EXCEPTIONS_KEY,
  PATH_METADATA_KEY,
  VERSION_METADATA_KEY,
} from '../../core/nest-metadata-keys';

const SRC = join(__dirname, '..', '..');

const library = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.name === '__tests__'
      ? []
      : entry.isDirectory()
        ? library(join(dir, entry.name))
        : entry.name.endsWith('.ts')
          ? [join(dir, entry.name)]
          : [],
  );

describe("Nest's metadata keys", () => {
  it('match the framework', () => {
    expect(PATH_METADATA_KEY).toBe(PATH_METADATA);
    expect(VERSION_METADATA_KEY).toBe(VERSION_METADATA);
    expect(FILTER_CATCH_EXCEPTIONS_KEY).toBe(FILTER_CATCH_EXCEPTIONS);
  });

  it('are never imported from @nestjs/common/constants by the library', () => {
    const files = library(SRC);
    const importing = files
      .filter((file) => /from '@nestjs\/common\/constants'/.test(readFileSync(file, 'utf8')))
      .map((file) => file.slice(SRC.length + 1));

    expect(files.length).toBeGreaterThan(50);
    expect(importing).toEqual([]);
  });
});
