---
sidebar_position: 5
---

# Production Usage

Best practices and recommendations for using NestLens safely in production environments.

## Running NestLens in production

This page used to open by telling you not to. That was the right advice when
the dashboard could only be mounted on the application's own server and the
only setting was *record everything* — and it is no longer what the package is.
A listener of its own, sampling, a failures-only preset, alerting, pruning,
masking and stack-trace sanitisation exist for one deployment: production.

### The shape that is safe

```typescript
NestLensModule.forRoot({
  preset: 'failures-only',
  // A socket of its own on a private interface, not a path on your public one.
  server: { host: process.env.NESTLENS_HOST, port: 3001 },
  storage: {
    driver: 'redis',
    redis: { url: process.env.REDIS_URL, db: 1 },
  },
  alerting: {
    enabled: true,
    webhooks: [{ url: process.env.ALERT_WEBHOOK, type: 'slack', events: 'failures' }],
  },
})
```

Four things are doing the work:

- **`preset: 'failures-only'`** records nothing that went right. Everything
  else on this page is about protecting data NestLens holds; this is about not
  holding it.
- **`server`** binds the dashboard to an address you choose. On a VPN address
  or a container network it is not merely protected from the internet but
  absent from it — see [Network isolation](./network-isolation.md).
- **A database of NestLens's own** keeps its entries out of the keyspace your
  application's cache lives in.
- **`events: 'failures'`** says what a pager is for without a filter to write.

### What it costs

Measured with `npm run benchmark:load` — 32 concurrent connections, the server
in a process of its own:

| | GET /ping | POST /order (2.5 KB body) | RSS at rest |
|---|---:|---:|---:|
| without NestLens | 34,573 req/s | 17,937 req/s | 126 MB |
| defaults (record everything) | 21,242 req/s | 14,732 req/s | 308 MB |
| `preset: 'failures-only'` | 24,475 req/s | 18,241 req/s | 182 MB |

`/ping` returns a constant and does nothing else, so it is the harshest case
there is: the overhead is the whole of the request. On the endpoint that does
some work the preset is within noise of not running NestLens at all, and it
stores nothing while nothing is failing.

Run the benchmark on your own hardware rather than trusting these figures on
somebody else's.

### When not to run it

Narrowly, and it is still true:

- **Mounted on the application's own server, recording everything, without
  authorization.** Anything that reaches your application then reaches the
  dashboard, and the dashboard holds request bodies and headers.
- **Where the data may not leave the process at all.** Masking reduces what is
  recorded; it does not make a store of request payloads into something else.
- **Where you cannot give it an address of its own and cannot put an
  authenticated proxy in front of it.**

Everything below is how to hold to that.

## Secure Production Configuration

If you must enable NestLens in production, use this configuration template:

```typescript
NestLensModule.forRoot({
  // Only enable when explicitly set
  enabled: process.env.NESTLENS_ENABLED === 'true',

  // Strict authorization
  authorization: {
    // Only production environment
    allowedEnvironments: ['production'],

    // IP whitelist
    allowedIps: process.env.NESTLENS_ALLOWED_IPS?.split(',') || [],

    // Strong authentication
    canAccess: async (req: Request) => {
      const token = req.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return false;
      }

      try {
        // Verify with auth service
        const user = await authService.verifyAdminToken(token);

        if (!user) {
          return false;
        }

        // Log access
        await auditLog.create({
          action: 'nestlens_access',
          userId: user.id,
          ip: req.ip,
          timestamp: new Date(),
        });

        return {
          id: user.id,
          email: user.email,
          roles: user.roles,
        };
      } catch (error) {
        logger.error('NestLens auth failed:', error);
        return false;
      }
    },

    // Require admin role
    requiredRoles: ['super-admin'],
  },

  // Minimal data capture
  watchers: {
    request: {
      enabled: true,
      captureBody: false,           // Never capture bodies
      captureResponse: false,        // Never capture responses
      captureSession: false,         // No session data
      ignorePaths: [
        '/health',
        '/metrics',
        '/auth/*',
      ],
    },
    query: {
      enabled: true,
      slowThreshold: 1000,          // Only very slow queries
      ignorePatterns: [
        /SELECT.*FROM.*system/,
      ],
    },
    exception: true,                // Track errors
    log: {
      enabled: true,
      minLevel: 'error',            // Only errors
    },
    // Disable everything else
    cache: false,
    event: false,
    job: false,
    schedule: false,
    mail: false,
    httpClient: false,
    redis: false,
    model: false,
    notification: false,
    view: false,
    command: false,
    gate: false,
    batch: false,
    dump: false,
  },

  // Aggressive pruning
  pruning: {
    enabled: true,
    maxAge: 1,                      // 1 hour retention
    interval: 15,                   // Prune every 15 minutes
  },

  // Filter sensitive data
  filter: (entry) => {
    // Don't track auth endpoints
    if (entry.type === 'request' &&
        entry.payload.path.startsWith('/auth/')) {
      return false;
    }

    // Don't track health checks
    if (entry.type === 'request' &&
        entry.payload.path === '/health') {
      return false;
    }

    return true;
  },
})
```

