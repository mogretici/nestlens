/**
 * A control that removes the browser's focus outline has to draw its own.
 *
 * The keyboard-shortcuts page says focus indicators are visible throughout,
 * and every interactive control in the dashboard pairs `focus:outline-none`
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

/** Every class string that turns the outline off without drawing a ring. */
const unringed = (): string[] => {
  const offences: string[] = [];

  for (const file of filesUnder(SOURCE)) {
    const source = readFileSync(file, 'utf8');

    source.split('\n').forEach((line, index) => {
      if (!line.includes('focus:outline-none')) return;
      if (line.includes('focus:ring') || line.includes('focus-visible:')) return;

      offences.push(`${file.slice(SOURCE.length + 1)}:${index + 1}`);
    });
  }

  return offences;
};

describe('focus indicators', () => {
  it('are drawn wherever the outline is removed', () => {
    expect(unringed()).toEqual([]);
  });
});
