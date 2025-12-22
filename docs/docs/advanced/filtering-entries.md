---
sidebar_position: 3
---

# Filtering Entries

Learn how to filter entries before they're collected to control what data NestLens stores.

## Overview

Entry filtering allows you to:
- Prevent sensitive data from being stored
- Reduce noise from high-frequency events
- Control storage size and costs
- Implement custom data retention policies
- Modify entries before storage

## Filter Function

Use the `filter` function to determine if an entry should be collected:

```typescript
NestLensModule.forRoot({
  filter: (entry: Entry) => {
    // Return true to collect, false to skip
    return shouldCollectEntry(entry);
  },
})
```

## Basic Filtering

### Filter by Entry Type

```typescript
NestLensModule.forRoot({
  filter: (entry) => {
    // Only collect exceptions and errors
    return entry.type === 'exception' ||
           (entry.type === 'log' && entry.payload.level === 'error');
  },
})
```

### Filter by Request Path

```typescript
NestLensModule.forRoot({
  filter: (entry) => {
    if (entry.type === 'request') {
      // Ignore health checks
      if (entry.payload.path === '/health') {
        return false;
      }

      // Ignore metrics endpoint
      if (entry.payload.path === '/metrics') {
        return false;
      }
    }

    return true;
  },
})
```

### Filter by Status Code

```typescript
NestLensModule.forRoot({
  filter: (entry) => {
    if (entry.type === 'request') {
      // Only track errors
      return entry.payload.statusCode >= 400;
    }

    return true;
  },
})
```

## Async Filtering

Perform async operations in filters:

```typescript
NestLensModule.forRoot({
  filter: async (entry) => {
    if (entry.type === 'request') {
      // Check if user should be tracked
      const user = entry.payload.user;
      if (user) {
        const shouldTrack = await userService.shouldTrackUser(user.id);
        return shouldTrack;
      }
    }

    return true;
  },
})
```

## Advanced Filtering Patterns

### Filter Sensitive Routes

```typescript
const SENSITIVE_ROUTES = [
  '/auth/login',
  '/auth/register',
  '/password/reset',
  '/payment/process',
  '/admin/secrets',
];

NestLensModule.forRoot({
  filter: (entry) => {
    if (entry.type === 'request') {
      return !SENSITIVE_ROUTES.some(route =>
        entry.payload.path.startsWith(route)
      );
    }

    return true;
  },
})
```

### Filter by Environment

```typescript
NestLensModule.forRoot({
  filter: (entry) => {
    // In production, only track errors
    if (process.env.NODE_ENV === 'production') {
      return entry.type === 'exception' ||
             (entry.type === 'request' && entry.payload.statusCode >= 500);
    }

    // In development, track everything
    return true;
  },
})
```

### Filter by User Role

```typescript
NestLensModule.forRoot({
  filter: (entry) => {
    if (entry.type === 'request') {
      const user = entry.payload.user;

      // Don't track admin requests
      if (user?.roles?.includes('admin')) {
        return false;
      }
    }

    return true;
  },
})
```

### Sample High-Frequency Events

```typescript
// Keep only 10% of successful requests
const sampleRate = 0.1;

NestLensModule.forRoot({
  filter: (entry) => {
    if (entry.type === 'request' && entry.payload.statusCode < 400) {
      return Math.random() < sampleRate;
    }

    // Always track errors
    return true;
  },
})
```

## Batch Filtering

Process multiple entries at once with `filterBatch`:

```typescript
NestLensModule.forRoot({
  filterBatch: (entries: Entry[]) => {
    // Remove duplicate queries
    const seenQueries = new Set<string>();

    return entries.filter(entry => {
      if (entry.type === 'query') {
        const key = entry.payload.query;

        if (seenQueries.has(key)) {
          return false; // Skip duplicate
        }

        seenQueries.add(key);
      }

      return true;
    });
  },
})
```

### Batch Filtering Patterns

#### Deduplicate Entries

```typescript
filterBatch: (entries) => {
  const unique = new Map<string, Entry>();

  for (const entry of entries) {
    // Create unique key based on type and content
    const key = entry.type === 'query'
      ? `${entry.type}:${entry.payload.query}`
      : `${entry.type}:${JSON.stringify(entry.payload)}`;

    // Keep first occurrence
    if (!unique.has(key)) {
      unique.set(key, entry);
    }
  }

  return Array.from(unique.values());
}
```

#### Limit Batch Size

