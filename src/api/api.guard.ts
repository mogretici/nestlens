import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Request } from 'express';
import { AddressableRequest, resolveClientIp } from '../core/client-ip';
import { AuthUser, AuthorizationConfig, NestLensConfig, NESTLENS_CONFIG } from '../nestlens.config';
import { settled } from '../core/thenable';

/**
 * Extended Request type with NestLens auth user
 */
export interface NestLensRequest extends Request {
  nestlensUser?: AuthUser;
}

/**
 * Rate limit entry for tracking requests per IP
 */
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/** What `evaluateCanAccess` returns when the answer is no. */
const DENIED = Symbol('nestlens.access.denied');

/**
 * How many callers the rate limiter will remember at once.
 *
 * One entry per address seen inside the window, removed only when the sweep
 * five minutes later finds it expired. Nothing bounded it: a dashboard reachable
 * by many clients — or one behind a proxy that lets a caller choose the address
 * it is counted under — grows the map with every new one. Measured with 200,000
 * distinct callers: 200,000 entries and about 10 MB of keys, none of them
 * eligible for the sweep yet.
 *
 * Past the ceiling the expired ones go first, then the oldest. Evicting relaxes
 * the limit for whoever is dropped, which is the right way round: at that many
 * distinct addresses a per-address limit is not what is protecting anything, and
 * unbounded memory is.
 */
const MAX_RATE_LIMIT_KEYS = 5_000;

/**
 * Default rate limit configuration
 */
const DEFAULT_RATE_LIMIT = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100, // 100 requests per minute per IP
};

@Injectable()
export class NestLensGuard implements CanActivate, OnModuleDestroy {
  private readonly logger = new Logger(NestLensGuard.name);

  /**
   * In-memory rate limit store
   * Key: IP address, Value: request count and reset time
   */
  private readonly rateLimitStore = new Map<string, RateLimitEntry>();

  /**
   * Cleanup interval for expired entries (every 5 minutes)
   */
  private readonly cleanupInterval: ReturnType<typeof setInterval>;

