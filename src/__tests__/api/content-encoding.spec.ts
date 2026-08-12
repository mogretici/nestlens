/**
 * Content negotiation for the bundled dashboard.
 *
 * The dashboard is a megabyte of JavaScript served by NestLens itself, and
 * nothing in front of it is guaranteed: a host application only compresses
 * responses if it happens to have installed compression middleware, and most
 * have not. Until this existed, every dashboard load pulled the bundle down
 * uncompressed — 292 KB where 85 KB would do.
 *
 * These are the rules that decide what leaves the process. Getting them wrong
 * is worse than not compressing at all: a body encoded in a way the client
 * refused is unreadable, and a shared cache can hand it to somebody else.
 *
 * Following AAA (Arrange-Act-Assert).
 */
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import {
  compress,
  isCompressible,
  MIN_COMPRESSED_BYTES,
  negotiateEncoding,
} from '../../api/content-encoding';

describe('negotiateEncoding', () => {
  it('returns nothing when the client sent no preference', () => {
    expect(negotiateEncoding(undefined)).toBeUndefined();
  });

  it('returns nothing when the client asked for encodings we do not produce', () => {
    expect(negotiateEncoding('compress, deflate, zstd')).toBeUndefined();
  });

  it('picks gzip when that is all the client accepts', () => {
    expect(negotiateEncoding('gzip, deflate')).toBe('gzip');
  });

  it('prefers brotli when both are equally acceptable', () => {
    expect(negotiateEncoding('gzip, deflate, br')).toBe('br');
  });

  it('honours an explicit preference for gzip over brotli', () => {
    expect(negotiateEncoding('br;q=0.1, gzip;q=0.9')).toBe('gzip');
  });

  /**
   * `q=0` is a refusal. A client that says `br;q=0` cannot decode brotli, and
   * answering with it anyway produces a response it can only discard.
   */
  it('treats q=0 as a refusal rather than a weak preference', () => {
    expect(negotiateEncoding('br;q=0, gzip')).toBe('gzip');
    expect(negotiateEncoding('br;q=0, gzip;q=0')).toBeUndefined();
  });

  it('accepts the wildcard as standing in for anything unnamed', () => {
    expect(negotiateEncoding('*')).toBe('br');
    expect(negotiateEncoding('br;q=0, *')).toBe('gzip');
  });

  it('reads the header case-insensitively and ignores spacing', () => {
    expect(negotiateEncoding('  GZIP ;  q=1.0 ')).toBe('gzip');
  });

  it('refuses an encoding whose q value is malformed rather than guessing', () => {
    expect(negotiateEncoding('br;q=high')).toBeUndefined();
  });
});

describe('isCompressible', () => {
  const large = MIN_COMPRESSED_BYTES;

  it.each([
    ['application/javascript; charset=utf-8', true],
    ['text/html; charset=utf-8', true],
    ['text/css; charset=utf-8', true],
    ['application/json; charset=utf-8', true],
    ['image/svg+xml', true],
    ['image/png', false],
    ['font/woff2', false],
    ['image/x-icon', false],
    ['application/octet-stream', false],
  ])('%s → %s', (contentType, expected) => {
    expect(isCompressible(contentType, large)).toBe(expected);
  });

  /**
   * Compressing a few hundred bytes usually produces more bytes than it saves,
   * once the gzip and brotli framing is paid for.
   */
  it('leaves bodies below the threshold alone', () => {
    expect(isCompressible('text/html; charset=utf-8', MIN_COMPRESSED_BYTES - 1)).toBe(false);
    expect(isCompressible('text/html; charset=utf-8', MIN_COMPRESSED_BYTES)).toBe(true);
  });
});

describe('compress', () => {
  // Repetitive enough to compress, long enough to be worth compressing.
  const payload = Buffer.from('const nestlens = "telescope for nestjs";\n'.repeat(200), 'utf8');

  it('produces a gzip body that decodes back to the original', async () => {
    const compressed = await compress(payload, 'gzip');

    expect(gunzipSync(compressed).equals(payload)).toBe(true);
    expect(compressed.length).toBeLessThan(payload.length);
  });

  it('produces a brotli body that decodes back to the original', async () => {
    const compressed = await compress(payload, 'br');

    expect(brotliDecompressSync(compressed).equals(payload)).toBe(true);
    expect(compressed.length).toBeLessThan(payload.length);
  });
});
