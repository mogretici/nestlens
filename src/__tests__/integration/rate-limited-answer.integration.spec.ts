/**
 * What a rate-limited caller is actually told.
 *
 * The guard computes how long until the limit resets and the documentation
 * described it as a field of the response body. The API's exception filter
 * keeps an exception's message and drops everything else, so the body carried
 * a message and nothing to act on:
 *
 * ```text
 * documented   { "statusCode": 429, "message": "…", "retryAfter": 60 }
 * sent         { "success": false, "error": { "code": …, "message": "…" } }
 * ```
 *
 * A client reading the documented field found nothing and had to guess — which
 * is what `Retry-After` exists to prevent.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestLensConfig } from '../../nestlens.config';
import { NestLensModule } from '../../nestlens.module';

interface Envelope {
  success: boolean;
  error?: { code?: string; message?: string; details?: { retryAfter?: number } };
}

describe('the answer to a caller over the limit', () => {
  jest.setTimeout(30_000);

  let app: INestApplication;
  let refused: Response;
  let body: Envelope;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        NestLensModule.forRoot({
          rateLimit: { windowMs: 60_000, maxRequests: 2 },
        } as NestLensConfig),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0, '127.0.0.1');

    const url = `${await app.getUrl()}/nestlens/__nestlens__/api/stats`;
    let last!: Response;
    for (let i = 0; i < 4; i += 1) {
      last = await fetch(url);
    }

    refused = last;
    body = (await last.json()) as Envelope;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('refuses with 429', () => {
    expect(refused.status).toBe(429);
  });

  it('says when to come back, in the header', () => {
    expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('says it in the body as well', () => {
    expect(body.error?.details?.retryAfter).toBeGreaterThan(0);
  });

  it('answers in the envelope every other endpoint uses', () => {
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('ERR_RATE_LIMITED');
  });

  it('lets a caller under the limit through', async () => {
    const other = await Test.createTestingModule({
      imports: [
        NestLensModule.forRoot({
          rateLimit: { windowMs: 60_000, maxRequests: 100 },
        } as NestLensConfig),
      ],
    }).compile();

    const second = other.createNestApplication();
    await second.init();
    await second.listen(0, '127.0.0.1');

    const response = await fetch(`${await second.getUrl()}/nestlens/__nestlens__/api/stats`);
    expect(response.status).toBe(200);

    await second.close();
  });
});
