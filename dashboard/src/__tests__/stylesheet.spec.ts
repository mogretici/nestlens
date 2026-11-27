/**
 * Tailwind 4 drops a variant it cannot place, without a warning.
 *
 * `dark:` compiles to `&:is(.dark *)`, and on a pseudo-element such as
 * `::-webkit-scrollbar-track` that lands after the `::`, where no selector may
 * follow. Tailwind 3 moved the pseudo-element to the end; Tailwind 4 emits
 * nothing, so the dashboard's scrollbars stayed light in the dark theme with
 * the build green. Rules on a pseudo-element name their dark selector in plain
 * CSS instead.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const STYLESHEET = join(__dirname, '..', 'index.css');

interface CssRule {
  selector: string;
  body: string;
}

const rules = (css: string): CssRule[] =>
  [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
    ([, selector, body]) => ({ selector: selector.trim(), body }),
  );

const variantsOnPseudoElements = (css: string): string[] =>
  rules(css)
    .filter(({ selector, body }) => selector.includes('::') && /@apply[^;]*\b\w+:/.test(body))
    .map(({ selector }) => selector);

describe('stylesheet', () => {
  it('reads the rules it checks', () => {
    expect(rules(readFileSync(STYLESHEET, 'utf8')).some(({ selector }) => selector.includes('::'))).toBe(
      true,
    );
  });

  it('applies no variant on a pseudo-element, where Tailwind 4 drops it', () => {
    expect(variantsOnPseudoElements(readFileSync(STYLESHEET, 'utf8'))).toEqual([]);
  });

  it('catches a dark variant applied to a scrollbar part', () => {
    expect(
      variantsOnPseudoElements('::-webkit-scrollbar-track {\n  @apply bg-gray-100 dark:bg-gray-800;\n}'),
    ).toEqual(['::-webkit-scrollbar-track']);
  });
});
