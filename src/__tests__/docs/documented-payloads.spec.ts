/**
 * Payloads the documentation shows have to be payloads the types accept.
 *
 * Five examples across four pages did not compile:
 *
 *     collect('log', { level: 'info', … })      -> no such level; it is 'log'
 *     collect('event', { name, payload })       -> `listeners` and `duration`
 *                                                  are required
 *     collectImmediate('exception', { …, customContext: {…} })
 *                                               -> no such field
 *
 * One of them sat under the heading "Use Type-Safe Entry Payloads — leverage
 * TypeScript for compile-time safety". Documentation is code somebody pastes,
 * and nothing was reading it.
 *
 * This walks every `collect` call in the docs and checks its keys against the
 * payload the entry type declares.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..');
const DOCS = join(ROOT, 'docs', 'docs');

const pages = (directory: string): string[] =>
  readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return pages(path);
    return name.endsWith('.md') || name.endsWith('.mdx') ? [path] : [];
  });

/** The payload each entry type declares: its keys, and which are required. */
const declaredPayloads = (): Map<string, { keys: Set<string>; required: Set<string> }> => {
  const declarations = new Map<string, { keys: Set<string>; required: Set<string> }>();

  for (const file of ['entry.types.ts', 'graphql.types.ts']) {
    const source = readFileSync(join(ROOT, 'src', 'types', file), 'utf8');

    for (const match of source.matchAll(/type: '([a-z-]+)';\s*\n\s*payload: \{\n/g)) {
      const body = source.slice(match.index! + match[0].length);
      const end = body.indexOf('\n  };');
      const keys = new Set<string>();
      const required = new Set<string>();

      // Top-level keys only: nested objects are indented further.
      for (const key of body.slice(0, end).matchAll(/^ {4}(\w+)(\??):/gm)) {
        keys.add(key[1]);
        if (key[2] !== '?') required.add(key[1]);
      }

      declarations.set(match[1], { keys, required });
    }
  }

  return declarations;
};

interface DocumentedCall {
  page: string;
  line: number;
  entryType: string;
  keys: string[];
  levels: string[];
}

/** Every `collect('type', { … })` written in the documentation. */
const documentedCalls = (): DocumentedCall[] => {
  const calls: DocumentedCall[] = [];

  for (const page of pages(DOCS)) {
    const text = readFileSync(page, 'utf8');

    for (const match of text.matchAll(/collect(?:Immediate)?\(\s*\n?\s*'([a-z-]+)'\s*,\s*\{/g)) {
      const start = text.indexOf('{', match.index! + match[0].length - 1);
      let depth = 0;
      let end = -1;

      for (let i = start; i < text.length; i += 1) {
        if (text[i] === '{') depth += 1;
        else if (text[i] === '}') {
          depth -= 1;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      if (end === -1) continue;

      const body = text.slice(start + 1, end);
      // Keys of this object, not of the objects nested inside it.
      const flattened = body.replace(/\{[^{}]*\}/g, "''");

      calls.push({
        page: page.slice(DOCS.length + 1),
        line: text.slice(0, match.index).split('\n').length,
        entryType: match[1],
        // `key: value`, `key,` and `...spread` all count as the key being set.
        keys: [...flattened.matchAll(/(?:^|[,{\n])\s*(\w+)\s*[:,\n]/g)].map((k) => k[1]),
        levels: [...body.matchAll(/level:\s*'(\w+)'/g)].map((l) => l[1]),
      });
    }
  }

  return calls;
};

const LEVELS = ['debug', 'log', 'warn', 'error', 'verbose'];

describe('the payloads the documentation shows', () => {
  const payloads = declaredPayloads();
  const calls = documentedCalls();

  it('finds the calls it is checking', () => {
    // A parser that matched nothing would pass every case below.
    expect(calls.length).toBeGreaterThan(20);
    expect(payloads.size).toBeGreaterThan(15);
  });

  it('names an entry type that exists', () => {
    const unknown = calls.filter((call) => !payloads.has(call.entryType));

    expect(unknown.map((c) => `${c.page}:${c.line} ${c.entryType}`)).toEqual([]);
  });

  it('sets no field the payload does not declare', () => {
    const wrong = calls.flatMap((call) => {
      const declared = payloads.get(call.entryType);
      if (!declared) return [];

      return call.keys
        .filter((key) => !declared.keys.has(key))
        .map((key) => `${call.page}:${call.line} ${call.entryType}.${key}`);
    });

    expect(wrong).toEqual([]);
  });

  it('sets every field the payload requires', () => {
    const missing = calls.flatMap((call) => {
      const declared = payloads.get(call.entryType);
      // Only the calls written out in full: an abbreviated one is not a claim
      // about the whole payload.
      if (!declared || call.keys.length === 0) return [];

      return [...declared.required]
        .filter((key) => !call.keys.includes(key))
        .map((key) => `${call.page}:${call.line} ${call.entryType}.${key}`);
    });

    expect(missing).toEqual([]);
  });

  it('uses a log level the type accepts', () => {
    const wrong = calls.flatMap((call) =>
      call.levels
        .filter((level) => !LEVELS.includes(level))
        .map((level) => `${call.page}:${call.line} level: '${level}'`),
    );

    expect(wrong).toEqual([]);
  });
});
