---
sidebar_position: 7
---

# Event Watcher

The Event Watcher monitors event emissions in your NestJS application using the EventEmitter2 pattern, tracking which events are fired, their payloads, and which listeners handle them.

## What Gets Captured

- Event name
- Event payload/data
- List of listener functions
- Processing duration (milliseconds)

## Configuration

```typescript
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    NestLensModule.forRoot({
      watchers: {
        event: {
          enabled: true,
          ignoreEvents: ['internal', 'debug', 'health-check'],
        },
      },
    }),
  ],
})
export class AppModule {}
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable/disable event tracking |
| `ignoreEvents` | string[] | `[]` | Event name substrings to ignore (uses substring matching) |

## Payload Structure

```typescript
interface EventEntry {
  type: 'event';
  payload: {
    name: string;               // Event name
    payload: unknown;           // Event data (truncated to 64KB)
    listeners: string[];        // Listener function names
    duration: number;           // Processing time (ms)
  };
}
```

## Usage Example

### Setup EventEmitter

```typescript
// Install: npm install @nestjs/event-emitter
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [EventEmitterModule.forRoot()],
})
export class AppModule {}
```

### Emitting Events

```typescript
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class OrderService {
  constructor(private eventEmitter: EventEmitter2) {}

  async createOrder(data: CreateOrderDto) {
    const order = await this.orderRepository.save(data);

    // Emit event (automatically tracked)
    this.eventEmitter.emit('order.created', {
      orderId: order.id,
      userId: order.userId,
      total: order.total,
    });

    return order;
  }

  async cancelOrder(id: string) {
    const order = await this.orderRepository.update(id, { status: 'cancelled' });

    // Emit cancellation event
    this.eventEmitter.emit('order.cancelled', { orderId: id });

    return order;
  }
}
```

### Listening to Events

```typescript
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

@Injectable()
export class OrderListener {
  @OnEvent('order.created')
  handleOrderCreated(payload: { orderId: string; userId: string; total: number }) {
    // Send confirmation email
    console.log(`Order ${payload.orderId} created`);
  }

  @OnEvent('order.created')
  updateInventory(payload: { orderId: string }) {
    // Update inventory
    console.log(`Updating inventory for order ${payload.orderId}`);
  }

  @OnEvent('order.cancelled')
  handleOrderCancelled(payload: { orderId: string }) {
    // Refund payment
    console.log(`Processing refund for order ${payload.orderId}`);
  }
}
```

## Dashboard View

In the NestLens dashboard, event entries show:

- Timeline of emitted events
- Event names and payloads
- Number of listeners per event
- Most frequently emitted events
- Event processing duration
- Listener execution analysis

## Event Patterns

### Domain Events

```typescript
// User domain
this.eventEmitter.emit('user.registered', userData);
this.eventEmitter.emit('user.verified', { userId });
this.eventEmitter.emit('user.deleted', { userId });

// Order domain
this.eventEmitter.emit('order.placed', orderData);
this.eventEmitter.emit('order.shipped', { orderId });
this.eventEmitter.emit('order.delivered', { orderId });
```

### Wildcard Listeners

```typescript
@Injectable()
export class AuditListener {
  // Listen to all order events
  @OnEvent('order.*')
  handleOrderEvent(event: string, payload: any) {
    this.auditLog.log(`Event: ${event}`, payload);
  }

  // Listen to all events
  @OnEvent('**')
  handleAllEvents(event: string, payload: any) {
    console.log(`Event emitted: ${event}`);
  }
}
```

## Related Watchers

- [Request Watcher](./request) - See events triggered during requests
- [Job Watcher](./job) - Track event-driven job queues
