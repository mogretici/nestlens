import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { CollectorService } from '../core/collector.service';
import { MailWatcherConfig, NestLensConfig, NESTLENS_CONFIG } from '../nestlens.config';
import { MailEntry } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MailerService = any;

// Token for injecting mailer service
export const NESTLENS_MAILER_SERVICE = Symbol('NESTLENS_MAILER_SERVICE');

@Injectable()
export class MailWatcher implements OnModuleInit {
  private readonly logger = new Logger(MailWatcher.name);
  private readonly config: MailWatcherConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private originalSendMail?: (...args: any[]) => Promise<any>;

  constructor(
    private readonly collector: CollectorService,
    @Inject(NESTLENS_CONFIG)
    private readonly nestlensConfig: NestLensConfig,
    @Optional()
    @Inject(NESTLENS_MAILER_SERVICE)
    private readonly mailerService?: MailerService,
  ) {
    const watcherConfig = nestlensConfig.watchers?.mail;
    this.config =
      typeof watcherConfig === 'object' ? watcherConfig : { enabled: watcherConfig !== false };
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

  private setupInterceptors(): void {
    if (!this.mailerService) return;

    // Try to wrap sendMail method (common for both @nestjs-modules/mailer and nodemailer)
    if (typeof this.mailerService.sendMail === 'function') {
      this.originalSendMail = this.mailerService.sendMail.bind(this.mailerService);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.mailerService.sendMail = async (mailOptions: any): Promise<any> => {
        const startTime = Date.now();

        try {
          const result = await this.originalSendMail!(mailOptions);
          const duration = Date.now() - startTime;

          // Track successful send
          this.collectEntry(mailOptions, 'sent', duration);

          return result;
        } catch (error) {
          const duration = Date.now() - startTime;

          // Track failed send
          this.collectEntry(
            mailOptions,
            'failed',
            duration,
            error instanceof Error ? error.message : String(error),
          );

          throw error; // Re-throw to maintain original behavior
        }
      };

      this.logger.log('Mail interceptors installed');
    } else {
      this.logger.warn('Mailer service does not have a sendMail method');
    }
  }

  /**
   * Setup interceptors on a mailer service.
   * Can be called manually if you want to track a specific mailer instance.
   */
  setupMailer(mailerService: MailerService): void {
    if (!mailerService || typeof mailerService.sendMail !== 'function') {
      this.logger.warn('Invalid mailer service provided');
      return;
    }

    const originalSendMail = mailerService.sendMail.bind(mailerService);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mailerService.sendMail = async (mailOptions: any): Promise<any> => {
      const startTime = Date.now();

      try {
        const result = await originalSendMail(mailOptions);
        const duration = Date.now() - startTime;

        // Track successful send
        this.collectEntry(mailOptions, 'sent', duration);

        return result;
      } catch (error) {
        const duration = Date.now() - startTime;

        // Track failed send
        this.collectEntry(
          mailOptions,
          'failed',
          duration,
          error instanceof Error ? error.message : String(error),
        );

        throw error;
      }
    };

    this.logger.log('Mail interceptors installed on custom mailer');
  }

  private collectEntry(
    mailOptions: any,
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