## Environment Variables

```bash
# .env.production
NESTLENS_ENABLED=false
NESTLENS_ALLOWED_IPS=192.168.1.100,192.168.1.101
NESTLENS_ADMIN_TOKEN=your-secure-token-here
```

## Temporary Activation Pattern

Enable NestLens temporarily for debugging:

### 1. Feature Flag Approach

```typescript
NestLensModule.forRoot({
  enabled: process.env.NESTLENS_ENABLED === 'true',
  // ... secure config
})
```

### 2. Enable via API

Create an admin endpoint to toggle NestLens:

```typescript
@Controller('admin')
export class AdminController {
  constructor(private collectorService: CollectorService) {}

  @Post('nestlens/enable')
  @UseGuards(AdminGuard)
  async enableNestLens(
    @Body() dto: { duration: number }
  ) {
    // Enable for X minutes
    this.collectorService.resume();

    // Auto-disable after duration
    setTimeout(() => {
      this.collectorService.pause('Auto-disabled after timeout');
    }, dto.duration * 60 * 1000);

    return { message: `NestLens enabled for ${dto.duration} minutes` };
  }

  @Post('nestlens/disable')
  @UseGuards(AdminGuard)
  async disableNestLens() {
    this.collectorService.pause('Manually disabled');
    return { message: 'NestLens disabled' };
  }
}
```

### 3. Time-Window Activation

Enable only during specific hours:

```typescript
NestLensModule.forRoot({
  enabled: (() => {
    if (process.env.NODE_ENV !== 'production') {
      return true;
    }

    const hour = new Date().getHours();
    const enabledHours = [2, 3, 4]; // 2 AM - 4 AM

    return enabledHours.includes(hour) &&
           process.env.NESTLENS_ENABLED === 'true';
  })(),
})
```

## Performance Considerations

### Monitor Resource Usage

Track NestLens impact:

```typescript
// Before enabling in production
console.log('Memory before:', process.memoryUsage());

// Monitor during operation
setInterval(() => {
  const usage = process.memoryUsage();
  if (usage.heapUsed > THRESHOLD) {
    logger.warn('High memory usage, consider disabling NestLens');
  }
}, 60000);
```

### Buffer Settings (Fixed)

The collector's `BUFFER_SIZE` (100) and `FLUSH_INTERVAL` (1000ms) are `private readonly` constants in `CollectorService`. They are **not** configurable through `NestLensModule.forRoot(...)`:

```typescript
// In CollectorService — hard-coded, not a config option
private readonly BUFFER_SIZE = 100;
private readonly FLUSH_INTERVAL = 1000; // 1 second
```

