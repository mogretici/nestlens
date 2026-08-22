/**
 * A comment that reaches the documentation site has to survive MDX.
 *
 * The API reference is generated from these comments, and Docusaurus reads the
 * result as MDX — where a bare `{` starts a JavaScript expression. A block of
 * example output indented under a JSDoc line looks like a code block in an
 * editor, but typedoc strips the leading ` * ` and what is left is often not
 * indented far enough to still be one:
 *
 * ```text
 * without   413  {"statusCode":413,"message":"…"}
 * ```
 *
 * That has taken the documentation build down three times — `masking-terms.ts`,
 * `nestlens.config.ts`, `exception.watcher.ts` — each time discovered by the
 * two-minute docs job rather than by the suite. A fenced block survives; an
 * indented one does not.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const SOURCE = join(__dirname, '..', '..');

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (name === '__tests__' || name === 'dashboard') return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return name.endsWith('.ts') ? [path] : [];
  });

interface Offence {
  file: string;
  line: number;
  text: string;
}

/**
 * Lines inside a JSDoc block that are indented like a code block and carry a
 * brace, outside any fence.
 */
const unfencedBraceBlocks = (source: string, file: string): Offence[] => {
  const found: Offence[] = [];
  let inDoc = false;
  let inFence = false;

  source.split('\n').forEach((raw, index) => {
    const line = raw.trimStart();

    if (line.startsWith('/**')) {
      inDoc = true;
      inFence = false;
    }

    if (!inDoc) return;

    const body = line.replace(/^\*\s?/, '');

    if (body.trimStart().startsWith('```')) {
      inFence = !inFence;
      return;
    }

    if (!inFence && /^ {4,}\S/.test(body) && /[{}]/.test(body)) {
      found.push({ file, line: index + 1, text: body.trim().slice(0, 60) });
    }

    if (line.includes('*/')) {
      inDoc = false;
      inFence = false;
    }
  });

  return found;
};

describe('JSDoc that reaches the documentation site', () => {
  const files = sourceFiles(SOURCE);

  it('has sources to check', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('finds an indented brace block when there is one', () => {
    // Guards the guard: a detector that matched nothing would pass by default.
    const sample = ['/**', ' * Measured:', ' *', ' *     a  {"b":1}', ' */'].join('\n');

    expect(unfencedBraceBlocks(sample, 'sample.ts')).toHaveLength(1);
  });

  it('accepts the same block inside a fence', () => {
    const sample = ['/**', ' * ```text', ' * a  {"b":1}', ' * ```', ' */'].join('\n');

    expect(unfencedBraceBlocks(sample, 'sample.ts')).toEqual([]);
  });

  it('has none in the library', () => {
    const offences = files.flatMap((file) =>
      unfencedBraceBlocks(readFileSync(file, 'utf8'), file.slice(SOURCE.length + 1)),
    );

    expect(offences.map((o) => `${o.file}:${o.line} ${o.text}`)).toEqual([]);
  });
});
