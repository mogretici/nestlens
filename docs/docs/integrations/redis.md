---
sidebar_position: 4
---

# Redis Integration

NestLens integrates with Redis to track commands, monitor performance, and automatically mask sensitive data for security.

## Overview

The Redis Watcher tracks:
- All Redis commands (GET, SET, DEL, etc.)
- Command execution duration
- Command arguments and results
- Success/error status
- Automatic sensitive data masking

## Setup

### 1. Enable Redis Watcher

```typescript
// app.module.ts
import { NestLensModule } from 'nestlens';

@Module({
  imports: [
    NestLensModule.forRoot({
      watchers: {
        redis: true, // Enable Redis tracking
      },
    }),
  ],
})
export class AppModule {}
```

### 2. Provide Redis Client

Inject your Redis client with the `NESTLENS_REDIS_CLIENT` token:

```typescript
import { NESTLENS_REDIS_CLIENT } from 'nestlens';
import Redis from 'ioredis';

@Module({
  providers: [
    {
      provide: NESTLENS_REDIS_CLIENT,
      useFactory: () => {
        return new Redis({
          host: 'localhost',
          port: 6379,
        });
      },
    },
  ],
})
export class AppModule {}
```

### 3. Using Existing Redis Service

If you already have a Redis service:

```typescript
// redis.service.ts
import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService extends Redis {
  constructor() {
    super({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
    });
  }
}

// app.module.ts
import { NESTLENS_REDIS_CLIENT } from 'nestlens';

@Module({
  providers: [
    RedisService,
    {
      provide: NESTLENS_REDIS_CLIENT,
      useExisting: RedisService, // Use existing service
    },
  ],
})
export class AppModule {}
```

## Tracked Commands

NestLens automatically tracks these Redis commands:

### String Operations
- `get` - Retrieve string value
- `set` - Set string value
- `del` - Delete key(s)
- `exists` - Check if key exists
- `expire` - Set key expiration
- `ttl` - Get time to live
- `incr` - Increment value
- `decr` - Decrement value
- `mget` - Get multiple values
- `mset` - Set multiple values

### List Operations
- `lpush` - Push to list (left)
- `rpush` - Push to list (right)
- `lpop` - Pop from list (left)
- `rpop` - Pop from list (right)
- `lrange` - Get range from list

### Hash Operations
- `hget` - Get hash field
- `hset` - Set hash field
- `hdel` - Delete hash field
- `hgetall` - Get all hash fields

### Set Operations
- `sadd` - Add to set
- `srem` - Remove from set
- `smembers` - Get all set members

### Sorted Set Operations
- `zadd` - Add to sorted set
- `zrem` - Remove from sorted set
- `zrange` - Get range from sorted set

## Entry Data

### Redis Entry Structure

```typescript
{
  type: 'redis',
  payload: {
    command: 'get',
    args: ['user:123:profile'],
    duration: 2,              // milliseconds
    keyPattern: 'user:123:profile',
    status: 'success',        // or 'error'
    result: { name: 'John', email: 'john@example.com' },
    error: undefined          // error message if failed
  }
}
```

### Example Entries

**Simple GET command:**
```typescript
{
  command: 'get',
  args: ['session:abc123'],
  duration: 1,
  keyPattern: 'session:abc123',
  status: 'success',
  result: '{"userId": 456}'
}
```

**SET command:**
```typescript
{
  command: 'set',
  args: ['cache:user:789', '{"name":"Alice"}'],
  duration: 2,
  keyPattern: 'cache:user:789',
  status: 'success',
  result: 'OK'
}
```

**Multi-key operation:**
```typescript
{
  command: 'mget',
  args: ['key1', 'key2', 'key3'],
  duration: 3,
  keyPattern: 'mget(3 keys)',
  status: 'success',
  result: ['value1', 'value2', 'value3']
}
```

## Sensitive Data Masking

NestLens automatically masks sensitive data for security.

