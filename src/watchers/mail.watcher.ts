import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { CollectorService } from '../core/collector.service';
import { MailWatcherConfig, NestLensConfig, NESTLENS_CONFIG } from '../nestlens.config';
import { MailEntry } from '../types';
import { resolveWatcherConfig } from './watcher-config';
import { WrappedMethods, wrapMethodPreservingShape } from './wrap-method';

/**
 * The mailer surface this watcher touches.
 *
 * Both `@nestjs-modules/mailer` and plain nodemailer expose `sendMail`, and
 * neither is a declared dependency, so this describes the runtime shape.
 * Anything accepting a mailer takes `unknown` and narrows here, so callers can
 * pass their real service without a type conflict.
 */
interface MailOptionsLike {
  to?: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject?: string;
  html?: string;
  text?: string;
  from?: string;
}

type SendMail = (mailOptions: MailOptionsLike) => Promise<unknown>;

interface MailerLike {
  sendMail: SendMail;
}

function isMailer(value: unknown): value is MailerLike {
  return (
    !!value && typeof value === 'object' && typeof (value as MailerLike).sendMail === 'function'
  );
}

// Token for injecting mailer service
export const NESTLENS_MAILER_SERVICE = Symbol('NESTLENS_MAILER_SERVICE');

@Injectable()
export class MailWatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailWatcher.name);
  private readonly config: MailWatcherConfig;
  private wrapped?: WrappedMethods;
  /** Mailers handed to `setupMailer`, which also have to be given back. */
  private readonly manuallyWrapped: WrappedMethods[] = [];

  constructor(
    private readonly collector: CollectorService,
    @Inject(NESTLENS_CONFIG)
    private readonly nestlensConfig: NestLensConfig,
    @Optional()
    @Inject(NESTLENS_MAILER_SERVICE)
    private readonly mailerService?: unknown,
  ) {
    const watcherConfig = nestlensConfig.watchers?.mail;
    this.config = resolveWatcherConfig(watcherConfig);
  }

  onModuleInit() {
    if (!this.config.enabled) {
      return;
    }

    // Check if mailer service was provided
    if (!this.mailerService) {
      this.logger.debug(
        'MailWatcher: No mailer service provided. ' +
          'To enable mail tracking, provide your mailer service with NESTLENS_MAILER_SERVICE token.',
      );
      return;
    }

    this.setupInterceptors();
  }

  /**
   * Puts `sendMail` back the way it was found.
   *
   * The wrappers live on an object the application owns and keeps, so closing
   * the module has to give it back. Otherwise the host goes on calling through
   * a watcher whose collector is gone — and where a process builds the module
   * more than once against the same object, as tests and `nest start --hmr` do,
   * each round wraps the last: one call, one entry per layer.
   */
  onModuleDestroy(): void {
    this.wrapped?.restore();
    this.wrapped = undefined;

    for (const wrapped of this.manuallyWrapped) {
      wrapped.restore();
    }
    this.manuallyWrapped.length = 0;
  }

  private setupInterceptors(): void {
    const mailer = this.mailerService;
    if (!mailer) return;

    if (!isMailer(mailer)) {
      this.logger.warn('Mailer service does not have a sendMail method');
      return;
    }

    this.wrapped = this.trackSendMail(mailer);
    this.logger.log('Mail interceptors installed');
  }

  /**
   * Setup interceptors on a mailer service.
   * Can be called manually if you want to track a specific mailer instance.
   */
  setupMailer(mailerService: unknown): void {
    if (!isMailer(mailerService)) {
      this.logger.warn('Invalid mailer service provided');
      return;
    }

    this.manuallyWrapped.push(this.trackSendMail(mailerService));
    this.logger.log('Mail interceptors installed on custom mailer');
  }

  /**
   * Replaces `sendMail`, in both of the shapes it is called in.
   *
   * Nodemailer documents two: `sendMail(options)` returns a promise, and
   * `sendMail(options, callback)` returns nothing and answers through the
   * callback. The wrapper used to be written `(mailOptions) => ...`, which
   * accepts only the first — so a caller passing a callback lost it, and its
   * continuation never ran. Measured against a transport supporting both:
   *
   *     before   callback fired
   *     after    callback NEVER fired
   *
   * Every argument is forwarded now, and where the outcome arrives through a
   * callback the entry is recorded when the callback fires rather than when
   * the call returns — which for that form is before anything has been sent.
   */
  private trackSendMail(mailer: { sendMail: SendMail }): WrappedMethods {
    const wrapped = new WrappedMethods(mailer as unknown as Record<string, unknown>);
    const recordSend = this.recordSend.bind(this);

    wrapped.replace('sendMail', (original) => {
      const throughPromise = wrapMethodPreservingShape(original, ({ args, error, durationMs }) => {
        this.recordSend(args[0] as MailOptionsLike, error, durationMs);
      });

      return function sendMail(this: unknown, ...args: unknown[]): unknown {
        const callback = args[args.length - 1];
        if (typeof callback !== 'function') {
          return throughPromise.apply(this, args);
        }

        const started = Date.now();
        const forwarded = [...args];
        forwarded[forwarded.length - 1] = (error: unknown, info: unknown): unknown => {
          recordSend(args[0] as MailOptionsLike, error, Date.now() - started);
          return (callback as (error: unknown, info: unknown) => unknown)(error, info);
        };

        return original.apply(this, forwarded);
      };
    });

    return wrapped;
  }

  private recordSend(options: MailOptionsLike, error: unknown, duration: number): void {
    if (error) {
      this.collectEntry(
        options,
        'failed',
        duration,
        error instanceof Error ? error.message : String(error),
      );
      return;
    }

    this.collectEntry(options, 'sent', duration);
  }

  private collectEntry(
    mailOptions: MailOptionsLike,
    status: 'sent' | 'failed',
    duration: number,
    error?: string,
  ): void {
    // Normalize recipients
    const to = this.normalizeRecipients(mailOptions.to);
    const cc = this.normalizeRecipients(mailOptions.cc);
    const bcc = this.normalizeRecipients(mailOptions.bcc);

    const payload: MailEntry['payload'] = {
      to: to || '',
      cc,
      bcc,
      subject: mailOptions.subject || '',
      html: this.captureContent(mailOptions.html),
      text: this.captureContent(mailOptions.text),
      from: mailOptions.from,
      status,
      error,
      duration,
    };

    this.collector.collect('mail', payload);
  }

  private normalizeRecipients(
    recipients: string | string[] | undefined,
  ): string | string[] | undefined {
    if (!recipients) return undefined;
    if (Array.isArray(recipients)) return recipients;
    // Handle comma-separated string
    if (typeof recipients === 'string' && recipients.includes(',')) {
      return recipients.split(',').map((r) => r.trim());
    }
    return recipients;
  }

  private captureContent(content: string | undefined): string | undefined {
    if (!content) return undefined;

    // Limit size to prevent huge email bodies from bloating storage
    const maxSize = 64 * 1024; // 64KB
    if (content.length > maxSize) {
      return `[Truncated - ${content.length} bytes]`;
    }
    return content;
  }
}
