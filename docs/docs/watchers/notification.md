---
sidebar_position: 14
---

# Notification Watcher

The Notification Watcher tracks multi-channel notification delivery (email, SMS, push, socket, webhook), monitoring delivery status, recipients, and performance.

## What Gets Captured

- Notification type (email, sms, push, socket, webhook)
- Recipient (masked for privacy)
- Message title/subject
- Message content (if enabled)
- Metadata
- Delivery status (sent, failed)
- Sending duration
- Error messages

## Configuration

```typescript
NestLensModule.forRoot({
  watchers: {
    notification: {
      enabled: true,
      captureMessage: false, // Set to true to capture message content
    },
  },
})
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable/disable notification tracking |
| `captureMessage` | boolean | `false` | Capture message content |

## Payload Structure

```typescript
interface NotificationEntry {
  type: 'notification';
  payload: {
    type: 'email' | 'sms' | 'push' | 'socket' | 'webhook';
    recipient: string | string[];  // Masked (e.g., "j***@example.com")
    title?: string;                // Subject/title
    message?: string;              // Content (if captureMessage: true)
    metadata?: Record<string, unknown>;
    status: 'sent' | 'failed';
    duration: number;              // Send time (ms)
    error?: string;                // Error message
  };
}
```

## Usage Example

### Provide Notification Service

```typescript
import { NESTLENS_NOTIFICATION_SERVICE } from 'nestlens';

@Module({
  providers: [
    NotificationService,
    {
      provide: NESTLENS_NOTIFICATION_SERVICE,
      useExisting: NotificationService,
    },
  ],
})
export class AppModule {}
```

### Notification Service

```typescript
@Injectable()
export class NotificationService {
  async sendEmail(options: {
    to: string;
    subject: string;
    body: string;
  }) {
    // Automatically tracked
    await this.emailProvider.send(options);
  }

  async sendSms(options: {
    to: string;
    message: string;
  }) {
    await this.smsProvider.send(options);
  }

  async sendPush(options: {
    to: string;
    title: string;
    message: string;
  }) {
    await this.pushProvider.send(options);
  }

  async sendSocket(options: {
    to: string;
    event: string;
    data: any;
  }) {
    await this.socketProvider.emit(options);
  }

  async sendWebhook(options: {
    url: string;
    data: any;
  }) {
    await this.httpClient.post(options.url, options.data);
  }
}
```

### Multi-Channel Notifications

```typescript
@Injectable()
export class UserNotificationService {
  constructor(private notifications: NotificationService) {}

  async notifyUserOrderShipped(userId: string, orderId: string) {
    const user = await this.userService.findOne(userId);

    // Send email notification
    await this.notifications.sendEmail({
      to: user.email,
      subject: 'Your order has shipped!',
      body: `Order #${orderId} is on its way.`,
    });

    // Send push notification
    await this.notifications.sendPush({
      to: user.deviceToken,
      title: 'Order Shipped',
      message: `Order #${orderId} is on its way!`,
    });

    // Send WebSocket notification
    await this.notifications.sendSocket({
      to: userId,
      event: 'order.shipped',
      data: { orderId },
    });
  }
}
```

## Dashboard View

In the NestLens dashboard, notification entries show:

- Timeline of notifications
- Delivery success/failure rates by channel
- Most common notification types
- Recipient patterns (masked)
- Performance by channel
- Error analysis

## Recipient Masking

Recipients are automatically masked for privacy:

### Email Masking
```
john@example.com → j***@example.com
admin@company.com → a***@company.com
```

### Phone Masking
```
+1234567890 → +123***7890
```

### Generic Masking
```
user123 → u***
```

## Message Capture

By default, message content is NOT captured. Enable with caution:

```typescript
NestLensModule.forRoot({
  watchers: {
    notification: {
      captureMessage: true, // Be careful with sensitive data!
    },
  },
})
```

Messages are limited to 1KB to prevent storage bloat.

## Related Watchers

- [Mail Watcher](./mail) - Dedicated email tracking
- [Request Watcher](./request) - See which requests triggered notifications
- [Event Watcher](./event) - Track events that trigger notifications