To change them you must subclass `CollectorService` and provide your subclass for the collector token; there is no configuration flag. See [Performance Optimization](/docs/advanced/performance.md#changing-buffer-behavior).

### Disable Expensive Watchers

Only track what you need:

```typescript
watchers: {
  request: true,      // Essential
  exception: true,    // Essential
  query: true,        // Important
  log: false,         // Disable if noisy
  // All others disabled
}
```

## Data Retention

### Aggressive Pruning

Keep data for minimal time:

```typescript
pruning: {
  enabled: true,
  maxAge: 1,          // 1 hour in production
  interval: 15,       // Prune every 15 minutes
}
```

### Manual Cleanup

Clear data regularly:

```typescript
@Cron('0 */6 * * *') // Every 6 hours
async cleanupNestLens() {
  if (process.env.NODE_ENV === 'production') {
    await this.storage.clear();
    logger.log('NestLens data cleared');
  }
}
```

## Security Checklist

Before enabling in production, verify:

- [ ] Strong authentication implemented
- [ ] IP whitelist configured
- [ ] Required roles set to admin-only
- [ ] Request body capture disabled
- [ ] Response capture disabled
- [ ] Session capture disabled
- [ ] Aggressive pruning enabled (1-2 hours max)
- [ ] Sensitive paths filtered
- [ ] Audit logging enabled
- [ ] Rate limiting configured
- [ ] HTTPS enforced
- [ ] Access logged to security system
- [ ] Auto-disable mechanism in place
- [ ] Team notified of activation
- [ ] Compliance requirements reviewed

## Monitoring and Alerts

### Log Access Attempts

```typescript
canAccess: async (req) => {
  const user = await authService.authenticate(req);

  // Log all access attempts
  await securityLog.create({
    event: 'nestlens_access_attempt',
    userId: user?.id,
    success: !!user,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    timestamp: new Date(),
  });

  return user;
}
```

### Set Up Alerts

Monitor for:
- Unauthorized access attempts
- High request volume
- Unusual access patterns
- Data extraction attempts

```typescript
// Example alert logic
if (failedAttempts > 5) {
  await alertService.send({
    severity: 'high',
    message: 'Multiple failed NestLens access attempts',
    ip: req.ip,
  });
}
```

## Incident Response Plan

### If NestLens is Compromised

1. **Immediate Actions**:
   ```bash
   # Disable immediately
   export NESTLENS_ENABLED=false
   # Restart application
   pm2 restart app
   ```

2. **Investigate**:
   - Review access logs
   - Check what data was accessed
   - Identify unauthorized users

3. **Remediate**:
   - Rotate admin tokens
   - Update IP whitelist
   - Review security configuration
   - Clear any sensitive data

4. **Prevent**:
   - Strengthen authentication
   - Add additional monitoring
   - Consider disabling permanently

## Alternative Approaches

### Dedicated Debug Environment

Instead of production, use a production-like environment:

```typescript
// production.config.ts
NestLensModule.forRoot({
  enabled: false,  // Never in production
})

// production-debug.config.ts
NestLensModule.forRoot({
  enabled: true,
  // All security measures
  // Debug-specific configuration
})
```

### Log-Based Debugging

Use enhanced logging instead:

```typescript
// Replace NestLens with structured logging
logger.debug('Request', {
  method: req.method,
  path: req.path,
  duration: requestDuration,
  statusCode: res.statusCode,
});
```

### APM Solutions

Consider dedicated APM tools for production:
- New Relic
- Datadog
- Application Insights
- Sentry

These are designed for production and have:
- Enterprise security
- Compliance certifications
- Better performance
- Advanced features

## Best Practices

### 1. Default to Disabled

```typescript
enabled: process.env.NODE_ENV !== 'production'
```

### 2. Require Explicit Activation

```typescript
enabled: process.env.NESTLENS_ENABLED === 'true' &&
         process.env.NODE_ENV === 'production' &&
         process.env.NESTLENS_ADMIN_APPROVED === 'true'
```

### 3. Time-Box Usage

```typescript
// Enable for 1 hour max
const enabledUntil = new Date(Date.now() + 3600000);
enabled: new Date() < enabledUntil
```

### 4. Audit Everything

```typescript
// Log all NestLens operations
middleware: (req, res, next) => {
  if (req.path.startsWith('/nestlens')) {
    auditLog.create({
      path: req.path,
      user: req.user,
      timestamp: new Date(),
    });
  }
  next();
}
```

### 5. Regular Security Reviews

- Weekly: Review access logs
- Monthly: Security audit
- Quarterly: Penetration testing
- Annually: Compliance review

## Conclusion

**Run it the shape at the top of this page**: `failures-only`, a listener of its
own on a private address, a database of its own, and alerting that names
failures. That configuration records nothing while nothing is wrong and is
within noise of not running it at all on an endpoint that does real work.

**Do not run it mounted on your public server, recording everything, without
authorization.** That is the case this page used to be about, and it is still a
bad idea.

**Alongside, not instead of**: an APM tool answers "how is the system
behaving"; NestLens answers "what exactly did this request do". Neither
replaces the other.

## Next Steps

- Review [Access Control](./access-control.md)
- Configure [IP Whitelisting](./ip-whitelisting.md)
- Implement [Data Masking](./data-masking.md)