### Auto-Masked Key Patterns

Keys containing these patterns are automatically masked:

- `password`
- `token`
- `secret`
- `auth`
- `key`
- `credential`
- `session`

### Masking Behavior

**Sensitive key example:**
```typescript
// Command: redis.set('user:token:abc', 'secret-token-value')

// Tracked as:
{
  command: 'set',
  args: ['user:token:abc', '***MASKED***'],  // Value masked
  result: '***MASKED***',                     // Result masked
  keyPattern: 'user:token:abc'                // Key visible
}
```

**Normal key example:**
```typescript
// Command: redis.get('user:123:name')

// Tracked as:
{
  command: 'get',
  args: ['user:123:name'],
  result: 'John Doe',  // Not masked
  keyPattern: 'user:123:name'
}
```

### Why Masking?

- **Security** - Prevents sensitive data in logs
- **Compliance** - Helps meet security requirements
- **Privacy** - Protects user credentials and tokens
- **Debugging** - Still see command patterns without exposing secrets

## Configuration

### Redis Watcher Config

```typescript
interface RedisWatcherConfig {
  enabled?: boolean;
  ignoreCommands?: string[];     // Commands to ignore
  maxResultSize?: number;        // Max result size in bytes (default: 1KB)
}
```

### Example Configuration

```typescript
NestLensModule.forRoot({
  watchers: {
    redis: {
      enabled: true,
      ignoreCommands: ['ping', 'info', 'select'],
      maxResultSize: 2048, // 2KB
    },
  },
})
```

### Ignore Commands

Exclude noisy or irrelevant commands:

```typescript
redis: {
  ignoreCommands: [
    'ping',      // Health checks
    'info',      // Server info
    'select',    // Database selection
    'config',    // Configuration commands
  ],
}
```

### Result Size Limiting

Control captured result size:

```typescript
redis: {
  maxResultSize: 1024, // 1KB default
}
```

Results exceeding this size are truncated:
```typescript
{
  result: {
    _truncated: true,
    _size: 5242880  // 5MB actual size
  }
}
```

## Dashboard Features

### Redis Command Filtering

Filter commands in the dashboard:

1. **Command Type** - Filter by specific command (GET, SET, etc.)
2. **Status** - success or error
3. **Key Pattern** - Search by key pattern
4. **Time Range** - View commands from specific periods

### Performance Monitoring

Track Redis performance:

- **Command Duration** - Execution time per command
- **Slow Commands** - Identify bottlenecks
- **Error Rate** - Failed command percentage
- **Most Used Commands** - Frequency analysis

### Command Details

Click any command to view:
- Complete arguments
- Result data (masked if sensitive)
- Execution duration
- Error details (if failed)
- Key pattern

## Use Cases

### 1. Cache Hit Rate Analysis

Monitor cache effectiveness:

```typescript
// In dashboard:
// 1. Filter by command: 'get'
// 2. Check result: null (cache miss) vs data (cache hit)
// 3. Calculate hit rate
```

### 2. Debug Cache Issues

Identify cache problems:

```typescript
// Find SET commands that might be overwriting data
// Check TTL values
// Verify key patterns
```

### 3. Performance Optimization

Find slow Redis operations:

```typescript
// Sort by duration
// Identify complex operations (ZRANGE, HGETALL)
// Optimize data structures
```

### 4. Security Audit

Verify sensitive data handling:

```typescript
// Search for token/password keys
// Confirm masking is working
// Check for unexpected sensitive data storage
```

## Example Usage

### Basic Redis Operations

```typescript
// redis.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

@Injectable()
export class CacheService {
  constructor(
    @InjectRedis() private redis: Redis
  ) {}

  async cacheUser(userId: number, data: any) {
    // NestLens automatically tracks this SET command
    await this.redis.set(
      `user:${userId}`,
      JSON.stringify(data),
      'EX',
      3600  // 1 hour TTL
    );
  }

  async getUser(userId: number) {
    // NestLens tracks this GET command
    const data = await this.redis.get(`user:${userId}`);
    return data ? JSON.parse(data) : null;
  }

  async invalidateUser(userId: number) {
    // NestLens tracks this DEL command
    await this.redis.del(`user:${userId}`);
  }
}
```

