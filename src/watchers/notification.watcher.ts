import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { CollectorService } from '../core/collector.service';
import { NotificationWatcherConfig, NestLensConfig, NESTLENS_CONFIG } from '../nestlens.config';
import { NotificationEntry } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NotificationService = any;

/**
 * Token for injecting notification service
 */
export const NESTLENS_NOTIFICATION_SERVICE = Symbol('NESTLENS_NOTIFICATION_SERVICE');

/**
 * NotificationWatcher tracks notification sending across multiple channels
 * (email, sms, push, socket, webhook) while masking sensitive recipient information.
 */
@Injectable()
export class NotificationWatcher implements OnModuleInit {
  private readonly logger = new Logger(NotificationWatcher.name);
  private readonly config: NotificationWatcherConfig;
  private originalMethods?: Map<string, Function>;

  constructor(
    private readonly collector: CollectorService,
    @Inject(NESTLENS_CONFIG)
    private readonly nestlensConfig: NestLensConfig,
    @Optional()
    @Inject(NESTLENS_NOTIFICATION_SERVICE)
    private readonly notificationService?: NotificationService,
  ) {
    const watcherConfig = nestlensConfig.watchers?.notification;
    this.config =
      typeof watcherConfig === 'object' ? watcherConfig : { enabled: watcherConfig !== false };
  }

  onModuleInit() {
    if (!this.config.enabled) {
      return;
    }

    // Check if notification service was provided
    if (!this.notificationService) {
      this.logger.debug(
        'NotificationWatcher: No notification service found. ' +
          'To enable notification tracking, inject your notification service with the NESTLENS_NOTIFICATION_SERVICE token.',
      );
      return;
    }

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    if (!this.notificationService) return;

    this.originalMethods = new Map();

    // Common notification methods to track
    const methodsToTrack = [
      { name: 'sendEmail', type: 'email' as const },
      { name: 'sendSms', type: 'sms' as const },
      { name: 'sendPush', type: 'push' as const },
      { name: 'sendSocket', type: 'socket' as const },
      { name: 'sendWebhook', type: 'webhook' as const },
      { name: 'send', type: 'email' as const }, // Generic send method
    ];

    for (const { name, type } of methodsToTrack) {
      if (!this.notificationService[name]) {
        continue;
      }

      // Store original method
      this.originalMethods.set(name, this.notificationService[name].bind(this.notificationService));

      // Wrap the method
      this.notificationService[name] = this.wrapNotificationMethod(
        name,
        type,
        this.originalMethods.get(name)!,
      );
    }

    this.logger.log('Notification interceptors installed');
  }

  private wrapNotificationMethod(
    methodName: string,
    notificationType: 'email' | 'sms' | 'push' | 'socket' | 'webhook',
    originalMethod: Function,
  ): Function {
    return async (...args: unknown[]): Promise<unknown> => {
      const startTime = Date.now();
      let status: 'sent' | 'failed' = 'sent';
      let error: string | undefined;

      // Extract notification details from arguments
      const notificationData = this.extractNotificationData(args);

      try {
        const result = await originalMethod(...args);
        return result;
      } catch (err) {
        status = 'failed';
        error = err instanceof Error ? err.message : String(err);
        throw err;
      } finally {
        const duration = Date.now() - startTime;
        this.collectEntry(
          notificationType,
          notificationData.recipient,
          notificationData.title,
          notificationData.message,
          notificationData.metadata,
          status,
          duration,
          error,
        );
      }
    };
  }

  /**
   * Extract notification data from method arguments.
   * This handles various common notification service patterns.
   */
  private extractNotificationData(args: unknown[]): {
    recipient: string | string[];
    title?: string;
    message?: string;
    metadata?: Record<string, unknown>;
  } {
    if (args.length === 0) {
      return { recipient: 'unknown' };
    }

    // Handle object-based API: sendEmail({ to: '...', subject: '...', body: '...' })
    if (typeof args[0] === 'object' && args[0] !== null) {
      const data = args[0] as Record<string, unknown>;
      return {
        recipient: (data.to || data.recipient || data.recipients || data.email || 'unknown') as
          | string
          | string[],
        title: (data.subject || data.title) as string | undefined,
        message: this.config.captureMessage
          ? ((data.body || data.message || data.text || data.content) as string | undefined)
          : undefined,
        metadata: (data.metadata || data.meta) as Record<string, unknown> | undefined,
      };
    }

    // Handle positional API: sendEmail(recipient, subject, body)
    return {
      recipient: String(args[0]),
      title: args[1] ? String(args[1]) : undefined,
      message: this.config.captureMessage && args[2] ? String(args[2]) : undefined,
      metadata: args[3] as Record<string, unknown> | undefined,
    };
  }

  private collectEntry(
    type: 'email' | 'sms' | 'push' | 'socket' | 'webhook',
    recipient: string | string[],
    title?: string,
    message?: string,
    metadata?: Record<string, unknown>,
    status: 'sent' | 'failed' = 'sent',
    duration: number = 0,
    error?: string,
  ): void {
    const payload: NotificationEntry['payload'] = {
      type,
      recipient: this.maskRecipient(recipient),
      title,
      message: this.captureMessage(message),
      metadata: this.captureMetadata(metadata),
      status,
      duration,
      error,
    };

    this.collector.collect('notification', payload);
  }

  /**
   * Mask recipient information for privacy.
   * Examples:
   * - Email: john@example.com -> j***@example.com
   * - Phone: +1234567890 -> +123***7890
   */
  private maskRecipient(recipient: string | string[]): string | string[] {
    if (Array.isArray(recipient)) {
      return recipient.map((r) => this.maskSingleRecipient(r));
    }
    return this.maskSingleRecipient(recipient);
  }

  private maskSingleRecipient(recipient: string): string {
    // Email masking
    if (recipient.includes('@')) {
      const [localPart, domain] = recipient.split('@');
      if (localPart.length <= 1) {
        return `${localPart}***@${domain}`;
      }
      return `${localPart[0]}***@${domain}`;
    }

    // Phone number masking (assumes format like +1234567890)
    if (recipient.startsWith('+') && recipient.length > 6) {
      const firstPart = recipient.substring(0, 4);
      const lastPart = recipient.substring(recipient.length - 4);
      return `${firstPart}***${lastPart}`;
    }

    // Generic masking - show first character only
    if (recipient.length <= 1) {
      return '***';
    }
    return `${recipient[0]}***`;
  }

  /**
   * Capture message content with size limits
   */
  private captureMessage(message?: string): string | undefined {
    if (!message || !this.config.captureMessage) {
      return undefined;
    }

    // Limit message size to prevent bloating storage
    const maxSize = 1024; // 1KB
    if (message.length > maxSize) {
      return message.substring(0, maxSize) + '... (truncated)';
    }

    return message;
  }

  /**
   * Capture metadata with size limits
   */
  private captureMetadata(metadata?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!metadata) return undefined;

    try {
      const json = JSON.stringify(metadata);
      const maxSize = 2048; // 2KB
      if (json.length > maxSize) {
        return { _truncated: true, _size: json.length };
      }
      return metadata;
    } catch {
      return { _error: 'Unable to serialize metadata' };
    }
  }
}
