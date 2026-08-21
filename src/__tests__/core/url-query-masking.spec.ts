/**
 * A query string is masked wherever it is recorded, including inside the URL.
 *
 * A request's query string reaches storage twice: parsed into `query`, which
 * was masked, and whole inside `url`, which was not. So the same secret was
 * redacted in one field of the entry and printed in plain text in the other —
 * and `url` is the field the dashboard shows at the top of the page.
 *
 *     GET /reset?token=abc123   ->  payload.url = "/reset?token=abc123"
 *
 * Every password-reset link, every OAuth callback carrying a `code`, and every
 * API that takes its key in the query was stored readable. A sweep for
 * twenty-one credential-shaped names found forty-two leaks, all of them here.
 */
import { DataMaskerService } from '../../core/data-masker.service';

const REDACTED = '***REDACTED***';

describe('masking a URL', () => {
  const masker = new DataMaskerService();

  it('leaves a URL with no query alone', () => {
    expect(masker.maskUrl('/orders/12')).toBe('/orders/12');
  });

  it('leaves parameters that are not sensitive alone', () => {
    expect(masker.maskUrl('/orders?page=2&sort=asc')).toBe('/orders?page=2&sort=asc');
  });

  it('masks a sensitive parameter', () => {
    expect(masker.maskUrl('/reset?token=abc123')).toBe(
      `/reset?token=${encodeURIComponent(REDACTED)}`,
    );
  });

  it('masks only the sensitive parameters', () => {
    const masked = masker.maskUrl('/callback?code=xyz&state=ok&access_token=secret');

    expect(masked).toContain('state=ok');
    expect(masked).not.toContain('secret');
  });

  it('keeps the path exactly as it was', () => {
    // The path is what the entry is about. A segment is not a named field, so
    // there is nothing here to decide about it.
    const masked = masker.maskUrl('/users/me/password?token=abc');

    expect(masked.startsWith('/users/me/password?')).toBe(true);
  });

  it('handles an absolute URL', () => {
    const masked = masker.maskUrl('https://api.example.com/v1/pay?apiKey=live_123&amount=5');

    expect(masked.startsWith('https://api.example.com/v1/pay?')).toBe(true);
    expect(masked).toContain('amount=5');
    expect(masked).not.toContain('live_123');
  });

  it('keeps a fragment', () => {
    const masked = masker.maskUrl('/page?token=abc#section');

    expect(masked.endsWith('#section')).toBe(true);
    expect(masked).not.toContain('abc');
  });

  it('matches an encoded parameter name', () => {
    const masked = masker.maskUrl('/x?api%5Fkey=abc');

    expect(masked).not.toContain('abc');
  });

  it('survives a malformed escape', () => {
    // `decodeURIComponent` throws on this; the parameter is still handled.
    expect(() => masker.maskUrl('/x?%E0%A4%A=1&token=abc')).not.toThrow();
    expect(masker.maskUrl('/x?%E0%A4%A=1&token=abc')).not.toContain('abc');
  });

  it('leaves a valueless parameter alone', () => {
    expect(masker.maskUrl('/x?debug&token=abc')).toContain('debug');
  });

  it('handles an empty query', () => {
    expect(masker.maskUrl('/x?')).toBe('/x?');
  });

  it('honours a configured replacement', () => {
    const custom = new DataMaskerService({ maskReplacement: '[gone]' });

    expect(custom.maskUrl('/x?token=abc')).toContain(encodeURIComponent('[gone]'));
  });

  it('honours an added term', () => {
    const custom = new DataMaskerService({ sensitiveParams: ['iban'] });

    expect(custom.maskUrl('/pay?iban=TR00')).not.toContain('TR00');
  });

  it('honours a replaced list', () => {
    const narrow = new DataMaskerService({ sensitiveParams: { replace: ['iban'] } });

    expect(narrow.maskUrl('/pay?iban=TR00&token=abc')).not.toContain('TR00');
    // `token` is no longer named, so it is no longer masked.
    expect(narrow.maskUrl('/pay?iban=TR00&token=abc')).toContain('token=abc');
  });
});

