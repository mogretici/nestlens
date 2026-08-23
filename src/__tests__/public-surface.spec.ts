/**
 * What a consumer can reach.
 *
 * `package.json`'s `exports` map allows three entry points, so anything not
 * re-exported from `src/index.ts` is unreachable from outside — not merely
 * undocumented, unreachable, since a deep import is refused by Node.
 *
 * Two things were in that position.
 *
 * `NESTLENS_DUMP_SERVICE`: ten of the eleven watcher tokens were exported and
 * this one was not, so the dump watcher's automatic tracking — which wraps the
 * methods of a service provided under that token — could not be switched on by
 * anybody.
 *
 * Thirteen of the seventeen watcher classes, three of which the documentation
 * tells the reader to import by name:
 *
 *     require('nestlens').DumpWatcher   ->  undefined
 *     require('nestlens').GateWatcher   ->  undefined
 *     require('nestlens').BatchWatcher  ->  undefined
 *
 * Their manual `track*` methods are the documented way to use them, and there
 * was no way to hold one.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

/** Every markdown page under a directory. */
const collectMarkdown = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);

    if (statSync(path).isDirectory()) return collectMarkdown(path);
    return path.endsWith('.md') ? [path] : [];
  });

const SRC = resolve(__dirname, '..');
const index = readFileSync(join(SRC, 'index.ts'), 'utf8');

/**
 * The names `index.ts` actually re-exports.
 *
 * Read from the export statements rather than searched for in the file. The
 * first draft of this tested `new RegExp(name).test(index)`, and the comment
 * above the export block — which names the three watchers this exists for —
 * satisfied it: removing an export left the test green. A guard that its own
 * explanation defeats is not a guard.
 *
 * The second draft split the braces on commas and kept whatever came back,
 * which for a block with comments between its entries is `'// Tokens\n
 * NESTLENS_CONFIG'`. Comments come out first now.
 */
const exportedNames = (): Set<string> => {
  const withoutComments = index.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const names = new Set<string>();

  for (const match of withoutComments.matchAll(/export\s*\{([^}]+)\}\s*from/g)) {
    for (const binding of (match[1] as string).split(',')) {
      // `type X as Y` and `X as Y` both end in the exported name.
      const name = binding
        .trim()
        .split(/\s+as\s+/)
        .pop()
        ?.trim();
      if (name && /^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    }
  }

  return names;
};

const watcherFiles = readdirSync(join(SRC, 'watchers')).filter((f) => f.endsWith('.watcher.ts'));

/** Every injection token a watcher declares, with the file that declares it. */
const declaredTokens = (): { token: string; file: string }[] =>
  watcherFiles.flatMap((file) => {
    const source = readFileSync(join(SRC, 'watchers', file), 'utf8');

    return [...source.matchAll(/^export const (NESTLENS_\w+)/gm)].map((match) => ({
      token: match[1] as string,
      file,
    }));
  });

/** Every watcher class, with the file that declares it. */
const declaredWatchers = (): { name: string; file: string }[] =>
  watcherFiles.flatMap((file) => {
    const source = readFileSync(join(SRC, 'watchers', file), 'utf8');
    const match = /^export class (\w+Watcher)/m.exec(source);

    return match ? [{ name: match[1] as string, file }] : [];
  });

describe('the public surface', () => {
  it('has tokens to check', () => {
    expect(declaredTokens().length).toBeGreaterThan(5);
  });

  it('exports every injection token a watcher declares', () => {
    // A token that is not here cannot be imported, so the wiring it exists for
    // cannot be done.
    const exported = exportedNames();
    const unreachable = declaredTokens()
      .filter(({ token }) => !exported.has(token))
      .map(({ token, file }) => `${token} (declared in ${file})`);

    expect(unreachable).toEqual([]);
  });

  it('exports every watcher class', () => {
    const exported = exportedNames();
    const unreachable = declaredWatchers()
      .filter(({ name }) => !exported.has(name))
      .map(({ name, file }) => `${name} (declared in ${file})`);

    expect(unreachable).toEqual([]);
  });

  it('is what the documentation tells a reader to import', () => {
    // The failure was not a missing export in the abstract: three pages said
    // `import { … } from 'nestlens'` for a name that was not there.
    const docsRoot = resolve(__dirname, '..', '..', 'docs', 'docs');
    const pages = collectMarkdown(docsRoot);
    const exported = exportedNames();

    const broken = pages.flatMap((page) => {
      const source = readFileSync(page, 'utf8');

      return [...source.matchAll(/import \{([^}]+)\} from 'nestlens'/g)]
        .flatMap((match) => (match[1] as string).split(','))
        .map((name) => name.trim())
        .filter((name) => /^[A-Z][A-Za-z]*Watcher$|^NESTLENS_[A-Z_]+$/.test(name))
        .filter((name) => !exported.has(name))
        .map((name) => `${name} (told to import in ${page.replace(docsRoot, 'docs')})`);
    });

    expect([...new Set(broken)]).toEqual([]);
  });

  it('exports nothing that no longer exists', () => {
    const exported = [
      ...index.matchAll(/export \{ (NESTLENS_\w+) \} from '\.\/watchers\/([\w.-]+)'/g),
    ];
    const missing = exported
      .filter(([, token, module]) => {
        const source = readFileSync(join(SRC, 'watchers', `${module}.ts`), 'utf8');
        return !new RegExp(`export const ${token}\\b`).test(source);
      })
      .map(([, token]) => token);

    expect(missing).toEqual([]);
  });
});
