---
sidebar_position: 4
---

# Production Usage

Best practices and recommendations for using NestLens safely in production environments.

## Should You Use NestLens in Production?

### Recommended Approach

**Disable NestLens in production by default:**

```typescript
NestLensModule.forRoot({
  enabled: process.env.NODE_ENV !== 'production',
})
```

### When to Enable in Production

Consider enabling NestLens in production only if:

1. **Debugging Critical Issues** - Temporary activation to debug production problems
2. **Strict Security Controls** - Multiple layers of authentication and authorization
3. **Limited Time Windows** - Enable only when needed, disable after investigation
4. **Non-Sensitive Applications** - Internal tools without sensitive data
5. **Isolated Environments** - Production-like staging environment

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

### Optimize Buffer Settings

Reduce memory footprint:

```typescript
// In collector.service.ts configuration
private readonly BUFFER_SIZE = 50;      // Reduced from 100
private readonly FLUSH_INTERVAL = 500;  // More frequent flushes
```

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

**The safest approach**: Don't use NestLens in production.

**If you must**: Follow all security best practices, enable temporarily, and disable as soon as debugging is complete.

**Better alternatives**: Use production-ready APM tools or enhanced logging for production monitoring.

## Next Steps

- Review [Access Control](./access-control.md)
- Configure [IP Whitelisting](./ip-whitelisting.md)
- Implement [Data Masking](./data-masking.md)