### Session Management

```typescript
@Injectable()
export class SessionService {
  constructor(
    @InjectRedis() private redis: Redis
  ) {}

  async createSession(userId: number, token: string) {
    // Token key is automatically masked by NestLens
    await this.redis.setex(
      `session:token:${token}`,
      86400,  // 24 hours
      JSON.stringify({ userId, createdAt: new Date() })
    );
  }

  async getSession(token: string) {
    // Tracked and masked
    const data = await this.redis.get(`session:token:${token}`);
    return data ? JSON.parse(data) : null;
  }
}
```

### Rate Limiting

```typescript
@Injectable()
export class RateLimitService {
  constructor(
    @InjectRedis() private redis: Redis
  ) {}

  async checkRateLimit(ip: string, limit: number): Promise<boolean> {
    const key = `ratelimit:${ip}`;

    // NestLens tracks these Redis commands
    const current = await this.redis.incr(key);

    if (current === 1) {
      // First request, set expiration
      await this.redis.expire(key, 60); // 1 minute window
    }

    return current <= limit;
  }
}
```

## Best Practices

### 1. Use Descriptive Key Patterns

Make debugging easier:

```typescript
// Good
'user:123:profile'
'cache:product:456'
'session:token:abc'

// Bad
'u123'
'p456'
'sabc'
```

### 2. Ignore Health Check Commands

Reduce noise:

```typescript
redis: {
  ignoreCommands: ['ping', 'info'],
}
```

### 3. Monitor Sensitive Keys

Verify masking is working:
- Check dashboard for token/password keys
- Confirm values are masked
- Audit key naming patterns

### 4. Set Appropriate Result Size

Balance detail and performance:

```typescript
redis: {
  maxResultSize: 1024, // 1KB - good default
  // Increase for debugging: 10240 (10KB)
  // Decrease for production: 512 (512 bytes)
}
```

### 5. Track Slow Commands

Identify Redis bottlenecks:
- Sort by duration in dashboard
- Optimize slow operations
- Consider data structure changes

## Troubleshooting

### Commands Not Appearing

**Issue**: Redis commands not tracked

**Solutions**:

1. **Verify Redis Watcher Enabled**:
   ```typescript
   watchers: { redis: true }
   ```

2. **Check Client Injection**:
   ```typescript
   {
     provide: NESTLENS_REDIS_CLIENT,
     useExisting: RedisService,
   }
   ```

3. **Verify Client Type**:
   - Must be ioredis or compatible
   - Must have method interception support

### Data Not Masked

**Issue**: Sensitive data visible

**Solutions**:

1. **Check Key Pattern** - Must contain sensitive keywords
2. **Update Key Names** - Use patterns like `token:`, `secret:`
3. **Manual Masking** - Use custom filtering if needed

### Performance Impact

**Issue**: Redis slower with NestLens

**Solutions**:

1. **Minimal Overhead** - Typically < 0.1ms per command
2. **Ignore Commands** - Exclude high-frequency commands
3. **Increase Result Limit** - Only if needed for debugging

## Performance Considerations

Redis tracking overhead:

- **Per Command**: ~0.05-0.1ms
- **Memory**: Minimal (buffered entries)
- **Redis Impact**: None (no additional commands)

Production recommendations:
- Use `ignoreCommands` for high-frequency operations
- Set `maxResultSize` to 512-1024 bytes
- Monitor initial impact before full rollout

## Next Steps

- Learn about [Bull/BullMQ Integration](./bull-bullmq.md)
- Explore [Custom Integrations](./custom-integrations.md)
- Configure [Data Masking](/docs/security/data-masking.md)
