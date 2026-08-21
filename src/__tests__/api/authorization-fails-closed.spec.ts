/**
 * What an authorization hook's answer means, and what happens when there is
 * none.
 *
 * The guard asked one question of `canAccess` — `result === false` — and let
 * everything else through. So every value a function returns when it has not
 * decided anything granted access:
 *
 *     canAccess: (req) => { if (!req.user) return false; }
 *
 * That hook, missing the branch its author forgot to write, returns `undefined`
 * for every authorised request and let everyone in.
 *
 * `requiredRoles` had the same shape from the other side. The check lived
 * inside the branch that runs when `canAccess` returns an object, so
 * configuring `requiredRoles: ['admin']` on its own protected nothing at all,
 * and configuring it beside a `canAccess` that returned plain `true` was the
 * same. Measured, with `requiredRoles: ['admin']` set in every case:
 *
 *     canAccess returns a user with the role      ALLOWED
 *     canAccess returns a user without it         denied
 *     canAccess returns true                      ALLOWED
 *     canAccess returns nothing                   ALLOWED
 *     canAccess returns null                      ALLOWED
 *     no canAccess at all                         ALLOWED
 *
 * Five of those seven are an authorization setting the operator wrote down and
 * that did nothing. An unrecognised answer means no now, and a role
 * requirement with no user to check is a refusal rather than a skip.
 */
import { ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { NestLensGuard } from '../../api/api.guard';
import { AuthorizationConfig, NestLensConfig } from '../../nestlens.config';

type Req = {
  headers: Record<string, string>;
  socket: { remoteAddress: string };
  nestlensUser?: unknown;
};

const contextFor = (request: Req): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({}) }),
  }) as unknown as ExecutionContext;

/** Runs the guard once and says whether it let the request through. */
const decide = async (
  authorization: AuthorizationConfig,
): Promise<{ allowed: boolean; request: Req }> => {
  const request: Req = { headers: {}, socket: { remoteAddress: '1.2.3.4' } };
  const guard = new NestLensGuard({
    enabled: true,
    // Environment is not what these are about.
    authorization: { allowedEnvironments: null, ...authorization },
  } as unknown as NestLensConfig);

  try {
    return { allowed: await guard.canActivate(contextFor(request)), request };
  } catch (error) {
    if (!(error instanceof ForbiddenException)) throw error;
    return { allowed: false, request };
  } finally {
    guard.onModuleDestroy();
  }
};

const allows = async (authorization: AuthorizationConfig): Promise<boolean> =>
  (await decide(authorization)).allowed;

describe('authorization fails closed', () => {
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
    error.mockRestore();
  });

  describe('an answer that is not a decision', () => {
    it.each([
      ['nothing at all', () => undefined],
      ['null', () => null],
      ['zero', () => 0],
      ['an empty string', () => ''],
      ['NaN', () => Number.NaN],
    ])('refuses when canAccess returns %s', async (_name, canAccess) => {
      expect(await allows({ canAccess: canAccess as never })).toBe(false);
    });

    it('refuses when canAccess throws', async () => {
      expect(
        await allows({
          canAccess: () => {
            throw new Error('the lookup failed');
          },
        }),
      ).toBe(false);
    });

    it('refuses when canAccess rejects', async () => {
      expect(await allows({ canAccess: async () => Promise.reject(new Error('down')) })).toBe(
        false,
      );
    });
  });

  describe('an answer that is a decision', () => {
    it('allows on true', async () => {
      expect(await allows({ canAccess: () => true })).toBe(true);
    });

    it('allows on a resolved true', async () => {
      expect(await allows({ canAccess: async () => true })).toBe(true);
    });

    it('refuses on false', async () => {
      expect(await allows({ canAccess: () => false })).toBe(false);
    });

    it('allows on a user', async () => {
      expect(await allows({ canAccess: () => ({ id: 7, name: 'Ada' }) })).toBe(true);
    });

    it('puts the user on the request', async () => {
      const { request } = await decide({ canAccess: () => ({ id: 7, name: 'Ada' }) });

      expect(request.nestlensUser).toEqual({ id: 7, name: 'Ada' });
    });

    it('allows when nothing is configured', async () => {
      expect(await allows({})).toBe(true);
    });
  });

  describe('a role requirement', () => {
    const ADMIN = { requiredRoles: ['admin'] };

    it('allows a user who has the role', async () => {
      expect(await allows({ ...ADMIN, canAccess: () => ({ id: 1, roles: ['admin'] }) })).toBe(true);
    });

    it('refuses a user who does not', async () => {
      expect(await allows({ ...ADMIN, canAccess: () => ({ id: 1, roles: ['viewer'] }) })).toBe(
        false,
      );
    });

    it('refuses a user with no roles at all', async () => {
      expect(await allows({ ...ADMIN, canAccess: () => ({ id: 1 }) })).toBe(false);
    });

    it('requires every role, not any of them', async () => {
      const bothNeeded = { requiredRoles: ['admin', 'ops'] };

      expect(await allows({ ...bothNeeded, canAccess: () => ({ id: 1, roles: ['admin'] }) })).toBe(
        false,
      );
      expect(
        await allows({ ...bothNeeded, canAccess: () => ({ id: 1, roles: ['admin', 'ops'] }) }),
      ).toBe(true);
    });

    it('refuses when canAccess granted without saying who', async () => {
      // There is no user, so there is nothing the requirement could be met by.
      expect(await allows({ ...ADMIN, canAccess: () => true })).toBe(false);
    });

    it('refuses when there is no canAccess to produce a user', async () => {
      // The case that protected nothing: a role requirement on its own.
      expect(await allows(ADMIN)).toBe(false);
    });

    it('says what is missing rather than only that it refused', async () => {
      await allows(ADMIN);

      const said = warn.mock.calls.map((call) => String(call[0])).join('\n');

      expect(said).toContain('requiredRoles');
      expect(said).toContain('canAccess');
    });

    it('changes nothing when no roles are required', async () => {
      expect(await allows({ requiredRoles: [], canAccess: () => true })).toBe(true);
      expect(await allows({ canAccess: () => true })).toBe(true);
    });
  });
});
