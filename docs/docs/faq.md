---
sidebar_position: 100
---

# Frequently Asked Questions

Common questions and answers about NestLens.

## General

### Does NestLens work in production?

**Short answer**: It can, but it's not recommended by default.

NestLens is primarily designed for development and staging environments. If you need it in production:

1. **Use strict security**: Enable IP whitelisting, authentication, and role-based access
2. **Minimize data capture**: Disable body/response capture
3. **Aggressive pruning**: Keep data for 1-2 hours maximum
4. **Consider alternatives**: Use APM tools (New Relic, Datadog) for production monitoring

See [Production Usage](/docs/security/production-usage.md) for detailed guidance.

### How much does NestLens impact performance?

Typical overhead:
- **Request tracking**: 0.5-1ms per request
- **Query tracking**: 0.1-0.5ms per query
- **Memory**: Less than 50MB with default buffering
- **CPU**: Less than 2% in most applications

The impact is minimal in development but should be monitored in production. See [Performance Optimization](/docs/advanced/performance.md).

### Is my data secure?

NestLens includes multiple security features:

- **Environment restrictions**: Only runs in specific environments by default
- **IP whitelisting**: Restrict access to specific IPs
- **Authentication**: Custom auth functions
- **Data masking**: Automatic masking of sensitive headers and fields
- **Access control**: Role-based access control

See [Security](/docs/security/access-control.md) section for full details.

## Configuration

### How do I disable NestLens?

```typescript
// Disable completely
NestLensModule.forRoot({
  enabled: false,
})

// Disable in production only
NestLensModule.forRoot({
  enabled: process.env.NODE_ENV !== 'production',
})

// Remove the module entirely
@Module({
  imports: [
    // NestLensModule.forRoot(), // Comment out or remove
  ],
})
```

### How do I disable specific watchers?

```typescript
NestLensModule.forRoot({
  watchers: {
    request: true,      // Keep
    query: true,        // Keep
    exception: true,    // Keep
    log: false,         // Disable
    cache: false,       // Disable
    // Set any watcher to false to disable
  },
})
```

### Can I change the dashboard path?

```typescript
NestLensModule.forRoot({
  path: '/my-custom-path', // Default is '/nestlens'
})
```

Access at: `http://localhost:3000/my-custom-path`

### How do I configure TypeORM integration?

TypeORM integration is automatic - just install TypeORM and enable the query watcher:

```typescript
NestLensModule.forRoot({
  watchers: {
    query: true,
  },
})
```

No additional configuration needed. See [TypeORM Integration](/docs/integrations/typeorm.md).

### How do I configure Prisma integration?

Prisma requires manual setup:

```typescript
// 1. Enable query watcher
NestLensModule.forRoot({
  watchers: {
    query: true,
  },
})

// 2. Make Prisma client globally available
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
    (global as any).prisma = this;
  }
}
```

See [Prisma Integration](/docs/integrations/prisma.md).

## Data Management

### Can I use a different database?

Yes! Implement the `StorageInterface` to use any database:

```typescript
import { StorageInterface, STORAGE } from 'nestlens';

@Injectable()
export class MyCustomStorage implements StorageInterface {
  // Implement required methods
}

@Module({
  providers: [
    {
      provide: STORAGE,
      useClass: MyCustomStorage,
    },
  ],
})
```

See [Extending Storage](/docs/advanced/extending-storage.md).

### How do I export data?

Use the storage API:

```typescript
@Injectable()
export class ExportService {
  constructor(@Inject(STORAGE) private storage: StorageInterface) {}

  async exportAllEntries() {
    const entries = await this.storage.find({
      limit: 10000,
    });

    return entries;
  }
}
```

Or use the dashboard's export functionality (coming soon).

### How do I clear old entries?

NestLens automatically prunes old entries:

```typescript
NestLensModule.forRoot({
  pruning: {
    enabled: true,
    maxAge: 24,      // Hours (default: 24)
    interval: 60,    // Minutes (default: 60)
  },
})
```

Manual clearing:

```typescript
@Injectable()
export class CleanupService {
  constructor(@Inject(STORAGE) private storage: StorageInterface) {}

  async clearAll() {
    await this.storage.clear();
  }

  async clearOlderThan(hours: number) {
    const before = new Date(Date.now() - hours * 60 * 60 * 1000);
    await this.storage.prune(before);
  }
}
```

### Where is data stored?

NestLens supports three storage drivers:

| Driver | Location | Persistence |
|--------|----------|-------------|
| **Memory** (default) | RAM | Lost on restart |
| **SQLite** | `.cache/nestlens.db` | Persistent |
| **Redis** | Redis server | Persistent |

You can customize the storage:

```typescript
// In-memory (default)
NestLensModule.forRoot({})

// SQLite (requires: npm install better-sqlite3)
NestLensModule.forRoot({
  storage: {
    driver: 'sqlite',
    sqlite: { filename: '/var/data/nestlens.db' },
  },
})

// Redis (requires: npm install ioredis)
NestLensModule.forRoot({
  storage: {
    driver: 'redis',
    redis: { url: process.env.REDIS_URL },
  },
})
```

## Filtering

### How do I filter sensitive data?

Use the `filter` function:

```typescript
NestLensModule.forRoot({
  filter: (entry) => {
    // Don't track auth endpoints
    if (entry.type === 'request' &&
        entry.payload.path.startsWith('/auth/')) {
      return false;
    }

    // Mask passwords in request bodies
    if (entry.type === 'request' && entry.payload.body?.password) {
      entry.payload.body.password = '***MASKED***';
    }

    return true;
  },
})
```

See [Entry Filtering](/docs/advanced/filtering-entries.md) and [Data Masking](/docs/security/data-masking.md).

### How do I ignore specific routes?

```typescript
NestLensModule.forRoot({
  watchers: {
    request: {
      ignorePaths: [
        '/health',
        '/metrics',
        '/status',
      ],
    },
  },
})
```

Or use filtering:

```typescript
NestLensModule.forRoot({
  filter: (entry) => {
    if (entry.type === 'request') {
      const ignoredPaths = ['/health', '/metrics'];
      return !ignoredPaths.some(path =>
        entry.payload.path.startsWith(path)
      );
    }
    return true;
  },
})
```

### How do I track only errors?

```typescript
NestLensModule.forRoot({
  filter: (entry) => {
    // Only track exceptions
    if (entry.type === 'exception') {
      return true;
    }

    // Only track error requests
    if (entry.type === 'request') {
      return entry.payload.statusCode >= 400;
    }

    // Only track error logs
    if (entry.type === 'log') {
      return entry.payload.level === 'error';
    }

    // Skip everything else
    return false;
  },
})
```

## Dashboard

### Can I customize the dashboard?

The dashboard is served as a static React application. While you can't easily customize the UI, you can:

1. **Use custom path**: Change the dashboard URL
2. **Add custom authentication**: Control who can access
3. **Brand with reverse proxy**: Add your branding via nginx/Apache

Full customization requires forking the repository.

### How do I access the dashboard remotely?

1. **SSH Tunnel** (recommended):
   ```bash
   ssh -L 3000:localhost:3000 user@server
   ```
   Access at `http://localhost:3000/nestlens`

2. **VPN**: Connect to server's VPN
3. **IP Whitelist**: Add your IP to allowedIps
4. **Authentication**: Use custom auth with public access

Never expose the dashboard publicly without authentication!

### Can I embed the dashboard in my app?

Not directly, but you can:

1. **iframe**: Embed in an authenticated admin panel
   ```html
   <iframe src="/nestlens" width="100%" height="800px"></iframe>
   ```

2. **Reverse Proxy**: Serve under your domain
   ```nginx
   location /admin/monitoring {
     proxy_pass http://localhost:3000/nestlens;
   }
   ```

## Debugging

### Entries not appearing in dashboard

**Check these in order**:

1. **Is NestLens enabled?**
   ```typescript
   enabled: true
   ```

2. **Is the watcher enabled?**
   ```typescript
   watchers: { request: true }
   ```

3. **Are you accessing the correct path?**
   - Default: `http://localhost:3000/nestlens`
   - Check your `path` config

4. **Is data being collected?**
   ```typescript
   // Check storage directly
   const count = await storage.count();
   console.log('Total entries:', count);
   ```

5. **Are filters blocking entries?**
   - Temporarily remove filter function
   - Check filter logic

6. **Check browser console** for errors

### "Access Denied" error

1. **Check environment**:
   ```typescript
   allowedEnvironments: ['development', 'local', 'test']
   ```
   Make sure `NODE_ENV` matches

2. **Check IP whitelist**:
   ```typescript
   allowedIps: ['127.0.0.1', 'localhost']
   ```

3. **Check custom auth**:
   ```typescript
   canAccess: (req) => {
     console.log('Auth check:', req.headers);
     return true; // Test with always true
   }
   ```

4. **Check browser console and network tab** for specific error

### Slow performance

1. **Disable body/response capture**:
   ```typescript
   watchers: {
     request: {
       captureBody: false,
       captureResponse: false,
     },
   }
   ```

2. **Increase slow query threshold**:
   ```typescript
   watchers: {
     query: {
       slowThreshold: 1000, // 1 second
     },
   }
   ```

3. **Disable unused watchers**:
   ```typescript
   watchers: {
     log: false,
     cache: false,
     event: false,
   }
   ```

4. **Add filtering**:
   ```typescript
   filter: (entry) => {
     // Only track errors
     return entry.type === 'exception';
   }
   ```

5. **Check pruning is enabled**:
   ```typescript
   pruning: {
     enabled: true,
     maxAge: 1, // 1 hour
   }
   ```