```typescript
filterBatch: (entries) => {
  // Keep max 50 entries per batch
  const maxEntries = 50;

  if (entries.length <= maxEntries) {
    return entries;
  }

  // Prioritize errors
  const errors = entries.filter(e =>
    e.type === 'exception' ||
    (e.type === 'request' && e.payload.statusCode >= 500)
  );

  const others = entries.filter(e =>
    e.type !== 'exception' &&
    !(e.type === 'request' && e.payload.statusCode >= 500)
  );

  return [
    ...errors,
    ...others.slice(0, maxEntries - errors.length),
  ];
}
```

#### Aggregate Similar Entries

```typescript
filterBatch: (entries) => {
  // Group similar log messages
  const logGroups = new Map<string, Entry[]>();

  for (const entry of entries) {
    if (entry.type === 'log') {
      const baseMessage = entry.payload.message.split(':')[0];

      if (!logGroups.has(baseMessage)) {
        logGroups.set(baseMessage, []);
      }

      logGroups.get(baseMessage).push(entry);
    }
  }

  // Keep only first entry from each group
  const aggregated = Array.from(logGroups.values()).map(group => {
    const first = group[0];

    if (group.length > 1) {
      // Add count to metadata
      first.payload.metadata = {
        ...first.payload.metadata,
        occurrences: group.length,
      };
    }

    return first;
  });

  return [
    ...entries.filter(e => e.type !== 'log'),
    ...aggregated,
  ];
}
```

## Modifying Entries

Transform entries before storage:

### Mask Sensitive Data

```typescript
NestLensModule.forRoot({
  filter: (entry) => {
    if (entry.type === 'request' && entry.payload.body) {
      // Deep clone to avoid mutation
      const modifiedEntry = JSON.parse(JSON.stringify(entry));

      // Mask password
      if (modifiedEntry.payload.body.password) {
        modifiedEntry.payload.body.password = '***MASKED***';
      }

      // Mask credit card
      if (modifiedEntry.payload.body.creditCard) {
        modifiedEntry.payload.body.creditCard = '***MASKED***';
      }

      // Replace original entry
      Object.assign(entry, modifiedEntry);
    }

    return true;
  },
})
```

### Truncate Large Payloads

```typescript
NestLensModule.forRoot({
  filter: (entry) => {
    const maxSize = 10000; // 10KB

    if (entry.type === 'request') {
      const bodySize = JSON.stringify(entry.payload.body || '').length;

      if (bodySize > maxSize) {
        entry.payload.body = {
          _truncated: true,
          _originalSize: bodySize,
        };
      }
    }

    return true;
  },
})
```

### Enrich Entries

```typescript
NestLensModule.forRoot({
  filter: (entry) => {
    // Add custom metadata
    if (entry.type === 'request') {
      entry.payload.customMetadata = {
        environment: process.env.NODE_ENV,
        version: process.env.APP_VERSION,
        region: process.env.AWS_REGION,
      };
    }

    return true;
  },
})
```

## Performance Considerations

### Fail-Open Behavior

Filters are fail-open - if a filter throws an error, the entry is still collected:

```typescript
filter: (entry) => {
  try {
    // Your filtering logic
    return shouldCollect(entry);
  } catch (error) {
    // Error logged but entry still collected
    console.error('Filter error:', error);
    // No need to return - it will default to true
  }
}
```

### Optimize Filter Performance

```typescript
// BAD - Slow regex on every entry
filter: (entry) => {
  if (entry.type === 'request') {
    return !/^\/health|\/metrics|\/status/.test(entry.payload.path);
  }
  return true;
}

// GOOD - Fast string operations
const ignoredPaths = ['/health', '/metrics', '/status'];

filter: (entry) => {
  if (entry.type === 'request') {
    return !ignoredPaths.includes(entry.payload.path);
  }
  return true;
}
```

### Cache External Lookups

```typescript
// Cache user tracking settings
const userTrackingCache = new Map<string, boolean>();
const cacheTimeout = 5 * 60 * 1000; // 5 minutes

filter: async (entry) => {
  if (entry.type === 'request' && entry.payload.user) {
    const userId = entry.payload.user.id;
    const cached = userTrackingCache.get(userId);

    if (cached !== undefined) {
      return cached;
    }

    const shouldTrack = await checkUserTracking(userId);
    userTrackingCache.set(userId, shouldTrack);

    // Clear cache after timeout
    setTimeout(() => userTrackingCache.delete(userId), cacheTimeout);

    return shouldTrack;
  }

  return true;
}
```

## Real-World Examples

