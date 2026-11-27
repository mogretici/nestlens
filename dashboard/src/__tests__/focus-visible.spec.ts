/**
 * A control that removes the browser's focus outline has to draw its own.
 *
 * The keyboard-shortcuts page says focus indicators are visible throughout,
 * and every interactive control in the dashboard pairs `focus:outline-hidden`
 * with a ring — except the two range filters, which removed the outline and
 * put nothing in its place. A keyboard reader tabbing through the toolbar
 * lost the cursor there.
 *
 * Source-level, because this is a mistake that reads as a style choice: the
 * class is right there beside the others that do it correctly.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const SOURCE = join(__dirname, '..');

const filesUnder = (directory: string): string[] =>
  readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (name === '__tests__') return [];
    if (statSync(path).isDirectory()) return filesUnder(path);

    return name.endsWith('.ts') || name.endsWith('.tsx') ? [path] : [];
  });

/**
 * Tailwind 4 split the old `outline-none` in two: `outline-hidden` keeps an
 * invisible outline for forced-colors mode, `outline-none` really removes it.
 * Both leave a sighted keyboard user with nothing to follow.
 */
const OUTLINE_REMOVED = /focus:outline-(none|hidden)\b/;

interface SourceLine {
  location: string;
  text: string;
}

/** Every line whose classes turn the browser's focus outline off. */
const outlineRemovers = (): SourceLine[] =>
  filesUnder(SOURCE).flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .flatMap((text, index) =>
        OUTLINE_REMOVED.test(text)
          ? [{ location: `${file.slice(SOURCE.length + 1)}:${index + 1}`, text }]
          : [],
      ),
  );

/** Every class string that turns the outline off without drawing a ring. */
const unringed = (): string[] =>
  outlineRemovers()
    .filter(({ text }) => !text.includes('focus:ring') && !text.includes('focus-visible:'))
    .map(({ location }) => location);

describe('focus indicators', () => {
  it('find the controls that remove the outline', () => {
    expect(outlineRemovers().length).toBeGreaterThan(0);
  });

  it('are drawn wherever the outline is removed', () => {
    expect(unringed()).toEqual([]);
  });
});
