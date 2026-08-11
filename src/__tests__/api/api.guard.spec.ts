/**
 * NestLensGuard Tests
 *
 * Tests for authorization, IP whitelisting, environment checks,
 * and role-based access control.
 */
import { ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NestLensGuard, NestLensRequest } from '../../api/api.guard';
import { NESTLENS_CONFIG, NestLensConfig } from '../../nestlens.config';

describe('NestLensGuard', () => {
  let guard: NestLensGuard;
  let mockConfig: NestLensConfig;

  const createMockContext = (overrides: Partial<NestLensRequest> = {}): ExecutionContext => {
    const request: Partial<NestLensRequest> = {
      ip: '127.0.0.1',
      headers: {},
      socket: { remoteAddress: '127.0.0.1' } as any,
      ...overrides,
    };

    return {
      switchToHttp: () => ({
        getRequest: () => request as NestLensRequest,
      }),
    } as ExecutionContext;
  };

  beforeEach(async () => {
    // Default config - enabled with development environment allowed
    mockConfig = {
      enabled: true,
      authorization: {
        allowedEnvironments: ['development', 'test'],
      },
    };

    // Set NODE_ENV to test
    process.env.NODE_ENV = 'test';

    const module: TestingModule = await Test.createTestingModule({
      providers: [NestLensGuard, { provide: NESTLENS_CONFIG, useValue: mockConfig }],
    }).compile();

    guard = module.get<NestLensGuard>(NestLensGuard);
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
    delete process.env.APP_ENV;
  });

  // ============================================================================
  // Enabled Check
  // ============================================================================

  describe('enabled check', () => {
    it('should return false when NestLens is disabled', async () => {
      // Arrange
      mockConfig.enabled = false;

      // Act
      const result = await guard.canActivate(createMockContext());

      // Assert
      expect(result).toBe(false);
    });

    it('should continue checks when NestLens is enabled', async () => {
      // Arrange
      mockConfig.enabled = true;

      // Act
      const result = await guard.canActivate(createMockContext());

      // Assert
      expect(result).toBe(true);
    });

    it('should allow access when enabled is undefined (default true)', async () => {
      // Arrange
      delete mockConfig.enabled;

      // Act
      const result = await guard.canActivate(createMockContext());

      // Assert
      expect(result).toBe(true);
    });
  });

  // ============================================================================
  // Environment Check
  // ============================================================================

  describe('environment check', () => {
    it('should allow access in allowed environment', async () => {
      // Arrange
      process.env.NODE_ENV = 'development';
      mockConfig.authorization!.allowedEnvironments = ['development', 'test'];

      // Act
      const result = await guard.canActivate(createMockContext());

      // Assert
      expect(result).toBe(true);
    });

    it('should deny access in disallowed environment', async () => {
      // Arrange
      process.env.NODE_ENV = 'production';
      mockConfig.authorization!.allowedEnvironments = ['development', 'test'];

      // Act & Assert
      await expect(guard.canActivate(createMockContext())).rejects.toThrow(ForbiddenException);
    });

    it('should use default allowed environments when not specified', async () => {
      // Arrange
      process.env.NODE_ENV = 'local';
      delete mockConfig.authorization;

      // Recreate guard with new config
      const module = await Test.createTestingModule({
        providers: [NestLensGuard, { provide: NESTLENS_CONFIG, useValue: mockConfig }],
      }).compile();
      const newGuard = module.get<NestLensGuard>(NestLensGuard);

      // Act
      const result = await newGuard.canActivate(createMockContext());

      // Assert
      expect(result).toBe(true);
    });

    it('should deny when empty allowed environments array', async () => {
      // Arrange
      const emptyEnvConfig: NestLensConfig = {
        enabled: true,
        authorization: { allowedEnvironments: [] },
      };
      const module = await Test.createTestingModule({
        providers: [NestLensGuard, { provide: NESTLENS_CONFIG, useValue: emptyEnvConfig }],
      }).compile();
      const emptyEnvGuard = module.get<NestLensGuard>(NestLensGuard);

      // Act & Assert
      await expect(emptyEnvGuard.canActivate(createMockContext())).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should use default environments when not specified', async () => {
      // Arrange - 'test' is in default allowed environments
      process.env.NODE_ENV = 'test';
      const noEnvConfig: NestLensConfig = {
        enabled: true,
        authorization: {}, // No allowedEnvironments specified
      };

      // Recreate guard without explicit environments
      const module = await Test.createTestingModule({
        providers: [NestLensGuard, { provide: NESTLENS_CONFIG, useValue: noEnvConfig }],
      }).compile();
      const noEnvGuard = module.get<NestLensGuard>(NestLensGuard);

      // Act
      const result = await noEnvGuard.canActivate(createMockContext());

      // Assert - should use defaults ['development', 'local', 'test']
      expect(result).toBe(true);
    });

    it('should use custom environment variable', async () => {
      // Arrange
      process.env.APP_ENV = 'staging';
      mockConfig.authorization = {
        allowedEnvironments: ['staging'],
        environmentVariable: 'APP_ENV',
      };

      // Recreate guard
      const module = await Test.createTestingModule({
        providers: [NestLensGuard, { provide: NESTLENS_CONFIG, useValue: mockConfig }],
      }).compile();
      const newGuard = module.get<NestLensGuard>(NestLensGuard);

      // Act
      const result = await newGuard.canActivate(createMockContext());

      // Assert
      expect(result).toBe(true);
    });

    it('should default to development when NODE_ENV not set', async () => {
      // Arrange
      delete process.env.NODE_ENV;
      mockConfig.authorization!.allowedEnvironments = ['development'];

      // Act
      const result = await guard.canActivate(createMockContext());

      // Assert
      expect(result).toBe(true);
    });
  });

  // ============================================================================
  // IP Whitelist
  // ============================================================================

  describe('IP whitelist', () => {
    it('should allow access from whitelisted IP', async () => {
      // Arrange
      mockConfig.authorization!.allowedIps = ['192.168.1.100'];
      const context = createMockContext({ ip: '192.168.1.100' });

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should deny access from non-whitelisted IP', async () => {
      // Arrange
      mockConfig.authorization!.allowedIps = ['192.168.1.100'];
      const context = createMockContext({ ip: '10.0.0.1' });

      // Act & Assert
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('should support wildcard patterns', async () => {
      // Arrange
      mockConfig.authorization!.allowedIps = ['192.168.1.*'];
      const context = createMockContext({ ip: '192.168.1.55' });

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should support multiple wildcards', async () => {
      // Arrange
      mockConfig.authorization!.allowedIps = ['192.168.*.*'];
      const context = createMockContext({ ip: '192.168.5.100' });

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should deny non-matching wildcard pattern', async () => {
      // Arrange
      mockConfig.authorization!.allowedIps = ['192.168.1.*'];
      const context = createMockContext({ ip: '192.168.2.1' });

      // Act & Assert
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('should normalize IPv6 localhost to IPv4', async () => {
      // Arrange
      mockConfig.authorization!.allowedIps = ['127.0.0.1'];
      const context = createMockContext({ ip: '::1' });

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should support localhost keyword', async () => {
      // Arrange
      mockConfig.authorization!.allowedIps = ['localhost'];
      const context = createMockContext({ ip: '127.0.0.1' });

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should support ::ffff:127.0.0.1 format', async () => {
      // Arrange
      mockConfig.authorization!.allowedIps = ['localhost'];
      const context = createMockContext({ ip: '::ffff:127.0.0.1' });

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should get IP from x-forwarded-for header behind a trusted proxy', async () => {
      // Arrange - the header is only the client's address once the application
      // has said something in front is rewriting it
      mockConfig.trustProxy = true;
      mockConfig.authorization!.allowedIps = ['203.0.113.195'];
      const context = createMockContext({
        ip: '127.0.0.1',
        headers: { 'x-forwarded-for': '203.0.113.195, 70.41.3.18' },
      });

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should handle array x-forwarded-for header behind a trusted proxy', async () => {
      // Arrange
      mockConfig.trustProxy = true;
      mockConfig.authorization!.allowedIps = ['203.0.113.195'];
      const context = createMockContext({
        ip: '127.0.0.1',
        headers: { 'x-forwarded-for': ['203.0.113.195', '70.41.3.18'] },
      });

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should skip IP check when no IPs configured', async () => {
      // Arrange
      delete mockConfig.authorization!.allowedIps;
      const context = createMockContext({ ip: '10.0.0.1' });

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });
  });

  // ============================================================================
  // Custom Access Function
  // ============================================================================

  describe('canAccess function', () => {
    it('should allow access when canAccess returns true', async () => {
      // Arrange
      mockConfig.authorization!.canAccess = () => true;

      // Act
      const result = await guard.canActivate(createMockContext());

      // Assert
      expect(result).toBe(true);
    });

    it('should deny access when canAccess returns false', async () => {
      // Arrange
      mockConfig.authorization!.canAccess = () => false;

      // Act & Assert
      await expect(guard.canActivate(createMockContext())).rejects.toThrow(ForbiddenException);
    });

    it('should support async canAccess function', async () => {
      // Arrange
      mockConfig.authorization!.canAccess = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return true;
      };

      // Act
      const result = await guard.canActivate(createMockContext());

      // Assert
      expect(result).toBe(true);
    });

    it('should attach AuthUser to request when canAccess returns user object', async () => {
      // Arrange
      const authUser = { id: 1, name: 'Admin', roles: ['admin'] };
      mockConfig.authorization!.canAccess = () => authUser;
      const context = createMockContext();
      const request = context.switchToHttp().getRequest() as NestLensRequest;

      // Act
      await guard.canActivate(context);

      // Assert
      expect(request.nestlensUser).toEqual(authUser);
    });

    it('should handle canAccess throwing an error', async () => {
      // Arrange
      mockConfig.authorization!.canAccess = () => {
        throw new Error('Auth service unavailable');
      };

      // Act & Assert
      await expect(guard.canActivate(createMockContext())).rejects.toThrow(ForbiddenException);
    });

    it('should handle async canAccess rejecting', async () => {
      // Arrange
      mockConfig.authorization!.canAccess = async () => {
        throw new Error('Auth service unavailable');
      };

      // Act & Assert
      await expect(guard.canActivate(createMockContext())).rejects.toThrow(ForbiddenException);
    });
  });

  // ============================================================================
  // Role-Based Access Control
  // ============================================================================

  describe('role-based access control', () => {
    it('should allow access when user has all required roles', async () => {
      // Arrange
      mockConfig.authorization!.canAccess = () => ({
        id: 1,
        name: 'Admin',
        roles: ['admin', 'editor'],
      });
      mockConfig.authorization!.requiredRoles = ['admin'];

      // Act
      const result = await guard.canActivate(createMockContext());

      // Assert
      expect(result).toBe(true);
    });

    it('should allow access when user has multiple required roles', async () => {
      // Arrange
      mockConfig.authorization!.canAccess = () => ({
        id: 1,
        name: 'Admin',
        roles: ['admin', 'editor', 'viewer'],
      });
      mockConfig.authorization!.requiredRoles = ['admin', 'editor'];

      // Act
      const result = await guard.canActivate(createMockContext());

      // Assert
      expect(result).toBe(true);
    });

    it('should deny access when user missing required role', async () => {
      // Arrange
      mockConfig.authorization!.canAccess = () => ({
        id: 1,
        name: 'User',
        roles: ['viewer'],
      });
      mockConfig.authorization!.requiredRoles = ['admin'];

      // Act & Assert
      await expect(guard.canActivate(createMockContext())).rejects.toThrow(ForbiddenException);
    });

    it('should deny access when user has no roles', async () => {
      // Arrange
      mockConfig.authorization!.canAccess = () => ({
        id: 1,
        name: 'User',
        roles: [],
      });
      mockConfig.authorization!.requiredRoles = ['admin'];

      // Act & Assert
      await expect(guard.canActivate(createMockContext())).rejects.toThrow(ForbiddenException);
    });

    it('should deny access when user.roles is undefined', async () => {
      // Arrange
      mockConfig.authorization!.canAccess = () => ({
        id: 1,
        name: 'User',
      });
      mockConfig.authorization!.requiredRoles = ['admin'];

      // Act & Assert
      await expect(guard.canActivate(createMockContext())).rejects.toThrow(ForbiddenException);
    });

    it('should skip role check when no required roles configured', async () => {
      // Arrange
      mockConfig.authorization!.canAccess = () => ({
        id: 1,
        name: 'User',
        roles: [],
      });
      delete mockConfig.authorization!.requiredRoles;

      // Act
      const result = await guard.canActivate(createMockContext());

      // Assert
      expect(result).toBe(true);
    });

    it('should skip role check when canAccess returns boolean true', async () => {
      // Arrange
      mockConfig.authorization!.canAccess = () => true;
      mockConfig.authorization!.requiredRoles = ['admin'];

      // Act
      const result = await guard.canActivate(createMockContext());

      // Assert - should pass because canAccess returned boolean, not user object
      expect(result).toBe(true);
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('edge cases', () => {
    it('should handle request with no IP information', async () => {
      // Arrange
      mockConfig.authorization!.allowedIps = ['127.0.0.1'];
      const context = createMockContext({
        ip: undefined,
        headers: {},
        socket: undefined as any,
      });

      // Act & Assert
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('should handle malformed IP patterns gracefully', async () => {
      // Arrange
      mockConfig.authorization!.allowedIps = ['192.168'];
      const context = createMockContext({ ip: '192.168.1.1' });

      // Act & Assert
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('should use socket remoteAddress as fallback', async () => {
      // Arrange
      mockConfig.authorization!.allowedIps = ['10.0.0.5'];
      const context = createMockContext({
        ip: undefined,
        headers: {},
        socket: { remoteAddress: '10.0.0.5' } as any,
      });

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });
  });

  // ============================================================================
  // Rate Limiting
  // ============================================================================

  describe('Rate Limiting', () => {
    it('should allow requests within rate limit', async () => {
      // Arrange
      mockConfig.rateLimit = { windowMs: 60000, maxRequests: 10 };

      const module = await Test.createTestingModule({
        providers: [NestLensGuard, { provide: NESTLENS_CONFIG, useValue: mockConfig }],
      }).compile();
      const rateLimitGuard = module.get<NestLensGuard>(NestLensGuard);

      const context = createMockContext({ ip: '192.168.1.100' });

      // Act - make 10 requests (at limit)
      for (let i = 0; i < 10; i++) {
        const result = await rateLimitGuard.canActivate(context);
        expect(result).toBe(true);
      }
    });

    it('should block requests exceeding rate limit', async () => {
      // Arrange
      mockConfig.rateLimit = { windowMs: 60000, maxRequests: 5 };

      const module = await Test.createTestingModule({
        providers: [NestLensGuard, { provide: NESTLENS_CONFIG, useValue: mockConfig }],
      }).compile();
      const rateLimitGuard = module.get<NestLensGuard>(NestLensGuard);

      const context = createMockContext({ ip: '192.168.1.101' });

      // Act - make 5 requests (at limit)
      for (let i = 0; i < 5; i++) {
        await rateLimitGuard.canActivate(context);
      }

      // Assert - 6th request should be blocked
      await expect(rateLimitGuard.canActivate(context)).rejects.toThrow();
    });

    it('should track different IPs separately', async () => {
      // Arrange
      mockConfig.rateLimit = { windowMs: 60000, maxRequests: 2 };

      const module = await Test.createTestingModule({
        providers: [NestLensGuard, { provide: NESTLENS_CONFIG, useValue: mockConfig }],
      }).compile();
      const rateLimitGuard = module.get<NestLensGuard>(NestLensGuard);

      const context1 = createMockContext({ ip: '10.0.0.1' });
      const context2 = createMockContext({ ip: '10.0.0.2' });

      // Act - exhaust limit for IP1
      await rateLimitGuard.canActivate(context1);
      await rateLimitGuard.canActivate(context1);

      // Assert - IP2 should still work
      const result = await rateLimitGuard.canActivate(context2);
      expect(result).toBe(true);
    });

    it('should allow requests when rate limiting is disabled', async () => {
      // Arrange
      mockConfig.rateLimit = false;

      const module = await Test.createTestingModule({
        providers: [NestLensGuard, { provide: NESTLENS_CONFIG, useValue: mockConfig }],
      }).compile();
      const rateLimitGuard = module.get<NestLensGuard>(NestLensGuard);

      const context = createMockContext({ ip: '192.168.1.200' });

      // Act - make many requests
      for (let i = 0; i < 1000; i++) {
        const result = await rateLimitGuard.canActivate(context);
        expect(result).toBe(true);
      }
    });

    it('should use default rate limit when not configured', async () => {
      // Arrange - no rateLimit config
      delete mockConfig.rateLimit;

      const context = createMockContext({ ip: '192.168.1.50' });

      // Act - should use default (100 requests per minute)
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });
  });
});

/**
 * The IP whitelist against a spoofed forwarding header.
 *
 * `allowedIps` is documented as a way to keep the dashboard to an office range
 * or to localhost, and the dashboard is where every recorded Authorization
 * header, cookie, request body and query ends up. A control that decides who
 * sees that cannot take the client's word for who they are: `X-Forwarded-For`
 * is set by whoever sends the request unless something in front overwrites it.
 *
 * NestLens already draws this line for the mount point, which honours
 * `X-Forwarded-Prefix` only under `trustProxy`. This is the same line.
 */
describe('NestLensGuard IP whitelist and forwarding headers', () => {
  const buildGuard = async (config: NestLensConfig): Promise<NestLensGuard> => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NestLensGuard, { provide: NESTLENS_CONFIG, useValue: config }],
    }).compile();

    return module.get<NestLensGuard>(NestLensGuard);
  };

  const requestFrom = (socketIp: string, forwardedFor?: string): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          ip: socketIp,
          socket: { remoteAddress: socketIp },
          headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {},
        }),
      }),
    }) as ExecutionContext;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
  });

  it('refuses a caller that claims an allowed address in a header', async () => {
    // Arrange - the office range is allowed; the caller is not in it
    const guard = await buildGuard({
      enabled: true,
      authorization: { allowedEnvironments: ['test'], allowedIps: ['10.0.0.5'] },
    });

    // Act & Assert - the header is the caller's own claim
    await expect(guard.canActivate(requestFrom('203.0.113.9', '10.0.0.5'))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('says what is likely missing when a proxy header was ignored', async () => {
    // Arrange
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const guard = await buildGuard({
      enabled: true,
      authorization: { allowedEnvironments: ['test'], allowedIps: ['10.0.0.5'] },
    });

    // Act
    await expect(guard.canActivate(requestFrom('172.16.0.1', '10.0.0.5'))).rejects.toThrow(
      ForbiddenException,
    );

    // Assert - a 403 that explains itself rather than looking like a wrong list
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('trustProxy'));
    warn.mockRestore();
  });

  it('still allows a caller whose own address is on the list', async () => {
    // Arrange
    const guard = await buildGuard({
      enabled: true,
      authorization: { allowedEnvironments: ['test'], allowedIps: ['10.0.0.5'] },
    });

    // Act & Assert
    await expect(guard.canActivate(requestFrom('10.0.0.5'))).resolves.toBe(true);
  });

  /**
   * Behind a proxy the socket address is the proxy's, so the header is the only
   * way to see the client — but only once the application has said it is behind
   * one, which is what `trustProxy` means everywhere else in NestLens.
   */
  it('reads the forwarding header once the application says it is behind a proxy', async () => {
    // Arrange
    const guard = await buildGuard({
      enabled: true,
      trustProxy: true,
      authorization: { allowedEnvironments: ['test'], allowedIps: ['10.0.0.5'] },
    });

    // Act & Assert - the proxy terminates the connection, the client is in the header
    await expect(guard.canActivate(requestFrom('172.16.0.1', '10.0.0.5'))).resolves.toBe(true);
    await expect(guard.canActivate(requestFrom('172.16.0.1', '203.0.113.9'))).rejects.toThrow(
      ForbiddenException,
    );
  });
});
