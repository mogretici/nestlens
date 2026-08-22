/**
 * What the rate limiter is allowed to remember.
 *
 * It keeps an entry per address seen inside the window, removed only when the
 * sweep five minutes later finds it expired — and nothing bounded the map. A
 * dashboard reachable by many clients, or one behind a proxy that lets a caller
 * choose the address it is counted under, grows it with every new one. Measured
 * before the ceiling, with 200,000 distinct callers:
 *
 * ```text
 * entries held  200,000
 * keys          about 10 MB, none of them expired yet
 * ```
 *
 * The limiter itself still has to work for the ordinary case, which is a
 * handful of callers, so these check both halves.
 */
import { ExecutionContext, HttpException } from '@nestjs/common';
import { NestLensGuard } from '../../api/api.guard';
import { NestLensConfig } from '../../nestlens.config';

const contextFor = (ip: string): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ headers: {}, socket: { remoteAddress: ip }, ip }),
      getResponse: () => ({}),
    }),
  }) as unknown as ExecutionContext;

const build = (config: Partial<NestLensConfig> = {}): NestLensGuard =>
  new NestLensGuard({
    authorization: { allowedEnvironments: null },
    ...config,
  } as NestLensConfig);

const storeOf = (guard: NestLensGuard): Map<string, { count: number; resetAt: number }> =>
  (guard as unknown as { rateLimitStore: Map<string, { count: number; resetAt: number }> })
    .rateLimitStore;

const address = (index: number): string =>
  `10.${(index >> 16) & 255}.${(index >> 8) & 255}.${index & 255}`;

describe('the rate limiter', () => {
  jest.setTimeout(60_000);

  let guard: NestLensGuard;

  afterEach(() => {
    guard?.onModuleDestroy();
  });

  describe('what it remembers', () => {
    it('holds a bounded number of callers', async () => {
      guard = build();

      for (let i = 0; i < 20_000; i += 1) {
        await guard.canActivate(contextFor(address(i)));
      }

      expect(storeOf(guard).size).toBeLessThanOrEqual(5_000);
    });

    it('stays bounded however many arrive', async () => {
      guard = build();

      for (let i = 0; i < 60_000; i += 1) {
        await guard.canActivate(contextFor(address(i)));
      }

      expect(storeOf(guard).size).toBeLessThanOrEqual(5_000);
    });

    it('remembers the most recent callers rather than the first', async () => {
      guard = build();

      for (let i = 0; i < 20_000; i += 1) {
        await guard.canActivate(contextFor(address(i)));
      }

      expect(storeOf(guard).has(address(19_999))).toBe(true);
      expect(storeOf(guard).has(address(0))).toBe(false);
    });

    it('forgets a window that has closed', async () => {
      guard = build({ rateLimit: { windowMs: 1, maxRequests: 100 } });

      await guard.canActivate(contextFor('10.0.0.1'));
      await new Promise((resolve) => setTimeout(resolve, 5));
      await guard.canActivate(contextFor('10.0.0.1'));

      // One entry, re-created rather than accumulated.
      expect(storeOf(guard).size).toBe(1);
    });
  });

  describe('what it still does', () => {
    it('allows a caller under the limit', async () => {
      guard = build({ rateLimit: { windowMs: 60_000, maxRequests: 3 } });

      for (let i = 0; i < 3; i += 1) {
        await expect(guard.canActivate(contextFor('10.0.0.1'))).resolves.toBe(true);
      }
    });

    it('refuses one over it', async () => {
      guard = build({ rateLimit: { windowMs: 60_000, maxRequests: 2 } });

      await guard.canActivate(contextFor('10.0.0.1'));
      await guard.canActivate(contextFor('10.0.0.1'));

      await expect(guard.canActivate(contextFor('10.0.0.1'))).rejects.toThrow(HttpException);
    });

    it('counts each caller separately', async () => {
      guard = build({ rateLimit: { windowMs: 60_000, maxRequests: 1 } });

      await guard.canActivate(contextFor('10.0.0.1'));

      await expect(guard.canActivate(contextFor('10.0.0.2'))).resolves.toBe(true);
    });

    it('says when to come back', async () => {
      guard = build({ rateLimit: { windowMs: 60_000, maxRequests: 1 } });
      await guard.canActivate(contextFor('10.0.0.1'));

      await expect(guard.canActivate(contextFor('10.0.0.1'))).rejects.toMatchObject({
        response: { retryAfter: expect.any(Number) },
      });
    });
  });
});