### E-Commerce Application

```typescript
NestLensModule.forRoot({
  filter: (entry) => {
    // Don't track product browsing (too noisy)
    if (entry.type === 'request' && entry.payload.path.startsWith('/products')) {
      return entry.payload.statusCode >= 400;
    }

    // Always track checkout and payment
    if (entry.type === 'request' &&
        (entry.payload.path.startsWith('/checkout') ||
         entry.payload.path.startsWith('/payment'))) {
      return true;
    }

    // Track all errors
    if (entry.type === 'exception') {
      return true;
    }

    // Sample other requests at 10%
    return Math.random() < 0.1;
  },
})
```

### SaaS Application

```typescript
NestLensModule.forRoot({
  filter: (entry) => {
    // Don't track internal service accounts
    if (entry.type === 'request' && entry.payload.user) {
      if (entry.payload.user.email?.endsWith('@internal.company.com')) {
        return false;
      }
    }

    // Only track paid users in production
    if (process.env.NODE_ENV === 'production' &&
        entry.type === 'request' &&
        entry.payload.user) {
      return entry.payload.user.plan !== 'free';
    }

    return true;
  },
})
```

### API Service

```typescript
NestLensModule.forRoot({
  filter: (entry) => {
    // Rate limit tracking per endpoint
    const rateLimits = new Map<string, number>();
    const maxPerMinute = 100;

    if (entry.type === 'request') {
      const endpoint = entry.payload.path;
      const count = rateLimits.get(endpoint) || 0;

      if (count >= maxPerMinute) {
        return false; // Skip if over limit
      }

      rateLimits.set(endpoint, count + 1);

      // Reset after 1 minute
      setTimeout(() => rateLimits.delete(endpoint), 60000);
    }

    return true;
  },
})
```

## Combining with Watcher Configuration

Use both watcher config and filters:

```typescript
NestLensModule.forRoot({
  watchers: {
    request: {
      enabled: true,
      ignorePaths: ['/health', '/metrics'], // Watcher-level ignore
    },
    query: {
      enabled: true,
      slowThreshold: 100,
    },
  },

  filter: (entry) => {
    // Additional entry-level filtering
    if (entry.type === 'query') {
      // Ignore SELECT queries under 10ms
      if (entry.payload.query.startsWith('SELECT') &&
          entry.payload.duration < 10) {
        return false;
      }
    }

    return true;
  },
})
```

## Best Practices

### 1. Start Permissive, Then Restrict

Begin by collecting everything, then add filters:

```typescript
// Phase 1: Collect everything
filter: (entry) => true

// Phase 2: Add filters based on observation
filter: (entry) => {
  // Filter out noisy endpoints you identified
}
```

### 2. Document Your Filters

```typescript
/**
 * Entry filter rules:
 * 1. Ignore health checks and metrics
 * 2. Ignore successful auth attempts (track failures only)
 * 3. Sample 10% of successful API calls
 * 4. Track all errors
 */
filter: (entry) => {
  // Implementation
}
```

### 3. Use Type Guards

```typescript
function isRequestEntry(entry: Entry): entry is RequestEntry {
  return entry.type === 'request';
}

filter: (entry) => {
  if (isRequestEntry(entry)) {
    // TypeScript knows entry.payload is RequestEntry['payload']
    return entry.payload.statusCode >= 400;
  }

  return true;
}
```

### 4. Test Your Filters

```typescript
describe('Entry Filter', () => {
  const filter = configureFilter();

  it('should filter health checks', () => {
    const entry: Entry = {
      type: 'request',
      payload: { path: '/health', ... },
    };

    expect(filter(entry)).toBe(false);
  });

  it('should keep error requests', () => {
    const entry: Entry = {
      type: 'request',
      payload: { statusCode: 500, ... },
    };

    expect(filter(entry)).toBe(true);
  });
});
```

### 5. Monitor Filter Effectiveness

```typescript
let totalEntries = 0;
let filteredEntries = 0;

filter: (entry) => {
  totalEntries++;
  const shouldCollect = applyFilterRules(entry);

  if (!shouldCollect) {
    filteredEntries++;
  }

  // Log stats periodically
  if (totalEntries % 1000 === 0) {
    console.log(`Filtered ${filteredEntries}/${totalEntries} entries`);
  }

  return shouldCollect;
}
```

## Next Steps

- Create [Custom Watchers](./custom-watchers.md)
- Implement [Custom Storage](./extending-storage.md)
- Optimize [Performance](./performance.md)
