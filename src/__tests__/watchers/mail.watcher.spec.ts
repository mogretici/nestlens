/**
 * MailWatcher Tests
 *
 * Tests for the mail watcher that monitors email sending.
 * Follows AAA (Arrange-Act-Assert) pattern.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { CollectorService } from '../../core/collector.service';
import { NESTLENS_CONFIG, NestLensConfig } from '../../nestlens.config';
import { MailWatcher, NESTLENS_MAILER_SERVICE } from '../../watchers/mail.watcher';

describe('MailWatcher', () => {
  let watcher: MailWatcher;
  let mockCollector: jest.Mocked<CollectorService>;
  let mockConfig: NestLensConfig;

  const createMailerService = (overrides: Partial<{
    sendMail: jest.Mock;
  }> = {}) => ({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test-123' }),
    ...overrides,
  });

  const createWatcher = async (
    config: NestLensConfig,
    mailerService?: ReturnType<typeof createMailerService>,
  ): Promise<MailWatcher> => {
    const providers: any[] = [
      MailWatcher,
      { provide: CollectorService, useValue: mockCollector },
      { provide: NESTLENS_CONFIG, useValue: config },
    ];

    if (mailerService !== undefined) {
      providers.push({ provide: NESTLENS_MAILER_SERVICE, useValue: mailerService });
    }

    const module: TestingModule = await Test.createTestingModule({
      providers,
    }).compile();

    return module.get<MailWatcher>(MailWatcher);
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockCollector = {
      collect: jest.fn(),
      collectImmediate: jest.fn(),
    } as unknown as jest.Mocked<CollectorService>;

    mockConfig = {
      enabled: true,
      watchers: {
        mail: { enabled: true },
      },
    };
  });

  // ============================================================================
  // Config Handling
  // ============================================================================

  describe('Config Handling', () => {
    it('should be enabled when mail watcher config is true', async () => {
      // Arrange
      mockConfig.watchers = { mail: true };
      const mailer = createMailerService();
      watcher = await createWatcher(mockConfig, mailer);

      // Assert
      expect((watcher as any).config.enabled).toBe(true);
    });

    it('should be disabled when mail watcher config is false', async () => {
      // Arrange
      mockConfig.watchers = { mail: false };
      const mailer = createMailerService();
      watcher = await createWatcher(mockConfig, mailer);

      // Act
      watcher.onModuleInit();
      await mailer.sendMail({ to: 'test@example.com', subject: 'Test' });

      // Assert - should not intercept
      expect(mockCollector.collect).not.toHaveBeenCalled();
    });

    it('should be enabled by default when watchers config is undefined', async () => {
      // Arrange
      mockConfig.watchers = undefined;
      const mailer = createMailerService();
      watcher = await createWatcher(mockConfig, mailer);

      // Assert
      expect((watcher as any).config.enabled).toBe(true);
    });
  });

  // ============================================================================
  // Module Initialization
  // ============================================================================

  describe('Module Initialization', () => {
    it('should handle missing mailer service gracefully', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, undefined);

      // Act & Assert - should not throw
      expect(() => watcher.onModuleInit()).not.toThrow();
    });

    it('should setup interceptors when mailer is available', async () => {
      // Arrange
      const mailer = createMailerService();
      watcher = await createWatcher(mockConfig, mailer);

      // Act
      watcher.onModuleInit();

      // Assert
      expect((watcher as any).originalSendMail).toBeDefined();
    });

    it('should handle mailer without sendMail method', async () => {
      // Arrange
      const invalidMailer = {};
      watcher = await createWatcher(mockConfig, invalidMailer as any);

      // Act & Assert - should not throw
      expect(() => watcher.onModuleInit()).not.toThrow();
    });
  });

  // ============================================================================
  // Mail Sending - Success
  // ============================================================================

  describe('Mail Sending - Success', () => {
    it('should collect successful mail send', async () => {
      // Arrange
      const mailer = createMailerService();
      watcher = await createWatcher(mockConfig, mailer);
      watcher.onModuleInit();

      // Act
      await mailer.sendMail({
        to: 'recipient@example.com',
        subject: 'Test Subject',
        text: 'Hello World',
      });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'mail',
        expect.objectContaining({
          to: 'recipient@example.com',
          subject: 'Test Subject',
          text: 'Hello World',
          status: 'sent',
        }),
      );
    });

    it('should collect duration for mail send', async () => {
      // Arrange
      const mailer = createMailerService({
        sendMail: jest.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve({}), 50)),
        ),
      });
      watcher = await createWatcher(mockConfig, mailer);
      watcher.onModuleInit();

      // Act
      await mailer.sendMail({ to: 'test@example.com', subject: 'Test' });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'mail',
        expect.objectContaining({
          duration: expect.any(Number),
        }),
      );
      const call = mockCollector.collect.mock.calls[0][1] as any;
      expect(call.duration).toBeGreaterThanOrEqual(0);
    });

    it('should return original result', async () => {
      // Arrange
      const expectedResult = { messageId: 'abc-123', accepted: ['test@example.com'] };
      const mailer = createMailerService({
        sendMail: jest.fn().mockResolvedValue(expectedResult),
      });
      watcher = await createWatcher(mockConfig, mailer);
      watcher.onModuleInit();

      // Act
      const result = await mailer.sendMail({ to: 'test@example.com', subject: 'Test' });

      // Assert
      expect(result).toEqual(expectedResult);
    });
  });

  // ============================================================================
  // Mail Sending - Failure
  // ============================================================================

  describe('Mail Sending - Failure', () => {
    it('should collect failed mail send', async () => {
      // Arrange
      const mailer = createMailerService({
        sendMail: jest.fn().mockRejectedValue(new Error('SMTP connection failed')),
      });
      watcher = await createWatcher(mockConfig, mailer);
      watcher.onModuleInit();

      // Act & Assert
      await expect(mailer.sendMail({
        to: 'test@example.com',
        subject: 'Test',
      })).rejects.toThrow('SMTP connection failed');

      expect(mockCollector.collect).toHaveBeenCalledWith(
        'mail',
        expect.objectContaining({
          status: 'failed',
          error: 'SMTP connection failed',
        }),
      );
    });

    it('should re-throw the error', async () => {
      // Arrange
      const mailer = createMailerService({
        sendMail: jest.fn().mockRejectedValue(new Error('Network error')),
      });
      watcher = await createWatcher(mockConfig, mailer);
      watcher.onModuleInit();

      // Act & Assert
      await expect(mailer.sendMail({ to: 'test@example.com', subject: 'Test' }))
        .rejects.toThrow('Network error');
    });

    it('should handle non-Error objects', async () => {
      // Arrange
      const mailer = createMailerService({
        sendMail: jest.fn().mockRejectedValue('String error'),
      });
      watcher = await createWatcher(mockConfig, mailer);
      watcher.onModuleInit();

      // Act
      try {
        await mailer.sendMail({ to: 'test@example.com', subject: 'Test' });
      } catch {
        // Expected
      }

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'mail',
        expect.objectContaining({
          error: 'String error',
        }),
      );
    });
  });

  // ============================================================================
  // Recipients Handling
  // ============================================================================

  describe('Recipients Handling', () => {
    it('should handle single recipient', async () => {
      // Arrange
      const mailer = createMailerService();
      watcher = await createWatcher(mockConfig, mailer);
      watcher.onModuleInit();

      // Act
      await mailer.sendMail({ to: 'single@example.com', subject: 'Test' });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'mail',
        expect.objectContaining({
          to: 'single@example.com',
        }),
      );
    });

    it('should handle array of recipients', async () => {
      // Arrange
      const mailer = createMailerService();
      watcher = await createWatcher(mockConfig, mailer);
      watcher.onModuleInit();

      // Act
      await mailer.sendMail({
        to: ['a@example.com', 'b@example.com'],
        subject: 'Test',
      });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'mail',
        expect.objectContaining({
          to: ['a@example.com', 'b@example.com'],
        }),
      );
    });

    it('should parse comma-separated recipients', async () => {
      // Arrange
      const mailer = createMailerService();
      watcher = await createWatcher(mockConfig, mailer);
      watcher.onModuleInit();

      // Act
      await mailer.sendMail({
        to: 'a@example.com, b@example.com, c@example.com',
        subject: 'Test',
      });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'mail',
        expect.objectContaining({
          to: ['a@example.com', 'b@example.com', 'c@example.com'],
        }),
      );
    });

    it('should handle CC and BCC', async () => {
      // Arrange
      const mailer = createMailerService();
      watcher = await createWatcher(mockConfig, mailer);
      watcher.onModuleInit();

      // Act
      await mailer.sendMail({
        to: 'main@example.com',
        cc: 'cc@example.com',
        bcc: ['bcc1@example.com', 'bcc2@example.com'],
        subject: 'Test',
      });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'mail',
        expect.objectContaining({
          to: 'main@example.com',
          cc: 'cc@example.com',
          bcc: ['bcc1@example.com', 'bcc2@example.com'],
        }),
      );
    });
  });

  // ============================================================================
  // Content Capture
  // ============================================================================

  describe('Content Capture', () => {
    it('should capture HTML content', async () => {
      // Arrange
      const mailer = createMailerService();
      watcher = await createWatcher(mockConfig, mailer);
      watcher.onModuleInit();

      // Act
      await mailer.sendMail({
        to: 'test@example.com',
        subject: 'Test',
        html: '<h1>Hello</h1><p>World</p>',
      });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'mail',
        expect.objectContaining({
          html: '<h1>Hello</h1><p>World</p>',
        }),
      );
    });

    it('should capture text content', async () => {
      // Arrange
      const mailer = createMailerService();
      watcher = await createWatcher(mockConfig, mailer);
      watcher.onModuleInit();

      // Act
      await mailer.sendMail({
        to: 'test@example.com',
        subject: 'Test',
        text: 'Plain text content',
      });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'mail',
        expect.objectContaining({
          text: 'Plain text content',
        }),
      );
    });

    it('should truncate large content', async () => {
      // Arrange
      const mailer = createMailerService();
      watcher = await createWatcher(mockConfig, mailer);
      watcher.onModuleInit();
      const largeContent = 'x'.repeat(100000);

      // Act
      await mailer.sendMail({
        to: 'test@example.com',
        subject: 'Test',
        html: largeContent,
      });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'mail',
        expect.objectContaining({
          html: expect.stringContaining('[Truncated'),
        }),
      );
    });

    it('should capture from address', async () => {
      // Arrange
      const mailer = createMailerService();
      watcher = await createWatcher(mockConfig, mailer);
      watcher.onModuleInit();

      // Act
      await mailer.sendMail({
        from: 'sender@example.com',
        to: 'test@example.com',
        subject: 'Test',
      });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'mail',
        expect.objectContaining({
          from: 'sender@example.com',
        }),
      );
    });
  });

  // ============================================================================
  // setupMailer (Manual Setup)
  // ============================================================================

  describe('setupMailer (Manual Setup)', () => {
    it('should setup interceptors on custom mailer', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, undefined);
      const customMailer = createMailerService();

      // Act
      watcher.setupMailer(customMailer);
      await customMailer.sendMail({
        to: 'test@example.com',
        subject: 'Custom Test',
      });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'mail',
        expect.objectContaining({
          subject: 'Custom Test',
        }),
      );
    });

    it('should handle invalid mailer', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, undefined);

      // Act & Assert - should not throw
      expect(() => watcher.setupMailer(null as any)).not.toThrow();
      expect(() => watcher.setupMailer({} as any)).not.toThrow();
    });

    it('should track failures on custom mailer', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, undefined);
      const customMailer = createMailerService({
        sendMail: jest.fn().mockRejectedValue(new Error('Custom error')),
      });

      // Act
      watcher.setupMailer(customMailer);
      try {
        await customMailer.sendMail({ to: 'test@example.com', subject: 'Test' });
      } catch {
        // Expected
      }

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'mail',
        expect.objectContaining({
          status: 'failed',
          error: 'Custom error',
        }),
      );
    });
  });

  // ============================================================================
  // Default Values
  // ============================================================================

  describe('Default Values', () => {
    it('should use empty string for missing to', async () => {
      // Arrange
      const mailer = createMailerService();
      watcher = await createWatcher(mockConfig, mailer);
      watcher.onModuleInit();

      // Act
      await mailer.sendMail({ subject: 'Test' });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'mail',
        expect.objectContaining({
          to: '',
        }),
      );
    });

    it('should use empty string for missing subject', async () => {
      // Arrange
      const mailer = createMailerService();
      watcher = await createWatcher(mockConfig, mailer);
      watcher.onModuleInit();

      // Act
      await mailer.sendMail({ to: 'test@example.com' });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'mail',
        expect.objectContaining({
          subject: '',
        }),
      );
    });
  });
});
