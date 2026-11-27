/**
 * A variant cannot follow a pseudo-element.
 *
 * `dark:` compiles to `&:is(.dark *)`, which on `::-webkit-scrollbar-track`
 * builds `::-webkit-scrollbar-track:is(.dark *)`: no selector may follow a
 * pseudo-element that way, so the build's minifier and every browser discard
 * the rule. Tailwind 3 moved the pseudo-element to the end; Tailwind 4 does
 * not, and says nothing. The dashboard's scrollbars stayed light in the dark
 * theme with the build green. Rules on a pseudo-element name their dark
 * selector in plain CSS instead.
 *
 * A media query is fine there: it wraps the rule rather than extending its
 * selector, and compiles to `@media (…) { ::-webkit-scrollbar-thumb { … } }`.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const SOURCE = join(__dirname, '..');

const PSEUDO_ELEMENT =
  /::[\w-]+|:(before|after|placeholder|selection|marker|backdrop|first-line|first-letter|file-selector-button)\b/;

/** An `@apply` with a variant (`dark:`, `hover:`, `group-hover:` …), or a `@variant` block. */
const VARIANT = /@apply[^;{}]*(^|\s)[\w-]+:|@variant\b/m;

const stylesheetsUnder = (directory: string): string[] =>
  readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (name === '__tests__') return [];
    if (statSync(path).isDirectory()) return stylesheetsUnder(path);

    return name.endsWith('.css') ? [path] : [];
  });

const resolve = (parent: string, selector: string): string => {
  if (!parent) return selector;
  return selector.includes('&') ? selector.replaceAll('&', parent) : `${parent} ${selector}`;
};

/**
 * Selectors of the rules that put a variant on a pseudo-element, following
 * nesting so `.row { &::before { … } }` is seen as `.row::before`.
 */
const variantsOnPseudoElements = (source: string): string[] => {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const offences: string[] = [];
  const stack: { selector: string; ownText: string; body: string; atRule: boolean }[] = [];
  let buffer = '';

  for (const char of css) {
    if (char === '{') {
      const prelude = buffer.trim();
      buffer = '';
      const parent = [...stack].reverse().find((frame) => !frame.atRule)?.selector ?? '';
      const atRule = prelude.startsWith('@');
      stack.push({ selector: atRule ? parent : resolve(parent, prelude), ownText: atRule ? prelude : '', body: '', atRule });
    } else if (char === '}') {
      const frame = stack.pop();
      if (!frame) continue;
      frame.ownText += buffer;
      frame.body += buffer;
      buffer = '';
      const owner = [...stack].reverse().find((candidate) => !candidate.atRule);
      if (frame.atRule && owner) {
        owner.ownText += frame.ownText.startsWith('@variant') ? ' @variant ' : ` ${frame.body}`;
      }
      if (!frame.atRule && PSEUDO_ELEMENT.test(frame.selector) && VARIANT.test(frame.ownText)) {
        offences.push(frame.selector);
      }
    } else if (char === ';' && stack.length > 0) {
      stack[stack.length - 1].ownText += buffer + ';';
      stack[stack.length - 1].body += buffer + ';';
      buffer = '';
    } else {
      buffer += char;
    }
  }

  return [...new Set(offences)];
};

describe('stylesheet', () => {
  it('scans the stylesheets that hold pseudo-element rules', () => {
    const sources = stylesheetsUnder(SOURCE).map((file) => readFileSync(file, 'utf8'));
    expect(sources.length).toBeGreaterThan(1);
    expect(sources.some((css) => /::-webkit-scrollbar/.test(css))).toBe(true);
  });

  it('applies no variant on a pseudo-element, where it is discarded', () => {
    const offences = stylesheetsUnder(SOURCE).flatMap((file) =>
      variantsOnPseudoElements(readFileSync(file, 'utf8')).map((selector) => `${file.slice(SOURCE.length + 1)}: ${selector}`),
    );
    expect(offences).toEqual([]);
  });

  it('catches a dark variant applied to a scrollbar part', () => {
    expect(
      variantsOnPseudoElements('::-webkit-scrollbar-track {\n  @apply bg-gray-100 dark:bg-gray-800;\n}'),
    ).toEqual(['::-webkit-scrollbar-track']);
  });

  it('catches the single-colon spelling of a pseudo-element', () => {
    expect(variantsOnPseudoElements('.row:after { @apply bg-red-500 dark:bg-blue-500; }')).toEqual([
      '.row:after',
    ]);
    expect(variantsOnPseudoElements('input:placeholder { @apply text-gray-400 dark:text-gray-500; }')).toEqual([
      'input:placeholder',
    ]);
  });

  it('catches a pseudo-element reached through nesting', () => {
    expect(variantsOnPseudoElements('.row { &::before { @apply hover:bg-red-500; } }')).toEqual([
      '.row::before',
    ]);
    expect(variantsOnPseudoElements('.row:after { & { @apply dark:bg-red-500; } }')).toEqual(['.row:after']);
  });

  it('catches a variant block inside a pseudo-element rule', () => {
    expect(
      variantsOnPseudoElements('::-webkit-scrollbar-thumb { background: red; @variant dark { background: blue; } }'),
    ).toEqual(['::-webkit-scrollbar-thumb']);
  });

  it('catches a variant applied inside a media query on a pseudo-element', () => {
    expect(
      variantsOnPseudoElements('::-webkit-scrollbar-thumb { @media (min-width: 640px) { @apply dark:bg-gray-600; } }'),
    ).toEqual(['::-webkit-scrollbar-thumb']);
  });

  it('allows a media query inside a pseudo-element rule, which compiles to a valid selector', () => {
    expect(
      variantsOnPseudoElements('::-webkit-scrollbar-thumb { background: red; @media (min-width: 640px) { background: blue; } }'),
    ).toEqual([]);
  });

  it('allows variants on ordinary rules and pseudo-classes', () => {
    expect(variantsOnPseudoElements('.row:hover { @apply dark:bg-red-500; } body { @apply antialiased; }')).toEqual([]);
  });
});
