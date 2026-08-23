/**
 * Path resolution.
 *
 * Everything that has to agree on "where is NestLens mounted" reads from this
 * module: the controller mount points, the dashboard's `<base href>` and the
 * watchers' self-filtering. Three separate releases fixed bugs caused by those
 * three answering differently, so the rules live here and are pinned here.
 */
import {
  isNestLensRequest,
  toBaseHref,
  toForwardedPrefix,
  toGlobalPrefix,
  toRoutePrefix,
} from '../../api/route-path';

describe('toRoutePrefix', () => {
  it.each([
    ['/nestlens', 'nestlens'],
    ['nestlens', 'nestlens'],
    ['/admin/monitoring', 'admin/monitoring'],
    ['/admin/monitoring/', 'admin/monitoring'],
    ['//admin//monitoring//', 'admin/monitoring'],
    ['  /nestlens  ', 'nestlens'],
    // An explicit empty path means the server root, same as '/'. Only an
    // absent path falls back to the default.
    ['/', ''],
    ['', ''],
  ])('normalizes %j to %j', (input, expected) => {
    expect(toRoutePrefix(input)).toBe(expected);
  });

  it('falls back to the default path when unset', () => {
    expect(toRoutePrefix(undefined)).toBe('nestlens');
  });
});

describe('toBaseHref', () => {
  it.each([
    ['/nestlens', '/nestlens'],
    ['nestlens', '/nestlens'],
    ['/admin/monitoring/', '/admin/monitoring'],
  ])('renders %j as %j', (input, expected) => {
    expect(toBaseHref(input)).toBe(expected);
  });

  it('renders a root mount as an empty string', () => {
    expect(toBaseHref('/')).toBe('');
  });
});

describe('toGlobalPrefix', () => {
  it.each([
    ['api', '/api'],
    ['/api', '/api'],
    ['/api/', '/api'],
    ['', ''],
  ])('normalizes %j to %j', (input, expected) => {
    expect(toGlobalPrefix(input)).toBe(expected);
  });

  it('returns an empty string when unset', () => {
    expect(toGlobalPrefix(undefined)).toBe('');
  });
});

describe('toForwardedPrefix', () => {
  describe('accepted values', () => {
    it.each([
      ['/tools', '/tools'],
      ['/tools/', '/tools'],
      ['/team-a/tools', '/team-a/tools'],
      ['  /tools  ', '/tools'],
      ['/a_b.c~d', '/a_b.c~d'],
    ])('accepts %j as %j', (input, expected) => {
      expect(toForwardedPrefix(input)).toBe(expected);
    });
  });

  describe('rejected values', () => {
    // The header is attacker-controlled. A value that reaches `<base href>`
    // repoints every asset and API call the dashboard makes, and a shared cache
    // in front of the application could serve that to other users — so anything
    // that is not a plain absolute path is dropped rather than repaired.
    it.each([
      ['//evil.com', 'protocol-relative authority'],
      ['https://evil.com', 'absolute URL'],
      ['http://evil.com/tools', 'absolute URL with path'],
      ['/tools/../../etc', 'traversal'],
      ['/..', 'traversal'],
      ['tools', 'no leading slash'],
      ['/tools?x=1', 'query string'],
      ['/tools#frag', 'fragment'],
      ['/tools"onload="alert(1)', 'quote breaking out of the attribute'],
      ['/tools<script>', 'markup'],
      ['/tools ext', 'whitespace inside'],
      ['/%2e%2e/etc', 'encoded traversal'],
      ['/', 'bare root adds nothing'],
      ['', 'empty'],
      ['   ', 'blank'],
    ])('rejects %j (%s)', (input) => {
      expect(toForwardedPrefix(input)).toBe('');
    });

    it('rejects a duplicated header', () => {
      expect(toForwardedPrefix(['/tools', '/other'])).toBe('');
    });

    it('rejects a missing header', () => {
      expect(toForwardedPrefix(undefined)).toBe('');
    });
  });
});

describe('isNestLensRequest', () => {
  it('matches the dashboard and the API at the default path', () => {
    expect(isNestLensRequest('/nestlens', undefined)).toBe(true);
    expect(isNestLensRequest('/nestlens/requests', undefined)).toBe(true);
    expect(isNestLensRequest('/__nestlens__/api/entries', undefined)).toBe(true);
  });

  it('does not match the host application', () => {
    expect(isNestLensRequest('/users', undefined)).toBe(false);
    expect(isNestLensRequest('/api/orders', undefined)).toBe(false);
  });

  it('follows a custom path', () => {
    expect(isNestLensRequest('/admin/monitoring/requests', '/admin/monitoring')).toBe(true);
    expect(isNestLensRequest('/nestlens', '/admin/monitoring')).toBe(false);
  });

  // Regression guard for 0.6.2: with a global prefix, NestLens stopped
  // recognising its own traffic and recorded every dashboard poll — burying real
  // entries and generating new ones on each refresh.
  it('follows a global prefix', () => {
    expect(isNestLensRequest('/api/nestlens', undefined, 'api')).toBe(true);
    expect(isNestLensRequest('/api/__nestlens__/api/entries', undefined, 'api')).toBe(true);
  });

  it('combines a global prefix with a custom path', () => {
    expect(isNestLensRequest('/api/dev/nestlens/requests', '/dev/nestlens', 'api')).toBe(true);
  });

  /**
   * The mount point was compared with `startsWith`, which does not know where a
   * path segment ends. `/nestlens` prefixes `/nestlens-admin` too, so an
   * application with a route of its own by that name had it silently left out of
   * its own recording.
   */
  it('does not match a route that merely starts with the mount point', () => {
    expect(isNestLensRequest('/nestlens-admin', undefined)).toBe(false);
    expect(isNestLensRequest('/nestlensified/x', undefined)).toBe(false);
    expect(isNestLensRequest('/__nestlens__-old', undefined)).toBe(false);
  });

  it('still matches the mount point itself and everything under it', () => {
    expect(isNestLensRequest('/nestlens', undefined)).toBe(true);
    expect(isNestLensRequest('/nestlens/', undefined)).toBe(true);
    expect(isNestLensRequest('/nestlens/assets/index-Bu05f2IL.js', undefined)).toBe(true);
  });

  /**
   * Mounted at the server root, NestLens has no path that identifies it — and
   * `''` prefixes every string there is. Every request in the application
   * therefore counted as NestLens's own traffic and the request and exception
   * watchers recorded nothing at all: measured on a real application, one
   * request to `/orders` produced zero entries.
   *
   * A root mount is the natural setting for `server`, where the dashboard has a
   * listener to itself and no reason to sit under a path.
   */
  describe('mounted at the server root', () => {
    it.each([['/'], ['']])('records the application under path %j', (path) => {
      expect(isNestLensRequest('/orders', path)).toBe(false);
      expect(isNestLensRequest('/', path)).toBe(false);
    });

    it('still knows its own API', () => {
      expect(isNestLensRequest('/__nestlens__/api/entries', '/')).toBe(true);
    });

    it('does not claim the global prefix as its own path', () => {
      // `path: '/'` with `setGlobalPrefix('api')` put the dashboard at `/api`,
      // and reading that as a mount point hid every route the application
      // serves under its prefix.
      expect(isNestLensRequest('/api/orders', '/', 'api')).toBe(false);
      expect(isNestLensRequest('/api/__nestlens__/api/entries', '/', 'api')).toBe(true);
    });
  });
});