  constructor(
    @Inject(NESTLENS_CONFIG)
    private readonly config: NestLensConfig,
    // Optional so the guard can still be constructed in isolation, which is
    // how most of its tests build it.
    @Optional()
    private readonly httpAdapterHost?: HttpAdapterHost,
  ) {
    // Periodic cleanup of expired rate limit entries
    this.cleanupInterval = setInterval(
      () => {
        this.cleanupExpiredEntries();
      },
      5 * 60 * 1000,
    );

    // Prevent interval from keeping the process alive
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Stops the cleanup timer with the application.
   *
   * `unref()` above keeps the timer from holding the process open, which is a
   * different thing from stopping it: without this, a closed application leaves
   * a timer still firing against a store nobody reads, and a test suite that
   * creates guards leaves one behind per application it builds.
   */
  onModuleDestroy(): void {
    clearInterval(this.cleanupInterval);
    this.rateLimitStore.clear();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<NestLensRequest>();

    // Check if NestLens is enabled
    if (this.config.enabled === false) {
      return false;
    }

    // Check rate limit first (before any other checks)
    const clientIp = this.getClientIp(request);
    if (!this.checkRateLimit(clientIp)) {
      const retryAfter = Math.ceil(this.getRateLimitResetTime(clientIp) / 1000);

      // A 429 without `Retry-After` tells a client it has been refused and
      // nothing about when to come back, so the only strategy left is to guess
      // — which is how a rate limit turns into a retry storm. RFC 6585 asks for
      // this header, and the value was already being computed for the body.
      this.setRetryAfter(context, retryAfter);

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests. Please try again later.',
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Get merged authorization config (new config takes precedence over legacy)
    const authConfig = this.getMergedAuthConfig();

    // 1. Check environment
    if (!this.isEnvironmentAllowed(authConfig)) {
      this.logger.warn(
        `Access denied: Environment '${this.getCurrentEnvironment(authConfig)}' not in allowed list`,
      );
      throw new ForbiddenException('NestLens is not available in this environment');
    }

    // 2. Check IP whitelist
    const allowedIps = authConfig.allowedIps;
    if (allowedIps && allowedIps.length > 0) {
      const clientIp = this.getClientIp(request);
      if (!this.isIpAllowed(clientIp, allowedIps)) {
        // A request carrying a forwarding header while NestLens is not
        // configured to trust one is the shape of a real proxy deployment
        // missing a setting — worth saying, because the alternative is a 403
        // that looks like the whitelist is simply wrong.
        const behindSomething = !this.config.trustProxy && request.headers['x-forwarded-for'];
        const hint = behindSomething
          ? ' (request carried X-Forwarded-For; set trustProxy: true if a proxy you control sets it)'
          : '';

        this.logger.warn(`Access denied: IP '${clientIp}' not in allowed list${hint}`);
        throw new ForbiddenException('Access denied from this IP address');
      }
    }

    // 3. Check custom access function
    if (authConfig.canAccess) {
      const user = await this.evaluateCanAccess(authConfig.canAccess, request);

      if (user === DENIED) {
        this.logger.warn('Access denied: canAccess did not grant access');
        throw new ForbiddenException('Access denied');
      }

      if (user) {
        request.nestlensUser = user;
      }
    }

    // 4. Check required roles
    const requiredRoles = authConfig.requiredRoles;
    if (requiredRoles && requiredRoles.length > 0) {
      // Roles are checked against a user, and the only thing that produces one
      // is `canAccess` returning an `AuthUser`. Without one there is nothing to
      // check, and this used to mean the requirement was skipped: configuring
      // `requiredRoles: ['admin']` on its own protected nothing at all, and
      // configuring it beside a `canAccess` that returned plain `true` was the
      // same. An authorization setting the operator wrote down cannot quietly
      // do nothing, so absent a user this denies and says what is missing.
      if (!request.nestlensUser) {
        this.logger.warn(
          `Access denied: requiredRoles is set to [${requiredRoles.join(', ')}] but no user was ` +
            'resolved. canAccess has to return an AuthUser for roles to be checked.',
        );
        throw new ForbiddenException('Insufficient permissions');
      }

      if (!this.hasRequiredRoles(request.nestlensUser, requiredRoles)) {
        this.logger.warn(
          `Access denied: User missing required roles. Required: ${requiredRoles.join(', ')}`,
        );
        throw new ForbiddenException('Insufficient permissions');
      }
    }

    return true;
  }

  /**
   * Writes `Retry-After`, on whichever HTTP platform is underneath.
   *
   * Express and Fastify disagree about the method name; the adapter does not.
   * Absent — in a unit test that builds the guard on its own — the header is
   * simply not written, which is what happens anyway when there is no response
   * to write it to.
   */
  private setRetryAfter(context: ExecutionContext, seconds: number): void {
    const adapter = this.httpAdapterHost?.httpAdapter;
    if (!adapter || typeof adapter.setHeader !== 'function') {
      return;
    }

    try {
      adapter.setHeader(context.switchToHttp().getResponse(), 'Retry-After', String(seconds));
    } catch {
      // Writing a header must never turn a 429 into a 500.
    }
  }

  /**
   * Merge legacy config options with new authorization config
   */
  private getMergedAuthConfig(): AuthorizationConfig {
    const authConfig = this.config.authorization ?? {};

    return {
      // Whether the key is present, not whether its value is truthy.
      //
      // `??` returns the right-hand side for `null` as well as `undefined`, and
      // those mean opposite things here: `undefined` is "the caller said
      // nothing, use the default", while `null` is the documented way to say
      // "allow every environment". Coalescing turned the second into the first,
      // so an explicit `null` became the default list and
      // `isEnvironmentAllowed`'s `null` branch — which implements exactly what
      // the documentation promises — could never be reached.
      //
      // It failed the way that kind of bug does: a dashboard configured for
      // production answered 403 with `not available in this environment`, which
      // is a true sentence about a value the caller never set.
      allowedEnvironments:
        'allowedEnvironments' in authConfig
          ? authConfig.allowedEnvironments
          : ['development', 'local', 'test'],
      environmentVariable: authConfig.environmentVariable ?? 'NODE_ENV',
      allowedIps: authConfig.allowedIps,
      canAccess: authConfig.canAccess,
      requiredRoles: authConfig.requiredRoles,
    };
  }

  /**
   * Check if current environment is allowed
   */
  private isEnvironmentAllowed(authConfig: AuthorizationConfig): boolean {
    const allowedEnvs = authConfig.allowedEnvironments;

    // null means all environments are allowed
    if (allowedEnvs === null || allowedEnvs === undefined) {
      return true;
    }

    // Empty array means no environment is allowed
    if (allowedEnvs.length === 0) {
      return false;
    }

    const currentEnv = this.getCurrentEnvironment(authConfig);
    return allowedEnvs.includes(currentEnv);
  }

  /**
   * Get current environment from configured variable
   */
  private getCurrentEnvironment(authConfig: AuthorizationConfig): string {
    const envVar = authConfig.environmentVariable || 'NODE_ENV';
    return process.env[envVar] || 'development';
  }

  /**
   * Runs the caller's access function and reads its answer as a decision.
   *
   * Only `true` and an object grant. Everything else denies, including the
   * values a function returns when it did not decide anything: `undefined` from
   * a branch with no `return`, `null` from a lookup that found nobody, `0` from
   * a count. Each of those used to grant access, because the check was
   * `result === false` and nothing else was refused — so a hook written as
   *
   * ```text
   * canAccess: (req) => { if (!req.user) return false; }
   * ```
   *
   * let everyone in through the branch its author forgot to write. An
   * authorization hook is the one place where an unrecognised answer has to
   * mean no.
   */
  private async evaluateCanAccess(
    canAccess: NonNullable<AuthorizationConfig['canAccess']>,
    request: Request,
  ): Promise<AuthUser | undefined | typeof DENIED> {
    let result: boolean | AuthUser;

    try {
      const returned = canAccess(request);
      result = await settled(returned);
    } catch (error) {
      this.logger.error(`Error in canAccess function: ${error}`);
      return DENIED;
    }

    if (result === true) return undefined;
    if (typeof result === 'object' && result !== null) return result as AuthUser;

    return DENIED;
  }

  /**
   * Check if user has all required roles
   */
  private hasRequiredRoles(user: AuthUser, requiredRoles: string[]): boolean {
    const roles = user.roles;
    if (!roles || roles.length === 0) {
      return false;
    }
    return requiredRoles.every((role) => roles.includes(role));
  }

  /**
   * Get client IP from request
   */
  /** The client's address, by the same rule the request watcher records. */
  private getClientIp(request: Request): string {
    return resolveClientIp(request as unknown as AddressableRequest, this.config.trustProxy) ?? '';
  }

  /**
   * Check if IP matches allowed patterns
   * Uses safe wildcard matching instead of regex to prevent ReDoS attacks
   */
  private isIpAllowed(clientIp: string, allowedIps: string[]): boolean {
    // Normalize IPv6 localhost
    const normalizedIp = clientIp === '::1' ? '127.0.0.1' : clientIp;

    return allowedIps.some((pattern) => {
      // Support wildcard patterns like '192.168.1.*'
      if (pattern.includes('*')) {
        return this.matchWildcard(normalizedIp, pattern) || this.matchWildcard(clientIp, pattern);
      }
      // Support localhost variations
      if (pattern === 'localhost' || pattern === '127.0.0.1') {
        return (
          normalizedIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1'
        );
      }
      return normalizedIp === pattern || clientIp === pattern;
    });
  }

  /**
   * Safe wildcard matching without regex (prevents ReDoS)
   * Supports only '*' as wildcard for IP segments
   * Example: '192.168.1.*' matches '192.168.1.100'
   */
  private matchWildcard(ip: string, pattern: string): boolean {
    const ipParts = ip.split('.');
    const patternParts = pattern.split('.');

    // IP addresses should have exactly 4 parts
    if (ipParts.length !== 4 || patternParts.length !== 4) {
      return false;
    }

    for (let i = 0; i < 4; i++) {
      const patternPart = patternParts[i];
      const ipPart = ipParts[i];

      // Wildcard matches any segment
      if (patternPart === '*') {
        continue;
      }

      // Exact match required
      if (patternPart !== ipPart) {
        return false;
      }
    }

    return true;
  }

  // ============================================================================
  // Rate Limiting
  // ============================================================================

  /**
   * Get rate limit configuration from config or use defaults
   */
  private getRateLimitConfig(): { windowMs: number; maxRequests: number } {
    const rateLimit = this.config.rateLimit;

    if (rateLimit === false) {
      // Rate limiting disabled - return very high limits
      return { windowMs: 60000, maxRequests: Number.MAX_SAFE_INTEGER };
    }

    if (typeof rateLimit === 'object') {
      return {
        windowMs: rateLimit.windowMs ?? DEFAULT_RATE_LIMIT.windowMs,
        maxRequests: rateLimit.maxRequests ?? DEFAULT_RATE_LIMIT.maxRequests,
      };
    }

    return DEFAULT_RATE_LIMIT;
  }

  /**
   * Check if request is within rate limit
   * Returns true if allowed, false if rate limited
   */
  private checkRateLimit(ip: string): boolean {
    const config = this.getRateLimitConfig();
    const now = Date.now();

    const entry = this.rateLimitStore.get(ip);

    if (!entry || now >= entry.resetAt) {
      // First request or window expired - create new entry
      this.makeRoom(now);
      this.rateLimitStore.set(ip, {
        count: 1,
        resetAt: now + config.windowMs,
      });
      return true;
    }

    // Increment counter
    entry.count++;

    // Check if over limit
    if (entry.count > config.maxRequests) {
      return false;
    }

    return true;
  }

  /**
   * Get time until rate limit resets (in ms)
   */
  private getRateLimitResetTime(ip: string): number {
    const entry = this.rateLimitStore.get(ip);
    if (!entry) return 0;

    const remaining = entry.resetAt - Date.now();
    return Math.max(0, remaining);
  }

  /**
   * Cleanup expired rate limit entries to prevent memory leaks
   */
  /**
   * Keeps the store under its ceiling before adding to it.
   *
   * Only walked once the map is large: sweeping on every request would cost
   * more than the entries do. See `MAX_RATE_LIMIT_KEYS`.
   */
  private makeRoom(now: number): void {
    if (this.rateLimitStore.size < MAX_RATE_LIMIT_KEYS) {
      return;
    }

    for (const [ip, entry] of this.rateLimitStore) {
      if (now >= entry.resetAt) {
        this.rateLimitStore.delete(ip);
      }
    }

    // Still full: every window is live. Insertion order is age order here, so
    // the first key is the one that has been counted longest.
    while (this.rateLimitStore.size >= MAX_RATE_LIMIT_KEYS) {
      const oldest = this.rateLimitStore.keys().next();
      if (oldest.done) break;
      this.rateLimitStore.delete(oldest.value);
    }
  }

  private cleanupExpiredEntries(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [ip, entry] of this.rateLimitStore.entries()) {
      if (now >= entry.resetAt) {
        this.rateLimitStore.delete(ip);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} expired rate limit entries`);
    }
  }
}
