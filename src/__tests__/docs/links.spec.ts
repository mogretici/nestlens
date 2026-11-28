/**
 * Links a reader follows out of the repository, and out of the documentation
 * site, have to land somewhere.
 *
 * Three kinds were found dead at once. SECURITY.md sent readers to
 * `mogretici.github.io/nestlens`, a host the documentation left long ago, for
 * the access-control and production pages — the two a security reporter needs.
 * The site's footer, its home page and the FAQ pointed at GitHub Discussions,
 * which this repository has never had enabled. And nothing checked either,
 * because a link is text until someone clicks it.
 *
 * This checks what can be known without the network: a documentation link
 * names a page that exists under `docs/docs/`, an issue-form link names a form
 * that exists, and neither the old host nor Discussions is linked.
 *
 * Following AAA (Arrange-Act-Assert).
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, relative, resolve } from 'path';
import { parse } from 'yaml';

const ROOT = resolve(__dirname, '..', '..', '..');
const DOCS = join(ROOT, 'docs', 'docs');
const ISSUE_TEMPLATES = join(ROOT, '.github', 'ISSUE_TEMPLATE');

const walk = (dir: string, extensions: readonly string[]): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'api-reference' || entry.name === 'node_modules'
        ? []
        : walk(path, extensions);
    }
    return extensions.some((extension) => entry.name.endsWith(extension)) ? [path] : [];
  });

/** Everything a reader sees: the repository's own pages, the forms, and the site's sources. */
const FILES = [
  ...[
    'README.md',
    'SECURITY.md',
    'CONTRIBUTING.md',
    'CODE_OF_CONDUCT.md',
    'RELEASING.md',
    'packages/mcp/README.md',
    'plugins/nestlens/skills/debug/SKILL.md',
    '.github/pull_request_template.md',
    'docs/docusaurus.config.ts',
  ].map((file) => join(ROOT, file)),
  ...walk(ISSUE_TEMPLATES, ['.yml']),
  ...walk(DOCS, ['.md', '.mdx']),
  ...walk(join(ROOT, 'docs', 'src'), ['.tsx', '.ts', '.md']),
];

const linksIn = (pattern: RegExp): { file: string; target: string }[] =>
  FILES.flatMap((path) =>
    [...readFileSync(path, 'utf8').matchAll(pattern)].map((match) => ({
      file: relative(ROOT, path),
      target: match[1],
    })),
  );

/** `getting-started/upgrading` is a page when either file Docusaurus reads for it exists. */
const isDocPage = (slug: string): boolean =>
  ['.md', '.mdx', '/index.md', '/index.mdx'].some((suffix) =>
    existsSync(join(DOCS, `${slug}${suffix}`)),
  );

describe('links out of the repository and the documentation site', () => {
  it('reads every file it means to', () => {
    // Arrange / Act
    const missing = FILES.filter((path) => !existsSync(path)).map((path) => relative(ROOT, path));

    // Assert
    expect(missing).toEqual([]);
    expect(FILES.length).toBeGreaterThan(50);
  });

  it('sends every documentation link to a page that exists', () => {
    // Arrange
    const links = linksIn(/https:\/\/nestlens-docs\.vercel\.app\/docs\/([A-Za-z0-9\-/]+)/g).filter(
      ({ target }) => !target.startsWith('api-reference'),
    );

    // Act
    const dead = links.filter(({ target }) => !isDocPage(target.replace(/\/$/, '')));

    // Assert
    expect(links.length).toBeGreaterThan(20);
    expect(dead).toEqual([]);
  });

  it('does not link the host the documentation moved away from', () => {
    // Act
    const stale = linksIn(/(mogretici\.github\.io\/nestlens[^\s)"']*)/g);

    // Assert
    expect(stale).toEqual([]);
  });

  it('does not link GitHub Discussions, which are not enabled', () => {
    // Enabling Discussions is the moment to delete this test.
    // Act
    const discussions = linksIn(/(github\.com\/mogretici\/nestlens\/discussions[^\s)"']*)/g);

    // Assert
    expect(discussions).toEqual([]);
  });

  it('names only issue forms that exist', () => {
    // Arrange
    const links = linksIn(
      /github\.com\/mogretici\/nestlens\/issues\/new\?template=([A-Za-z0-9_.-]+)/g,
    );

    // Act
    const missing = links.filter(({ target }) => !existsSync(join(ISSUE_TEMPLATES, target)));

    // Assert
    expect(links.length).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });
});

describe('the issue forms', () => {
  const forms = readdirSync(ISSUE_TEMPLATES)
    .filter((name) => name.endsWith('.yml') && name !== 'config.yml')
    .map((name) => ({
      name,
      form: parse(readFileSync(join(ISSUE_TEMPLATES, name), 'utf8')) as {
        name: string;
        description: string;
        body: { type: string; id?: string }[];
      },
    }));

  it('are the bug report and the feature request', () => {
    expect(forms.map(({ name }) => name).sort()).toEqual(['bug_report.yml', 'feature_request.yml']);
  });

  it.each(forms)('$name has the fields GitHub requires, and unique ids', ({ form }) => {
    // Arrange
    const ids = form.body.flatMap((field) => (field.id ? [field.id] : []));

    // Assert
    expect(form.name).toBeTruthy();
    expect(form.description).toBeTruthy();
    expect(form.body.some((field) => field.type !== 'markdown')).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('leave no blank issue as a way round them', () => {
    // Arrange
    const config = parse(readFileSync(join(ISSUE_TEMPLATES, 'config.yml'), 'utf8')) as {
      blank_issues_enabled: boolean;
      contact_links: { url: string }[];
    };

    // Assert
    expect(config.blank_issues_enabled).toBe(false);
    expect(config.contact_links.map(({ url }) => url)).toContain(
      'https://github.com/mogretici/nestlens/security/advisories/new',
    );
  });
});
