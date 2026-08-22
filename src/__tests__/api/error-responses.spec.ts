/**
 * What an error response is allowed to tell the caller.
 *
 * Two things were wrong, and the guard's refusal showed both. Measured against
 * a running application with `allowedIps` set to an address the caller does not
 * have:
 *
 *     403 {"error":{"code":"ERR_INTERNAL",
 *                   "message":"Access denied from this IP address",
 *                   "stack":"ForbiddenException: …50 frames…"}}
 *
 * The code says "internal error" for a refusal, so a client cannot tell "you
 * are not allowed" from "we broke" without reading the status as well. And the
 * stack hands the caller who has just been refused the deployment's absolute
 * paths, its framework versions and its middleware chain — which is what
 * `stackTraceSanitization` exists to keep out of recorded entries.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestLensModule } from '../../nestlens.module';

interface ErrorBody {
  success: boolean;
  data: null;
  error: { code: string; message: string; stack?: string; details?: unknown };
}

const boot = async (allowedIps?: string[]): Promise<{ app: INestApplication; url: string }> => {
  const moduleRef = await Test.createTestingModule({
    imports: [
      NestLensModule.forRoot({
        authorization: { allowedIps, allowedEnvironments: null },
        watchers: { request: false, exception: false, log: false },
      }),
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  await app.listen(0, '127.0.0.1');
  return { app, url: await app.getUrl() };
};

const ask = async (url: string, path: string): Promise<{ status: number; body: ErrorBody }> => {
  const response = await fetch(`${url}${path}`);
  return { status: response.status, body: (await response.json()) as ErrorBody };
};

describe('what an error response says', () => {
  jest.setTimeout(30_000);

  describe('to a caller the guard refused', () => {
    let app: INestApplication;
    let url: string;

    beforeAll(async () => {
      // An address this caller does not have.
      ({ app, url } = await boot(['10.99.99.99']));
    });

    afterAll(async () => {
      await app?.close();
    });

    it('refuses', async () => {
      expect((await ask(url, '/nestlens/__nestlens__/api/stats')).status).toBe(403);
    });

    it('names the refusal rather than calling it an internal error', async () => {
      const { body } = await ask(url, '/nestlens/__nestlens__/api/stats');

      expect(body.error.code).toBe('ERR_FORBIDDEN');
    });

    it('sends no stack trace', async () => {
      const { body } = await ask(url, '/nestlens/__nestlens__/api/stats');

      expect(body.error.stack).toBeUndefined();
    });

    it('names no file on this machine', async () => {
      const { body } = await ask(url, '/nestlens/__nestlens__/api/stats');

      expect(JSON.stringify(body)).not.toContain('node_modules');
      expect(JSON.stringify(body)).not.toContain(__dirname);
    });

    it('still says why, in words', async () => {
      const { body } = await ask(url, '/nestlens/__nestlens__/api/stats');

      expect(body.error.message).toMatch(/IP|denied/i);
      expect(body.success).toBe(false);
    });
  });

  describe('to a caller asking for something that is not there', () => {
    let app: INestApplication;
    let url: string;

    beforeAll(async () => {
      ({ app, url } = await boot());
    });

    afterAll(async () => {
      await app?.close();
    });

    it('says not found', async () => {
      const { status, body } = await ask(url, '/nestlens/__nestlens__/api/entries/9999999');

      expect(status).toBe(404);
      expect(body.error.code).toBe('ERR_ENTRY_NOT_FOUND');
    });

    it('sends no stack trace for a fault of the caller', async () => {
      const { body } = await ask(url, '/nestlens/__nestlens__/api/entries/9999999');

      expect(body.error.stack).toBeUndefined();
    });

    it('says which parameter was wrong, without a stack', async () => {
      const { status, body } = await ask(
        url,
        '/nestlens/__nestlens__/api/entries/cursor?limit=nonsense&type=notatype',
      );

      expect(status).toBe(400);
      expect(body.error.stack).toBeUndefined();
      expect(body.error.code).toBe('ERR_BAD_REQUEST');
    });
  });
});
