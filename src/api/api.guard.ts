import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import {
  AuthUser,
  AuthorizationConfig,
  NestLensConfig,
  NESTLENS_CONFIG,
} from '../nestlens.config';

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

/**
 * Default rate limit configuration
 */
const DEFAULT_RATE_LIMIT = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100, // 100 requests per minute per IP
};

@Injectable()
export class NestLensGuard implements CanActivate {
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
  ) {
    // Periodic cleanup of expired rate limit entries
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredEntries();
    }, 5 * 60 * 1000);

    // Prevent interval from keeping the process alive
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
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
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests. Please try again later.',
          retryAfter: Math.ceil(this.getRateLimitResetTime(clientIp) / 1000),
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
        this.logger.warn(`Access denied: IP '${clientIp}' not in allowed list`);
        throw new ForbiddenException('Access denied from this IP address');
      }
    }

    // 3. Check custom access function
    const canAccess = authConfig.canAccess;
    if (canAccess) {
      const result = await this.evaluateCanAccess(canAccess, request);

      if (result === false) {
        this.logger.warn('Access denied: canAccess function returned false');
        throw new ForbiddenException('Access denied');
      }

      // If result is an AuthUser object, attach to request and check roles
      if (typeof result === 'object' && result !== null) {
        request.nestlensUser = result as AuthUser;

        // 4. Check required roles
        if (authConfig.requiredRoles && authConfig.requiredRoles.length > 0) {
          if (!this.hasRequiredRoles(request.nestlensUser, authConfig.requiredRoles)) {
            this.logger.warn(
              `Access denied: User missing required roles. Required: ${authConfig.requiredRoles.join(', ')}`,
            );
            throw new ForbiddenException('Insufficient permissions');
          }
        }
      }
    }

    return true;
  }

  /**
   * Merge legacy config options with new authorization config
   */
  private getMergedAuthConfig(): AuthorizationConfig {
    const authConfig = this.config.authorization || {};

    return {
      allowedEnvironments: authConfig.allowedEnvironments ?? ['development', 'local', 'test'],
      environmentVariable: authConfig.environmentVariable ?? 'NODE_ENV',
      // Legacy options as fallback
      allowedIps: authConfig.allowedIps ?? this.config.allowedIps,
      canAccess: authConfig.canAccess ?? this.config.canAccess,
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
   * Evaluate canAccess function
   */
  private async evaluateCanAccess(
    canAccess: NonNullable<AuthorizationConfig['canAccess']>,
    request: Request,
  ): Promise<boolean | AuthUser> {
    try {
      const result = canAccess(request);
      return result instanceof Promise ? await result : result;
    } catch (error) {
      this.logger.error(`Error in canAccess function: ${error}`);
      return false;
    }
  }

  /**
   * Check if user has all required roles
   */
  private hasRequiredRoles(user: AuthUser, requiredRoles: string[]): boolean {
    if (!user.roles || user.roles.length === 0) {
      return false;
    }
    return requiredRoles.every((role) => user.roles!.includes(role));
  }

  /**
   * Get client IP from request
   */
  private getClientIp(request: Request): string {
    const forwardedFor = request.headers['x-forwarded-for'];
    if (forwardedFor) {
      const ips = Array.isArray(forwardedFor)
        ? forwardedFor[0]
        : forwardedFor.split(',')[0];
      return ips.trim();
    }
    return request.ip || request.socket?.remoteAddress || '';
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
        return (
          this.matchWildcard(normalizedIp, pattern) ||
          this.matchWildcard(clientIp, pattern)
        );
      }
      // Support localhost variations
      if (pattern === 'localhost' || pattern === '127.0.0.1') {
        return (
          normalizedIp === '127.0.0.1' ||
          clientIp === '::1' ||
          clientIp === '::ffff:127.0.0.1'
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
