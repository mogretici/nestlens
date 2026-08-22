/**
 * Who a request came from, answered once.
 *
 * `X-Forwarded-For` is written by whoever sends the request. The guard learned
 * that when reading it unconditionally turned the IP whitelist into a
 * formality, and was changed to believe it only where the application says it
 * is behind a proxy. The request watcher and the GraphQL adapters were not,
 * and kept their own copies of the old rule, so with the default settings the
 * same product answered the same question two ways:
 *
 *     socket 203.0.113.7, header claims 10.0.0.1
 *       guard authorizes with   203.0.113.7
 *       dashboard records       10.0.0.1
 *
 * Which made the recorded address, the `ips` filter and the IP column whatever
 * the caller typed — an operator reading them during an incident is reading a
 * field the subject of the investigation wrote.
 */
import { resolveClientIp, AddressableRequest } from '../../core/client-ip';

const request = (
  headers: Record<string, string | string[] | undefined>,
  rest: Partial<AddressableRequest> = {},
): AddressableRequest => ({
  headers,
  socket: { remoteAddress: '203.0.113.7' },
  ...rest,
});

describe('resolving a client address', () => {
  describe('without a trusted proxy', () => {
    it('uses the socket address', () => {
      expect(resolveClientIp(request({}), false)).toBe('203.0.113.7');
    });

    it('ignores a forwarding header', () => {
      // The claim: this is the only thing the caller cannot choose.
      expect(resolveClientIp(request({ 'x-forwarded-for': '10.0.0.1' }), false)).toBe(
        '203.0.113.7',
      );
    });

    it('ignores it when the setting is simply absent', () => {
      expect(resolveClientIp(request({ 'x-forwarded-for': '10.0.0.1' }), undefined)).toBe(
        '203.0.113.7',
      );
    });

    it('still honours the host application enabling its own trust proxy', () => {
      // Express fills `request.ip` from the header itself in that case, which
      // is the host's decision to make.
      expect(
        resolveClientIp(request({ 'x-forwarded-for': '10.0.0.1' }, { ip: '10.0.0.1' }), false),
      ).toBe('10.0.0.1');
    });
  });

  describe('behind a trusted proxy', () => {
    it('reads the forwarding header', () => {
      expect(resolveClientIp(request({ 'x-forwarded-for': '10.0.0.1' }), true)).toBe('10.0.0.1');
    });

    it('takes the original client from a chain', () => {
      expect(
        resolveClientIp(request({ 'x-forwarded-for': '10.0.0.1, 9.9.9.9, 8.8.8.8' }), true),
      ).toBe('10.0.0.1');
    });

    it('takes the original client when the header arrived more than once', () => {
      // One branch used to split on commas and the other did not, so two
      // headers recorded "10.0.0.1, 9.9.9.9" as if that were an address.
      expect(
        resolveClientIp(request({ 'x-forwarded-for': ['10.0.0.1, 9.9.9.9', '7.7.7.7'] }), true),
      ).toBe('10.0.0.1');
    });

    it('trims the surrounding space', () => {
      expect(resolveClientIp(request({ 'x-forwarded-for': '  10.0.0.1 , 9.9.9.9' }), true)).toBe(
        '10.0.0.1',
      );
    });

    it('falls back to the socket when the header is empty', () => {
      expect(resolveClientIp(request({ 'x-forwarded-for': '' }), true)).toBe('203.0.113.7');
    });

    it('falls back to the socket when the header is only separators', () => {
      expect(resolveClientIp(request({ 'x-forwarded-for': ' , ' }), true)).toBe('203.0.113.7');
    });

    it('falls back to the socket when the header list is empty', () => {
      expect(resolveClientIp(request({ 'x-forwarded-for': [] }), true)).toBe('203.0.113.7');
    });
  });

  describe('when there is nothing to read', () => {
    it('returns undefined rather than an empty string', () => {
      expect(resolveClientIp({ headers: {} }, true)).toBeUndefined();
    });
  });
});