describe('masking credentials inside a URL', () => {
  const masker = new DataMaskerService();

  it('masks the password in a connection string', () => {
    const masked = masker.maskUrl('postgres://app:hunter2@db.internal:5432/orders');

    expect(masked).not.toContain('hunter2');
    // The rest still identifies the connection, which is the point of storing it.
    expect(masked).toContain('postgres://app:');
    expect(masked).toContain('@db.internal:5432/orders');
  });

  it('masks the password in an https URL', () => {
    expect(masker.maskUrl('https://key:s3cret@api.example.com/v1')).not.toContain('s3cret');
  });

  it('leaves a bare username alone', () => {
    // A username is not a credential, and removing it would lose which account
    // the connection was for.
    expect(masker.maskUrl('redis://cache@127.0.0.1:6379')).toBe('redis://cache@127.0.0.1:6379');
  });

  it('masks both the credential and the query', () => {
    const masked = masker.maskUrl('https://u:p@api.example.com/pay?token=abc');

    expect(masked).not.toContain('p@');
    expect(masked).not.toContain('abc');
  });

  it('does not mistake an @ in a path for a credential', () => {
    expect(masker.maskUrl('/users/@handle/posts')).toBe('/users/@handle/posts');
  });

  it.each(['connectionString', 'connectionUri', 'dsn'])('masks a %s field', (field) => {
    const masked = masker.maskBody({ [field]: 'postgres://app:hunter2@db/orders' }) as Record<
      string,
      unknown
    >;

    expect(masked[field]).not.toContain('hunter2');
  });
});

describe('masking a command line', () => {
  const masker = new DataMaskerService();

  const argv = (args: string[]): unknown[] =>
    (masker.maskBody({ arguments: args }) as { arguments: unknown[] }).arguments;

  it('masks the value after a sensitive flag', () => {
    expect(argv(['seed', '--password', 'hunter2'])).toEqual(['seed', '--password', REDACTED]);
  });

  it('masks a value joined to its flag', () => {
    expect(argv(['--token=abc123'])).toEqual([`--token=${REDACTED}`]);
  });

  it('keeps the flag itself', () => {
    // Which flags were passed is most of what makes a recorded command useful.
    expect(argv(['--password', 'x'])[0]).toBe('--password');
  });

  it('leaves ordinary flags and values alone', () => {
    expect(argv(['migrate', '--env', 'production', '-v'])).toEqual([
      'migrate',
      '--env',
      'production',
      '-v',
    ]);
  });

  it('does not treat a positional argument as a secret', () => {
    // Nothing marks it, and guessing would redact the arguments worth reading.
    expect(argv(['seed', 'hunter2'])).toEqual(['seed', 'hunter2']);
  });

  it('stops masking after the one value it was told about', () => {
    expect(argv(['--password', 'x', 'then', 'more'])).toEqual([
      '--password',
      REDACTED,
      'then',
      'more',
    ]);
  });

  it('handles a single-dash flag', () => {
    expect(argv(['-token', 'abc'])).toEqual(['-token', REDACTED]);
  });

  it('leaves non-string elements alone', () => {
    expect(argv(['--retries', 3 as unknown as string])).toEqual(['--retries', 3]);
  });
});

describe('masking a payload that carries a URL', () => {
  const masker = new DataMaskerService();

  it('masks the query string in a url field', () => {
    const masked = masker.maskBody({ url: '/reset?token=abc123', method: 'GET' }) as Record<
      string,
      unknown
    >;

    expect(masked.url).not.toContain('abc123');
    expect(masked.method).toBe('GET');
  });

  it.each(['url', 'originalUrl', 'uri', 'href', 'requestUrl', 'fullUrl'])(
    'masks the query string in %s',
    (field) => {
      const masked = masker.maskBody({ [field]: '/x?token=abc123' }) as Record<string, unknown>;

      expect(masked[field]).not.toContain('abc123');
    },
  );

  it('masks a url nested inside the payload', () => {
    const masked = masker.maskBody({
      request: { url: '/x?apiKey=live_1' },
    }) as Record<string, Record<string, unknown>>;

    expect(masked.request.url).not.toContain('live_1');
  });

  it('does not rewrite an ordinary string that happens to contain a question mark', () => {
    // Only fields named as URLs are treated as URLs; a message body is not one.
    const masked = masker.maskBody({
      message: 'is this a token=abc123 ?',
    }) as Record<string, unknown>;

    expect(masked.message).toBe('is this a token=abc123 ?');
  });

  it('masks authorization wherever it appears', () => {
    // Masked as a header since the beginning, and as a field only now.
    const masked = masker.maskBody({
      authorization: 'Bearer live',
      url: '/x?authorization=Bearer%20live',
    }) as Record<string, unknown>;

    expect(masked.authorization).toBe(REDACTED);
    expect(masked.url).not.toContain('Bearer');
  });
});
