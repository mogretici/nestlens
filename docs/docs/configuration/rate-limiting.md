# Rate Limiting Configuration

NestLens includes built-in rate limiting to protect the dashboard and API endpoints from abuse and excessive requests. This ensures stable performance and prevents resource exhaustion.

## RateLimitConfig Interface

The rate limiting configuration provides controls for managing request rates:

```typescript
interface RateLimitConfig {
  windowMs?: number;      // Time window in milliseconds
  maxRequests?: number;   // Maximum requests per window per IP
}
```

## Configuration Options

### windowMs

Defines the time window (in milliseconds) for tracking request rates.

- **Type**: `number`
- **Default**: `60000` (1 minute)

```typescript
NestLensModule.forRoot({
  rateLimit: {
    windowMs: 60000, // 1 minute window
  },
});
```

Common time windows:

```typescript
// 30 seconds
NestLensModule.forRoot({
  rateLimit: {
    windowMs: 30 * 1000,
  },
});

// 1 minute (default)
NestLensModule.forRoot({
  rateLimit: {
    windowMs: 60 * 1000,
  },
});

// 5 minutes
NestLensModule.forRoot({
  rateLimit: {
    windowMs: 5 * 60 * 1000,
  },
});

// 15 minutes
NestLensModule.forRoot({
  rateLimit: {
    windowMs: 15 * 60 * 1000,
  },
});
```

### maxRequests

Sets the maximum number of requests allowed per IP address within the time window.

- **Type**: `number`
- **Default**: `100`

```typescript
NestLensModule.forRoot({
  rateLimit: {
    maxRequests: 100, // 100 requests per window
  },
});
```

Adjust based on your needs:

```typescript
// Restrictive (for production)
NestLensModule.forRoot({
  rateLimit: {
    windowMs: 60000,   // 1 minute
    maxRequests: 50,   // 50 requests/minute
  },
});

// Moderate (default)
NestLensModule.forRoot({
  rateLimit: {
    windowMs: 60000,   // 1 minute
    maxRequests: 100,  // 100 requests/minute
  },
});

// Permissive (for development)
NestLensModule.forRoot({
  rateLimit: {
    windowMs: 60000,   // 1 minute
    maxRequests: 500,  // 500 requests/minute
  },
});

// Very restrictive (public access)
NestLensModule.forRoot({
  rateLimit: {
    windowMs: 60000,   // 1 minute
    maxRequests: 20,   // 20 requests/minute
  },
});
```

## Disabling Rate Limiting

You can completely disable rate limiting by setting `rateLimit` to `false`:

```typescript
NestLensModule.forRoot({
  rateLimit: false, // No rate limiting
});
```

### When to Disable

Consider disabling rate limiting in these scenarios:

1. **Development environment**: No need for limits during development
2. **Internal network**: When behind a trusted firewall
3. **Custom rate limiting**: Using your own rate limiting middleware
4. **Load testing**: Testing dashboard performance

```typescript
// Disable in development only
NestLensModule.forRoot({
  rateLimit: process.env.NODE_ENV === 'development'
    ? false
    : { windowMs: 60000, maxRequests: 100 },
});
```

## Per-IP Tracking

Rate limiting is enforced on a **per-IP address** basis. Each unique IP address gets its own independent rate limit counter.

### How It Works

1. **IP Extraction**: The client's IP address is extracted from the request
2. **Counter Tracking**: A counter is maintained for each IP address
3. **Window Reset**: Counters reset after the configured `windowMs` period
4. **Limit Enforcement**: Requests exceeding `maxRequests` are rejected with 429 status

```typescript
// Example: 100 requests per minute per IP
NestLensModule.forRoot({
  rateLimit: {
    windowMs: 60000,
    maxRequests: 100,
  },
});

// Result:
// - IP 192.168.1.1 can make 100 requests/minute
// - IP 192.168.1.2 can make 100 requests/minute (independent counter)
// - IP 10.0.0.1 can make 100 requests/minute (independent counter)
```

### IP Address Detection

NestLens correctly identifies client IPs even behind proxies:

- Checks `X-Forwarded-For` header (when behind reverse proxy)
- Falls back to `req.ip` (direct connection)
- Uses the leftmost IP in `X-Forwarded-For` chain

### Rate Limit Response

When a client exceeds the rate limit, they receive:

**HTTP Status**: `429 Too Many Requests`

**Response Body**:
```json
{
  "statusCode": 429,
  "message": "Too many requests. Please try again later.",
  "retryAfter": 60
}
```

The `retryAfter` field indicates how many seconds until the rate limit resets.

## Configuration Examples

### Development Environment

No rate limiting for unrestricted development:

```typescript
NestLensModule.forRoot({
  rateLimit: false,
});
```

Or very permissive limits:

```typescript
NestLensModule.forRoot({
  rateLimit: {
    windowMs: 60000,
    maxRequests: 1000, // Very high limit
  },
});
```

### Production Environment

