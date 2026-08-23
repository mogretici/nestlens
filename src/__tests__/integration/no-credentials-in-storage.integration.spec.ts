/**
 * Nothing credential-shaped reaches storage, by any route into an entry.
 *
 * The masking rules are tested in pieces elsewhere. This asks the only question
 * that matters at the end: drive a real request carrying secrets in every place
 * a request can carry them, then search everything stored for the values.
 *
 * Asked that way, it found forty-two leaks. Bodies and headers were clean and
 * `query` was masked, but the same query string was also recorded whole inside
 * `url` and nothing touched it — so a password-reset token was redacted in one
 * field of the entry and printed in the next.
 *
 * The check is a search for the literal values rather than an assertion about
 * particular fields, because the field that leaked was the one nobody had
 * thought to assert on.
 */
import { Body, Controller, Get, INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CollectorService } from '../../core/collector.service';
import { STORAGE, StorageInterface } from '../../core/storage/storage.interface';
import { NestLensModule } from '../../nestlens.module';

/** One distinctive value per field, so a hit names its own source. */
const SECRETS = {
  password: 'LEAK-password',
  passwd: 'LEAK-passwd',
  token: 'LEAK-token',
  tokens: 'LEAK-tokens',
  accessToken: 'LEAK-accessToken',
  refreshToken: 'LEAK-refreshToken',
  apiKey: 'LEAK-apiKey',
  apiKeys: 'LEAK-apiKeys',
  api_secret: 'LEAK-apiSecret',
  clientSecret: 'LEAK-clientSecret',
  secrets: 'LEAK-secrets',
  privateKey: 'LEAK-privateKey',
  authorization: 'LEAK-authorization',
  creditCard: 'LEAK-creditCard',
  card_number: 'LEAK-cardNumber',
  cvv: 'LEAK-cvv',
  ssn: 'LEAK-ssn',
  social_security: 'LEAK-socialSecurity',
  passwordHash: 'LEAK-passwordHash',
};

@Controller('vault')
class VaultController {
  @Post('store')
  store(@Body() body: unknown): { ok: boolean } {
    void body;
    return { ok: true };
  }

  @Get('lookup')
  lookup(): { ok: boolean } {
    return { ok: true };
  }
}

describe('credentials never reach storage', () => {
  jest.setTimeout(30_000);

  let app: INestApplication;
  let stored: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        NestLensModule.forRoot({
          watchers: { request: true, exception: true, log: true },
        }),
      ],
      controllers: [VaultController],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0, '127.0.0.1');
    const url = await app.getUrl();

    // 1. A body, including nested and inside an array.
    await fetch(`${url}/vault/store`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer LEAK-headerAuth',
        cookie: 'session=LEAK-cookie',
        'x-api-key': 'LEAK-headerApiKey',
      },
      body: JSON.stringify({
        ...SECRETS,
        nested: { deeper: { password: 'LEAK-nested' } },
        list: [{ token: 'LEAK-inArray' }],
      }),
    });

    // 2. A query string — the route that was leaking.
    const query = new URLSearchParams(
      Object.fromEntries(Object.entries(SECRETS).map(([k, v]) => [k, `${v}-query`])),
    );
    await fetch(`${url}/vault/lookup?${query.toString()}`);

    await app.get(CollectorService).flush();

    const entries = await app.get<StorageInterface>(STORAGE).find({ limit: 1000 });
    stored = JSON.stringify(entries);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('recorded the requests at all', () => {
    // Otherwise everything below passes for the wrong reason.
    expect(stored).toContain('/vault/store');
    expect(stored).toContain('/vault/lookup');
  });

  it.each(Object.entries(SECRETS))('does not store %s from the body', (_name, value) => {
    expect(stored).not.toContain(value);
  });

  it.each(Object.entries(SECRETS))('does not store %s from the query string', (_name, value) => {
    expect(stored).not.toContain(`${value}-query`);
  });

  it('does not store a secret nested inside the body', () => {
    expect(stored).not.toContain('LEAK-nested');
  });

  it('does not store a secret inside an array in the body', () => {
    expect(stored).not.toContain('LEAK-inArray');
  });

  it.each([
    ['authorization header', 'LEAK-headerAuth'],
    ['cookie header', 'LEAK-cookie'],
    ['x-api-key header', 'LEAK-headerApiKey'],
  ])('does not store the %s', (_name, value) => {
    expect(stored).not.toContain(value);
  });
});
