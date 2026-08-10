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
});
