import { brotliCompress, constants, gzip } from 'node:zlib';
import { promisify } from 'node:util';

const brotliAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

/** The encodings the dashboard can produce, best first. */
export type ContentEncoding = 'br' | 'gzip';
const SUPPORTED: readonly ContentEncoding[] = ['br', 'gzip'];

/**
 * Brotli quality, chosen by measurement rather than by the default.
 *
 * The largest bundled chunk (452 KB of JavaScript) compresses like this:
 *
 *   gzip level 6      106.8 KB    9.0 ms
 *   brotli quality 4  103.7 KB    7.8 ms
 *   brotli quality 5   95.7 KB    5.8 ms   ← chosen
 *   brotli quality 6   94.1 KB    9.8 ms
 *   brotli quality 11  84.8 KB  614.2 ms
 *
 * Quality 5 is smaller *and* faster than gzip; quality 11 buys another 11 KB for
 * a hundredfold cost. NestLens runs inside the application it observes, so a
 * measurable stall on first load is the one thing worth avoiding — and every
 * compression here also runs off the event loop, on zlib's thread pool.
 */
const BROTLI_QUALITY = 5;

/**
 * Below this, compression is a loss: the gzip and brotli framing costs tens of
 * bytes, and a small body often comes back larger than it went in.
 */
export const MIN_COMPRESSED_BYTES = 1024;

/**
 * Types whose bytes still contain redundancy.
 *
 * Images, fonts and archives are already compressed by their own formats —
 * running them through brotli spends CPU to produce something the same size or
 * slightly bigger. WOFF2 in particular is brotli internally.
 */
const COMPRESSIBLE_TYPE =
  /^(?:text\/|application\/(?:javascript|json|manifest\+json)|image\/svg\+xml)/;

export const isCompressible = (contentType: string, byteLength: number): boolean =>
  byteLength >= MIN_COMPRESSED_BYTES && COMPRESSIBLE_TYPE.test(contentType);

/** `token;q=0.5, other` → `{ token: 0.5, other: 1 }`. */
const parsePreferences = (header: string): Map<string, number> => {
  const preferences = new Map<string, number>();

  for (const entry of header.split(',')) {
    const [token, ...parameters] = entry.trim().split(';');
    if (!token) continue;

    const quality = parameters
      .map((parameter) => parameter.trim())
      .find((parameter) => parameter.startsWith('q='));
    const parsed = quality ? Number.parseFloat(quality.slice(2)) : 1;

    preferences.set(token.trim().toLowerCase(), Number.isFinite(parsed) ? parsed : 0);
  }

  return preferences;
};

/**
 * Picks the encoding to answer with, or `undefined` for the bytes as they are.
 *
 * `q=0` is a refusal, not a weak preference — `gzip;q=0` means the client would
 * rather have the file uncompressed, and a proxy that ignores that serves a body
 * the client cannot read. `*` stands in for anything not named.
 *
 * An equal preference is broken in brotli's favour: at the quality used here it
 * is both smaller and faster to produce than gzip.
 */
export const negotiateEncoding = (header?: string): ContentEncoding | undefined => {
  if (!header) return undefined;

  const preferences = parsePreferences(header);
  const wildcard = preferences.get('*');
  const qualityOf = (encoding: ContentEncoding): number =>
    preferences.get(encoding) ?? wildcard ?? 0;

  let best: ContentEncoding | undefined;
  let bestQuality = 0;

  for (const encoding of SUPPORTED) {
    const quality = qualityOf(encoding);
    if (quality > bestQuality) {
      best = encoding;
      bestQuality = quality;
    }
  }

  return best;
};

export const compress = (payload: Buffer, encoding: ContentEncoding): Promise<Buffer> =>
  encoding === 'br'
    ? brotliAsync(payload, {
        params: {
          [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY,
          [constants.BROTLI_PARAM_SIZE_HINT]: payload.length,
        },
      })
    : gzipAsync(payload);
