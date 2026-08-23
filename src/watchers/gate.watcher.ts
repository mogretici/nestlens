import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { CollectorService } from '../core/collector.service';
import { GateWatcherConfig, NestLensConfig, NESTLENS_CONFIG } from '../nestlens.config';
import { GateEntry } from '../types';
import { resolveWatcherConfig } from './watcher-config';
import { WrappedMethods, wrapMethodPreservingShape } from './wrap-method';

/**
 * Token for injecting authorization/gate service
 */
export const NESTLENS_GATE_SERVICE = Symbol('NESTLENS_GATE_SERVICE');

/**
 * GateWatcher tracks authorization checks in NestJS applications.
 * Monitors gate/policy evaluations to track what resources users can access,
 * capturing gate name, action, subject, allowed/denied status, and user information.
 */
@Injectable()
export class GateWatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GateWatcher.name);
  private readonly config: GateWatcherConfig;
  private wrapped?: WrappedMethods;

  constructor(
    private readonly collector: CollectorService,
    @Inject(NESTLENS_CONFIG)
    private readonly nestlensConfig: NestLensConfig,
    @Optional()
    @Inject(NESTLENS_GATE_SERVICE)
    private readonly gateService?: unknown,
  ) {
    const watcherConfig = nestlensConfig.watchers?.gate;
    this.config = resolveWatcherConfig(watcherConfig);
  }

  onModuleInit() {
    if (!this.config.enabled) {
      return;
    }

    // Check if gate service was provided
    if (!this.gateService) {
      this.logger.debug(
        'GateWatcher: No gate service found. ' +
          'To enable gate tracking, provide a gate/authorization service.',
      );
      return;
    }

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    if (!this.gateService) return;

    this.wrapped = new WrappedMethods(this.gateService as Record<string, unknown>);

    // Try to wrap common authorization methods
    for (const method of ['check', 'allows', 'denies', 'authorize', 'can']) {
      this.wrapped.replace(method, (original) =>
        wrapMethodPreservingShape(original, ({ args, result, error, durationMs }) => {
          const [gate, action, subject, user] = args as [string, string?, unknown?, unknown?];

          // `denies` answers the opposite question, so its `true` is a refusal.
          const allowed = error ? false : method === 'denies' ? !result : Boolean(result);

          this.collectEntry(
            gate,
            action || method,
            subject,
            allowed,
            user,
            error ? (error instanceof Error ? error.message : String(error)) : undefined,
            durationMs,
          );
        }),
      );
    }

    this.logger.log('Gate interceptors installed');
  }

  /**
   * Puts the authorization service back the way it was.
   *
   * Without this the host goes on calling through a watcher whose collector is
   * gone, and a process that builds the module more than once against the same
   * service — as tests and `nest start --hmr` do — wraps each round on top of
   * the last.
   */
  onModuleDestroy(): void {
    this.wrapped?.restore();
    this.wrapped = undefined;
  }

  /**
   * Manual tracking method for authorization checks.
   * Call this manually from your authorization logic if auto-wrapping doesn't work.
   */
  trackCheck(
    gate: string,
    action: string,
    subject: unknown,
    allowed: boolean,
    user?: unknown,
    reason?: string,
  ): void {
    this.collectEntry(gate, action, subject, allowed, user, reason, 0);
  }

  private collectEntry(
    gate: string,
    action: string,
    subject: unknown,
    allowed: boolean,
    user?: unknown,
    reason?: string,
    duration: number = 0,
  ): void {
    // Check if this gate/ability should be ignored
    if (this.shouldIgnore(gate, action)) {
      return;
    }

    const userId = this.extractUserId(user);
    const subjectName = this.extractSubjectName(subject);

    const payload: GateEntry['payload'] = {
      gate,
      action,
      subject: subjectName,
      allowed,
      userId,
      reason,
      duration,
      context:
        this.config.captureContext !== false ? this.captureContext(subject, user) : undefined,
    };

    this.collector.collect('gate', payload);
  }

  /**
   * Check if a gate/ability should be ignored based on configuration
   */
  private shouldIgnore(gate: string, action: string): boolean {
    const ignoreList = this.config.ignoreAbilities;
    if (!ignoreList || ignoreList.length === 0) {
      return false;
    }

    // Check both gate name and action against ignore list
    return ignoreList.some(
      (ignored) => ignored === gate || ignored === action || ignored === `${gate}:${action}`,
    );
  }

  private extractUserId(user: unknown): string | number | undefined {
    if (!user) return undefined;

    try {
      if (typeof user === 'object' && user !== null) {
        const u = user as Record<string, unknown>;
        // Try common user ID fields
        return (u.id || u.userId || u.sub || u._id) as string | number | undefined;
      }
      if (typeof user === 'string' || typeof user === 'number') {
        return user;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  private extractSubjectName(subject: unknown): string | undefined {
    if (!subject) return undefined;

    try {
      // If subject is a string, use it directly
      if (typeof subject === 'string') {
        return subject;
      }

      // If subject is an object with a name or type field
      if (typeof subject === 'object' && subject !== null) {
        const s = subject as Record<string, unknown> & { constructor?: { name?: string } };
        return (s.name || s.type || s.constructor?.name) as string | undefined;
      }

      return undefined;
    } catch {
      return undefined;
    }
  }

  private captureContext(subject: unknown, user: unknown): Record<string, unknown> | undefined {
    try {
      const context: Record<string, unknown> = {};

      // Capture subject details
      if (typeof subject === 'object' && subject !== null) {
        const s = subject as Record<string, unknown>;
        if (s.id) context.subjectId = s.id;
        if (s.type) context.subjectType = s.type;
      }

      // Capture user details
      if (typeof user === 'object' && user !== null) {
        const u = user as Record<string, unknown>;
        if (u.email) context.userEmail = u.email;
        if (u.name) context.userName = u.name;
        if (u.roles) context.userRoles = u.roles;
      }

      return Object.keys(context).length > 0 ? context : undefined;
    } catch {
      return undefined;
    }
  }
}
