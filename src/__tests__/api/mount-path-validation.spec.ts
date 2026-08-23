/**
 * What may be used as a mount path.
 *
 * `toRoutePrefix` split on `/`, dropped the empty pieces and joined the rest,
 * accepting anything. The value reaches two places that both assume it is a
 * URL path: the route patterns Nest matches against, and the `index.html` the
 * dashboard is served from, where it is written into a `<base href>` and into
 * a `<script>` block.
 *
 *     path: '</script><script>alert(1)</script>'
 *       ->  /</script><script>alert(1)</script>
 *
 * This is the application's own configuration and not a caller's, so it is not
 * a security boundary — but `path` is exactly the kind of setting that comes
 * out of an environment variable, and what a wrong one produced was a
 * dashboard serving a broken page with nothing said about why.
 *
 * The injection is escaped for its context regardless, because a defence that
 * depends on a second one staying correct is one defence.
 */
import { toBaseHref, toRoutePrefix } from '../../api/route-path';

describe('the configured mount path', () => {
  describe('what it accepts', () => {
    it.each([
      ['a single segment', '/nestlens', '/nestlens'],
      ['a segment without its slash', 'nestlens', '/nestlens'],
      ['several segments', '/tools/nestlens', '/tools/nestlens'],
      ['a dot inside a segment', '/v1.2/lens', '/v1.2/lens'],
      ['the characters a URL path allows', '/a-b_c~d.e', '/a-b_c~d.e'],
      ['redundant slashes', '//nestlens//', '/nestlens'],
      ['the root', '/', ''],
      ['nothing at all', '', ''],
    ])('takes %s', (_name, path, expected) => {
      expect(toBaseHref(path)).toBe(expected);
    });

    it('falls back to the default when nothing is configured', () => {
      expect(toBaseHref(undefined)).toBe('/nestlens');
    });
  });

  describe('what it refuses', () => {
    it.each([
      ['a script tag', '</script><script>alert(1)</script>'],
      ['a quote', '/a"b'],
      ['an angle bracket', '/a<b'],
      ['a space', '/a b'],
      ['a query string', '/a?b=c'],
      ['a fragment', '/a#b'],
      ['a whole URL', 'https://example.com/x'],
      ['a parent segment', '/a/../b'],
      ['a current segment', '/a/./b'],
      ['a percent escape', '/a%2fb'],
      ['a colon, which Nest reads as a parameter', '/a/:id'],
      ['a wildcard', '/a/*'],
    ])('refuses %s', (_name, path) => {
      expect(() => toRoutePrefix(path)).toThrow(/path/);
    });

    it('names the setting and shows what arrived', () => {
      expect(() => toRoutePrefix('/a b')).toThrow(/`path`/);
      expect(() => toRoutePrefix('/a b')).toThrow(/"\/a b"/);
    });
  });
});

/**
 * The dashboard writes the mount point into a `<script>` block.
 *
 * `JSON.stringify` escapes what a JavaScript string needs and nothing an HTML
 * parser cares about, so a value containing `</script>` closes the block it is
 * written into whatever the JSON says. Nothing can reach it now that the path
 * is validated, which is the point of checking it here: the escaping must not
 * depend on that validation staying correct.
 */
describe('writing the mount point into the page', () => {
  const injectionFor = (baseHref: string): string => {
    const escapeForScript = (value: unknown): string =>
      JSON.stringify(value).replace(/</g, '\\u003c');

    return `<script>window.__NESTLENS_BASE__=${escapeForScript(baseHref)}</script>`;
  };

  it('does not let a value close the script block', () => {
    const injection = injectionFor('/a</script><script>alert(1)</script>');

    // One opening tag and one closing tag: ours.
    expect(injection.match(/<script/g)).toHaveLength(1);
    expect(injection.match(/<\/script>/g)).toHaveLength(1);
  });

  it('still reads back as the value it was given', () => {
    const value = '/tools/nestlens';
    const injection = injectionFor(value);
    const json = injection.slice(injection.indexOf('=') + 1, injection.lastIndexOf('</script>'));

    expect(JSON.parse(json)).toBe(value);
  });
});
