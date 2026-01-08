/**
 * NotificationWatcher Tests
 *
 * Tests for the notification watcher that monitors multi-channel notifications.
 * Follows AAA (Arrange-Act-Assert) pattern.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { CollectorService } from '../../core/collector.service';
import { NESTLENS_CONFIG, NestLensConfig } from '../../nestlens.config';
import {
  NotificationWatcher,
  NESTLENS_NOTIFICATION_SERVICE,
} from '../../watchers/notification.watcher';

describe('NotificationWatcher', () => {
  let watcher: NotificationWatcher;
  let mockCollector: jest.Mocked<CollectorService>;
  let mockConfig: NestLensConfig;

  const createNotificationService = (
    overrides: Partial<{
      sendEmail: jest.Mock;
      sendSms: jest.Mock;
      sendPush: jest.Mock;
      sendSocket: jest.Mock;
      sendWebhook: jest.Mock;
      send: jest.Mock;
    }> = {},
  ) => ({
    sendEmail: jest.fn().mockResolvedValue({ messageId: 'email-123' }),
    sendSms: jest.fn().mockResolvedValue({ messageId: 'sms-123' }),
    sendPush: jest.fn().mockResolvedValue({ messageId: 'push-123' }),
    sendSocket: jest.fn().mockResolvedValue({ delivered: true }),
    sendWebhook: jest.fn().mockResolvedValue({ status: 200 }),
    send: jest.fn().mockResolvedValue({ success: true }),
    ...overrides,
  });

  const createWatcher = async (
    config: NestLensConfig,
    notificationService?: ReturnType<typeof createNotificationService>,
  ): Promise<NotificationWatcher> => {
    const providers: any[] = [
      NotificationWatcher,
      { provide: CollectorService, useValue: mockCollector },
      { provide: NESTLENS_CONFIG, useValue: config },
    ];

    if (notificationService !== undefined) {
      providers.push({ provide: NESTLENS_NOTIFICATION_SERVICE, useValue: notificationService });
    }

    const module: TestingModule = await Test.createTestingModule({
      providers,
    }).compile();

    return module.get<NotificationWatcher>(NotificationWatcher);
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
        notification: { enabled: true },
      },
    };
  });

  // ============================================================================
  // Config Handling
  // ============================================================================

  describe('Config Handling', () => {
    it('should be enabled when notification watcher config is true', async () => {
      // Arrange
      mockConfig.watchers = { notification: true };
      const service = createNotificationService();
      watcher = await createWatcher(mockConfig, service);

      // Assert
      expect((watcher as any).config.enabled).toBe(true);
    });

    it('should be disabled when notification watcher config is false', async () => {
      // Arrange
      mockConfig.watchers = { notification: false };
      const service = createNotificationService();
      watcher = await createWatcher(mockConfig, service);

      // Assert
      expect((watcher as any).config.enabled).toBe(false);
    });

    it('should be enabled by default when watchers config is undefined', async () => {
      // Arrange
      mockConfig.watchers = undefined;
      const service = createNotificationService();
      watcher = await createWatcher(mockConfig, service);

      // Assert
      expect((watcher as any).config.enabled).toBe(true);
    });

    it('should use object config when provided', async () => {
      // Arrange
      mockConfig.watchers = { notification: { enabled: true, captureMessage: true } };
      const service = createNotificationService();
      watcher = await createWatcher(mockConfig, service);

      // Assert
      expect((watcher as any).config.captureMessage).toBe(true);
    });
  });

  // ============================================================================
  // Module Initialization
  // ============================================================================

  describe('Module Initialization', () => {
    it('should handle missing notification service gracefully', async () => {
      // Arrange
      watcher = await createWatcher(mockConfig, undefined);

      // Act & Assert - should not throw
      expect(() => watcher.onModuleInit()).not.toThrow();
    });

    it('should setup interceptors when service is available', async () => {
      // Arrange
      const service = createNotificationService();
      watcher = await createWatcher(mockConfig, service);

      // Act
      watcher.onModuleInit();

      // Assert - methods should be wrapped
      expect(typeof service.sendEmail).toBe('function');
    });

    it('should not setup interceptors when disabled', async () => {
      // Arrange
      mockConfig.watchers = { notification: false };
      const service = createNotificationService();
      const originalSendEmail = service.sendEmail;
      watcher = await createWatcher(mockConfig, service);

      // Act
      watcher.onModuleInit();

      // Assert - original method should remain unchanged
      expect(service.sendEmail).toBe(originalSendEmail);
    });

    it('should skip missing methods', async () => {
      // Arrange
      const partialService = {
        sendEmail: jest.fn().mockResolvedValue({}),
        // Other methods missing
      } as any;
      watcher = await createWatcher(mockConfig, partialService);

      // Act & Assert - should not throw
      expect(() => watcher.onModuleInit()).not.toThrow();
    });
  });

  // ============================================================================
  // Email Notifications
  // ============================================================================

  describe('Email Notifications', () => {
    it('should collect sent email notification', async () => {
      // Arrange
      const service = createNotificationService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.sendEmail({
        to: 'user@example.com',
        subject: 'Welcome',
        body: 'Hello!',
      });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'notification',
        expect.objectContaining({
          type: 'email',
          status: 'sent',
          title: 'Welcome',
        }),
      );
    });

    it('should calculate notification duration', async () => {
      // Arrange
      const service = createNotificationService({
        sendEmail: jest
          .fn()
          .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({}), 50))),
      });
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.sendEmail({ to: 'test@example.com', subject: 'Test' });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'notification',
        expect.objectContaining({
          duration: expect.any(Number),
        }),
      );
      const call = mockCollector.collect.mock.calls[0][1] as any;
      expect(call.duration).toBeGreaterThanOrEqual(40);
    });

    it('should return original result', async () => {
      // Arrange
      const expectedResult = { messageId: 'abc-123', accepted: true };
      const service = createNotificationService({
        sendEmail: jest.fn().mockResolvedValue(expectedResult),
      });
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      const result = await service.sendEmail({ to: 'test@example.com', subject: 'Test' });

      // Assert
      expect(result).toEqual(expectedResult);
    });
  });

  // ============================================================================
  // SMS Notifications
  // ============================================================================

  describe('SMS Notifications', () => {
    it('should collect sent SMS notification', async () => {
      // Arrange
      const service = createNotificationService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.sendSms({
        to: '+1234567890',
        body: 'Your code is 123456',
      });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'notification',
        expect.objectContaining({
          type: 'sms',
          status: 'sent',
        }),
      );
    });
  });

  // ============================================================================
  // Push Notifications
  // ============================================================================

  describe('Push Notifications', () => {
    it('should collect sent push notification', async () => {
      // Arrange
      const service = createNotificationService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.sendPush({
        to: 'device-token-123',
        title: 'New Message',
        body: 'You have a new message',
      });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'notification',
        expect.objectContaining({
          type: 'push',
          status: 'sent',
          title: 'New Message',
        }),
      );
    });
  });

  // ============================================================================
  // Socket Notifications
  // ============================================================================

  describe('Socket Notifications', () => {
    it('should collect sent socket notification', async () => {
      // Arrange
      const service = createNotificationService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.sendSocket({
        to: 'socket-id-123',
        message: 'Real-time update',
      });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'notification',
        expect.objectContaining({
          type: 'socket',
          status: 'sent',
        }),
      );
    });
  });

  // ============================================================================
  // Webhook Notifications
  // ============================================================================

  describe('Webhook Notifications', () => {
    it('should collect sent webhook notification', async () => {
      // Arrange
      const service = createNotificationService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.sendWebhook({
        to: 'https://webhook.example.com/notify',
        body: JSON.stringify({ event: 'user.created' }),
      });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'notification',
        expect.objectContaining({
          type: 'webhook',
          status: 'sent',
        }),
      );
    });
  });

  // ============================================================================
  // Generic Send Method
  // ============================================================================

  describe('Generic Send Method', () => {
    it('should collect sent notification from generic send', async () => {
      // Arrange
      const service = createNotificationService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.send({
        to: 'user@example.com',
        subject: 'Generic',
        body: 'Test',
      });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'notification',
        expect.objectContaining({
          type: 'email', // Generic send defaults to email
          status: 'sent',
        }),
      );
    });
  });

  // ============================================================================
  // Failed Notifications
  // ============================================================================

  describe('Failed Notifications', () => {
    it('should collect failed notification', async () => {
      // Arrange
      const service = createNotificationService({
        sendEmail: jest.fn().mockRejectedValue(new Error('SMTP connection failed')),
      });
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act & Assert
      await expect(service.sendEmail({ to: 'test@example.com', subject: 'Test' })).rejects.toThrow(
        'SMTP connection failed',
      );

      expect(mockCollector.collect).toHaveBeenCalledWith(
        'notification',
        expect.objectContaining({
          status: 'failed',
          error: 'SMTP connection failed',
        }),
      );
    });

    it('should re-throw the error', async () => {
      // Arrange
      const service = createNotificationService({
        sendSms: jest.fn().mockRejectedValue(new Error('SMS gateway error')),
      });
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act & Assert
      await expect(service.sendSms({ to: '+1234567890', body: 'Test' })).rejects.toThrow(
        'SMS gateway error',
      );
    });

    it('should handle non-Error objects', async () => {
      // Arrange
      const service = createNotificationService({
        sendPush: jest.fn().mockRejectedValue('String error'),
      });
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      try {
        await service.sendPush({ to: 'device', body: 'Test' });
      } catch {
        // Expected
      }

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'notification',
        expect.objectContaining({
          error: 'String error',
        }),
      );
    });
  });

  // ============================================================================
  // Recipient Masking
  // ============================================================================

  describe('Recipient Masking', () => {
    it('should mask email recipient', async () => {
      // Arrange
      const service = createNotificationService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.sendEmail({ to: 'john.doe@example.com', subject: 'Test' });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'notification',
        expect.objectContaining({
          recipient: 'j***@example.com',
        }),
      );
    });

    it('should mask short email recipient', async () => {
      // Arrange
      const service = createNotificationService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.sendEmail({ to: 'a@example.com', subject: 'Test' });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'notification',
        expect.objectContaining({
          recipient: 'a***@example.com',
        }),
      );
    });

    it('should mask phone number recipient', async () => {
      // Arrange
      const service = createNotificationService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.sendSms({ to: '+14155551234', body: 'Test' });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'notification',
        expect.objectContaining({
          recipient: '+141***1234',
        }),
      );
    });

    it('should mask generic recipient', async () => {
      // Arrange
      const service = createNotificationService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.sendPush({ to: 'device-token-abc123', body: 'Test' });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'notification',
        expect.objectContaining({
          recipient: 'd***',
        }),
      );
    });

    it('should mask array of recipients', async () => {
      // Arrange
      const service = createNotificationService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.sendEmail({
        to: ['alice@example.com', 'bob@example.com'],
        subject: 'Test',
      });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'notification',
        expect.objectContaining({
          recipient: ['a***@example.com', 'b***@example.com'],
        }),
      );
    });

    it('should handle very short recipient', async () => {
      // Arrange
      const service = createNotificationService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.sendPush({ to: 'x', body: 'Test' });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'notification',
        expect.objectContaining({
          recipient: '***',
        }),
      );
    });
  });

  // ============================================================================
  // Message Capture
  // ============================================================================

  describe('Message Capture', () => {
    it('should capture message when enabled', async () => {
      // Arrange
      mockConfig.watchers = { notification: { enabled: true, captureMessage: true } };
      const service = createNotificationService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.sendEmail({ to: 'test@example.com', subject: 'Test', body: 'Hello World' });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'notification',
        expect.objectContaining({
          message: 'Hello World',
        }),
      );
    });

    it('should not capture message when disabled', async () => {
      // Arrange
      mockConfig.watchers = { notification: { enabled: true, captureMessage: false } };
      const service = createNotificationService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.sendEmail({ to: 'test@example.com', subject: 'Test', body: 'Secret' });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'notification',
        expect.objectContaining({
          message: undefined,
        }),
      );
    });

    it('should truncate large message', async () => {
      // Arrange
      mockConfig.watchers = { notification: { enabled: true, captureMessage: true } };
      const service = createNotificationService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();
      const largeMessage = 'x'.repeat(2000);

      // Act
      await service.sendEmail({ to: 'test@example.com', subject: 'Test', body: largeMessage });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'notification',
        expect.objectContaining({
          message: expect.stringContaining('... (truncated)'),
        }),
      );
    });
  });

  // ============================================================================
  // Metadata Capture
  // ============================================================================

  describe('Metadata Capture', () => {
    it('should capture metadata', async () => {
      // Arrange
      const service = createNotificationService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.sendEmail({
        to: 'test@example.com',
        subject: 'Test',
        metadata: { userId: 123, campaign: 'welcome' },
      });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'notification',
        expect.objectContaining({
          metadata: { userId: 123, campaign: 'welcome' },
        }),
      );
    });

    it('should truncate large metadata', async () => {
      // Arrange
      const service = createNotificationService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();
      const largeMetadata = { data: 'x'.repeat(5000) };

      // Act
      await service.sendEmail({
        to: 'test@example.com',
        subject: 'Test',
        metadata: largeMetadata,
      });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'notification',
        expect.objectContaining({
          metadata: expect.objectContaining({
            _truncated: true,
            _size: expect.any(Number),
          }),
        }),
      );
    });

    it('should handle non-serializable metadata', async () => {
      // Arrange
      const service = createNotificationService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();
      const circularMetadata: any = {};
      circularMetadata.self = circularMetadata;

      // Act
      await service.sendEmail({
        to: 'test@example.com',
        subject: 'Test',
        metadata: circularMetadata,
      });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'notification',
        expect.objectContaining({
          metadata: { _error: 'Unable to serialize metadata' },
        }),
      );
    });
  });

  // ============================================================================
  // Data Extraction
  // ============================================================================

  describe('Data Extraction', () => {
    it('should extract from object-based API', async () => {
      // Arrange
      const service = createNotificationService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.sendEmail({
        to: 'user@example.com',
        subject: 'Subject',
        body: 'Body',
      });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'notification',
        expect.objectContaining({
          title: 'Subject',
        }),
      );
    });

    it('should extract recipient from various fields', async () => {
      // Arrange
      const service = createNotificationService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act - using 'recipient' field
      await service.sendEmail({ recipient: 'via-recipient@example.com', subject: 'Test' });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'notification',
        expect.objectContaining({
          recipient: 'v***@example.com',
        }),
      );
    });

    it('should extract from positional API', async () => {
      // Arrange
      const service = createNotificationService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act - using positional arguments
      await service.sendEmail('user@example.com', 'Subject', 'Body');

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'notification',
        expect.objectContaining({
          title: 'Subject',
        }),
      );
    });

    it('should handle empty arguments', async () => {
      // Arrange
      const service = createNotificationService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.sendEmail();

      // Assert - 'unknown' gets masked to 'u***'
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'notification',
        expect.objectContaining({
          recipient: 'u***',
        }),
      );
    });

    it('should extract title from title field', async () => {
      // Arrange
      const service = createNotificationService();
      watcher = await createWatcher(mockConfig, service);
      watcher.onModuleInit();

      // Act
      await service.sendPush({ to: 'device', title: 'Push Title' });

      // Assert
      expect(mockCollector.collect).toHaveBeenCalledWith(
        'notification',
        expect.objectContaining({
          title: 'Push Title',
        }),
      );
    });
  });
});