Balanced protection while allowing normal usage:

```typescript
NestLensModule.forRoot({
  rateLimit: {
    windowMs: 60000,   // 1 minute
    maxRequests: 100,  // 100 requests/minute
  },
});
```

### High-Security Environment

Strict limits for sensitive environments:

```typescript
NestLensModule.forRoot({
  rateLimit: {
    windowMs: 60000,   // 1 minute
    maxRequests: 30,   // 30 requests/minute
  },
});
```

### API-Heavy Dashboard

Higher limits for dashboards with frequent polling:

```typescript
NestLensModule.forRoot({
  rateLimit: {
    windowMs: 60000,   // 1 minute
    maxRequests: 300,  // 300 requests/minute
  },
});
```

### Shared Development Environment

Prevent one developer from monopolizing resources:

```typescript
NestLensModule.forRoot({
  rateLimit: {
    windowMs: 60000,   // 1 minute
    maxRequests: 200,  // 200 requests/minute per developer
  },
});
```

## Environment-Specific Configuration

```typescript
const rateLimitConfig = {
  development: false, // No limits in development

  test: false, // No limits in tests

  staging: {
    windowMs: 60000,
    maxRequests: 200, // Permissive for testing
  },

  production: {
    windowMs: 60000,
    maxRequests: 100, // Standard production limits
  },
};

NestLensModule.forRoot({
  rateLimit: rateLimitConfig[process.env.NODE_ENV] || rateLimitConfig.production,
});
```

## Best Practices

### 1. Match Limits to Dashboard Usage

Consider typical dashboard usage patterns:

```typescript
// Calculate based on polling frequency
const dashboardPollingIntervalSeconds = 5;
const safetyMultiplier = 3; // Allow 3x polling rate
const requestsPerMinute = (60 / dashboardPollingIntervalSeconds) * safetyMultiplier;

NestLensModule.forRoot({
  rateLimit: {
    windowMs: 60000,
    maxRequests: requestsPerMinute, // e.g., 36 for 5s polling
  },
});
```

### 2. Consider Multiple Users

Adjust limits if multiple users share the same IP:

```typescript
// Office with shared IP
NestLensModule.forRoot({
  rateLimit: {
    windowMs: 60000,
    maxRequests: 500, // Higher to accommodate multiple users
  },
});

// Individual users
NestLensModule.forRoot({
  rateLimit: {
    windowMs: 60000,
    maxRequests: 100, // Lower for individual access
  },
});
```

### 3. Monitor Rate Limit Hits

Log when rate limits are triggered:

```typescript
// In your application
app.use((req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode === 429) {
      logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    }
  });
  next();
});
```

### 4. Coordinate with Authorization

Combine with authorization for better security:

```typescript
NestLensModule.forRoot({
  // Strict rate limiting
  rateLimit: {
    windowMs: 60000,
    maxRequests: 50,
  },

  // Plus IP whitelist
  authorization: {
    allowedIps: ['10.0.1.*'],
  },
});
```

### 5. Progressive Limits by Environment

Gradually tighten limits as you move to production:

```typescript
const limits = {
  development: false,
  test: false,
  staging: { windowMs: 60000, maxRequests: 200 },
  production: { windowMs: 60000, maxRequests: 100 },
};

NestLensModule.forRoot({
  rateLimit: limits[process.env.NODE_ENV],
});
```

## Troubleshooting

### Users Hitting Rate Limits Frequently

If legitimate users are being rate-limited:

1. **Increase maxRequests**: Allow more requests per window
```typescript
NestLensModule.forRoot({
  rateLimit: {
    maxRequests: 200, // Increased from 100
  },
});
```

2. **Increase windowMs**: Use a longer time window
```typescript
NestLensModule.forRoot({
  rateLimit: {
    windowMs: 120000, // 2 minutes instead of 1
    maxRequests: 100,
  },
});
```

3. **Check dashboard polling**: Reduce auto-refresh frequency

### Rate Limiting Not Working

If rate limiting appears ineffective:

1. **Verify configuration**: Ensure `rateLimit` is not `false`
2. **Check proxy configuration**: Ensure IP detection works correctly
3. **Test directly**: Try from different IPs to verify per-IP tracking

### Behind Multiple Proxies

If behind multiple reverse proxies:

1. **Trust proxy setting**: Configure Express to trust proxy headers
```typescript
// In your main.ts
app.set('trust proxy', true);
```

2. **Verify X-Forwarded-For**: Check that the header contains the real client IP

## Performance Impact

Rate limiting has minimal performance impact:

- **Memory**: Small in-memory counter per IP address
- **CPU**: Simple counter increments
- **Storage**: No database operations

For most applications, rate limiting overhead is negligible.

## Next Steps

- [Authorization Configuration](./authorization.md) - Secure dashboard access
- [Basic Configuration](./basic-config.md) - General NestLens settings
- [Pruning Configuration](./pruning.md) - Data cleanup settings