See [Performance Optimization](/docs/advanced/performance.md).

## Integration Issues

### TypeORM queries not tracked

1. **Enable query watcher**:
   ```typescript
   watchers: { query: true }
   ```

2. **Verify TypeORM is installed**:
   ```bash
   npm list typeorm
   ```

3. **Check initialization order**: NestLens should be imported after TypeORM

4. **Check console logs** for "TypeORM query logging initialized"

### Prisma queries not tracked

1. **Enable query watcher**:
   ```typescript
   watchers: { query: true }
   ```

2. **Make Prisma client global**:
   ```typescript
   (global as any).prisma = this.prisma;
   ```

3. **Or use manual setup**:
   ```typescript
   const modelWatcher = this.moduleRef.get(ModelWatcher);
   modelWatcher.setupPrismaClient(this.prisma);
   ```

See [Prisma Integration](/docs/integrations/prisma.md).

### Bull/BullMQ jobs not tracked

1. **Enable job watcher**:
   ```typescript
   watchers: { job: true }
   ```

2. **Register your queues**:
   ```typescript
   this.jobWatcher.setupQueue(this.emailQueue, 'email');
   ```

See [Bull Integration](/docs/integrations/bull-bullmq.md).

### Redis commands not tracked

1. **Enable Redis watcher**:
   ```typescript
   watchers: { redis: true }
   ```

2. **Provide Redis client**:
   ```typescript
   {
     provide: NESTLENS_REDIS_CLIENT,
     useExisting: RedisService,
   }
   ```

See [Redis Integration](/docs/integrations/redis.md).

## Advanced

### Can I create custom entry types?

Not directly, but you can use existing types creatively:

```typescript
// Use 'event' type for custom events
collector.collect('event', {
  name: 'custom-business-event',
  payload: { /* your data */ },
  listeners: [],
  duration: 0,
});

// Use 'log' type for custom logs
collector.collect('log', {
  level: 'info',
  message: 'Custom metric',
  metadata: { /* your data */ },
});
```

### Can I send data to external services?

Yes, implement custom storage:

```typescript
@Injectable()
export class ExternalServiceStorage implements StorageInterface {
  async save(entry: Entry) {
    // Send to external service
    await this.http.post('https://api.example.com/events', entry);

    // Also save locally
    return this.localStorage.save(entry);
  }

  // Implement other methods...
}
```

See [Extending Storage](/docs/advanced/extending-storage.md).

### How do I add custom tags?

Use the TagService:

```typescript
@Injectable()
export class MyService {
  constructor(
    private collector: CollectorService,
    private tagService: TagService,
  ) {}

  async doSomething() {
    // Collect entry
    const entry = await this.collector.collectImmediate('event', {
      name: 'something-happened',
      payload: {},
      listeners: [],
      duration: 0,
    });

    // Add tags
    if (entry?.id) {
      await this.tagService.addTags(entry.id, ['important', 'business']);
    }
  }
}
```

### Can I access the API programmatically?

Yes, NestLens exposes a REST API:

```bash
# Get entries
GET /nestlens/__nestlens__/api/entries?type=request&limit=50

# Get specific entry
GET /nestlens/__nestlens__/api/entries/:id

# Get stats
GET /nestlens/__nestlens__/api/stats

# Get tags
GET /nestlens/__nestlens__/api/tags
```

All API endpoints require the same authentication as the dashboard.

## Support

### Where can I get help?

1. **Documentation**: Read the full docs at [NestLens Docs](/)
2. **GitHub Issues**: Report bugs or request features
3. **GitHub Discussions**: Ask questions and share ideas
4. **Stack Overflow**: Tag questions with `nestlens`

### How do I report a bug?

1. Check [GitHub Issues](https://github.com/mogretici/nestlens/issues) for existing reports
2. Create a new issue with:
   - NestLens version
   - NestJS version
   - Node version
   - Minimal reproduction example
   - Expected vs actual behavior
   - Error messages/logs

### How do I request a feature?

1. Check [GitHub Discussions](https://github.com/mogretici/nestlens/discussions)
2. Search for similar requests
3. Create a new discussion with:
   - Clear description of the feature
   - Use case / problem it solves
   - Example of how it would work
   - Willingness to contribute

### Can I contribute?

Yes! Contributions are welcome:

1. **Code**: Submit pull requests
2. **Documentation**: Improve docs
3. **Bug Reports**: Report issues
4. **Feature Ideas**: Suggest enhancements
5. **Testing**: Test beta features

See `CONTRIBUTING.md` in the repository.

## Next Steps

- [Getting Started](/docs/getting-started/installation.md)
- [Configuration](/docs/configuration/basic-config.md)
- [Dashboard Overview](/docs/dashboard/overview.md)
- [Security Best Practices](/docs/security/access-control.md)
