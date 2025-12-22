# Pruning Configuration

NestLens includes automatic pruning functionality to prevent unbounded growth of monitoring data. This ensures your database doesn't grow indefinitely and helps maintain optimal performance.

## PruningConfig Interface

The pruning configuration allows you to control how and when old monitoring data is removed:

```typescript
interface PruningConfig {
  enabled?: boolean;   // Enable/disable automatic pruning
  maxAge?: number;     // Maximum age in hours
  interval?: number;   // Pruning interval in minutes
}
```

## Configuration Options

### enabled

Controls whether automatic pruning is active.

- **Type**: `boolean`
- **Default**: `true`

```typescript
NestLensModule.forRoot({
  pruning: {
    enabled: true, // Automatic pruning is active
  },
});
```

Disable pruning to keep all historical data:

```typescript
NestLensModule.forRoot({
  pruning: {
    enabled: false, // Keep all data indefinitely (not recommended)
  },
});
```

### maxAge

Defines the maximum age (in hours) for monitoring entries. Entries older than this will be deleted during pruning.

- **Type**: `number`
- **Default**: `24` (hours)

```typescript
NestLensModule.forRoot({
  pruning: {
    maxAge: 24, // Keep last 24 hours of data
  },
});
```

Common retention periods:

```typescript
// Keep last 6 hours (for high-traffic apps)
NestLensModule.forRoot({
  pruning: {
    maxAge: 6,
  },
});

// Keep last 48 hours (2 days)
NestLensModule.forRoot({
  pruning: {
    maxAge: 48,
  },
});

// Keep last week
NestLensModule.forRoot({
  pruning: {
    maxAge: 168, // 24 * 7 = 168 hours
  },
});

// Keep last 30 days
NestLensModule.forRoot({
  pruning: {
    maxAge: 720, // 24 * 30 = 720 hours
  },
});
```

### interval

Controls how frequently the pruning process runs (in minutes).

- **Type**: `number`
- **Default**: `60` (minutes)

```typescript
NestLensModule.forRoot({
  pruning: {
    interval: 60, // Run pruning every hour
  },
});
```

Adjust based on your data volume:

```typescript
// High-traffic app: Prune more frequently
NestLensModule.forRoot({
  pruning: {
    maxAge: 12,
    interval: 30, // Run every 30 minutes
  },
});

// Low-traffic app: Prune less frequently
NestLensModule.forRoot({
  pruning: {
    maxAge: 72,
    interval: 240, // Run every 4 hours
  },
});

// Development: Prune very frequently for testing
NestLensModule.forRoot({
  pruning: {
    maxAge: 1,
    interval: 15, // Run every 15 minutes
  },
});
```

## How Pruning Works

### Automatic Pruning Process

1. **Scheduled Execution**: Pruning runs automatically based on the `interval` setting
2. **Age Calculation**: Entries with `created_at` timestamps older than `maxAge` hours are identified
3. **Batch Deletion**: Old entries are deleted in batches for performance
4. **Database Optimization**: After deletion, the database can be optimized (see manual pruning)

### Pruning Query

NestLens executes a pruning query similar to:

```sql
DELETE FROM nestlens_entries WHERE created_at < ?
```

Where `?` is the ISO timestamp calculated from the current time minus `maxAge` hours.

## Configuration Examples

### Development Environment

Keep short retention for faster development cycles:

```typescript
NestLensModule.forRoot({
  pruning: {
    enabled: true,
    maxAge: 2,      // Keep last 2 hours
    interval: 15,   // Clean up every 15 minutes
  },
});
```

### Production Environment

Balance between data retention and storage:

```typescript
NestLensModule.forRoot({
  pruning: {
    enabled: true,
    maxAge: 48,     // Keep last 48 hours
    interval: 60,   // Clean up every hour
  },
});
```

### High-Traffic Application

Aggressive pruning to manage large data volumes:

```typescript
NestLensModule.forRoot({
  pruning: {
    enabled: true,
    maxAge: 6,      // Keep last 6 hours
    interval: 30,   // Clean up every 30 minutes
  },
});
```

### Debugging/Investigation Mode

Temporarily disable pruning when investigating issues:

```typescript
NestLensModule.forRoot({
  pruning: {
    enabled: false, // Disable while debugging
  },
});

// Or extend retention significantly
NestLensModule.forRoot({
  pruning: {
    enabled: true,
    maxAge: 168,    // Keep 1 week of data
    interval: 240,  // Clean up every 4 hours
  },
});
```

## Manual Pruning via API

In addition to automatic pruning, you can trigger pruning manually through the NestLens API.

### Trigger Manual Pruning

Send a POST request to the pruning endpoint:

```bash
# Prune using configured maxAge
curl -X POST http://localhost:3000/nestlens/__nestlens__/api/prune

# Prune with custom maxAge (in hours)
curl -X POST http://localhost:3000/nestlens/__nestlens__/api/prune \
  -H "Content-Type: application/json" \
  -d '{"maxAge": 12}'
```

### Using fetch in Browser/Node.js

```typescript
// Prune with default maxAge
const response = await fetch('http://localhost:3000/nestlens/__nestlens__/api/prune', {
  method: 'POST',
});

const result = await response.json();
console.log(`Deleted ${result.deletedCount} entries`);

// Prune with custom maxAge
const response = await fetch('http://localhost:3000/nestlens/__nestlens__/api/prune', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ maxAge: 12 }),
});
```

### Response Format

```typescript
{
  "success": true,
  "deletedCount": 15234,
  "message": "Pruned 15234 entries older than 12 hours"
}
```

### Use Cases for Manual Pruning

1. **Immediate cleanup**: Free up disk space immediately
2. **Custom retention**: Use different retention periods for specific scenarios
3. **Maintenance windows**: Schedule manual pruning during low-traffic periods
4. **Testing**: Verify pruning behavior before enabling automatic pruning

## Best Practices

### 1. Choose Appropriate Retention

Balance between debugging needs and storage constraints:

```typescript
// Consider your debugging workflow
const retentionHours = {
  development: 4,      // Quick iterations
  staging: 24,         // Daily testing cycles
  production: 48,      // Multi-day investigations
  highTraffic: 12,     // Storage constraints
};

NestLensModule.forRoot({
  pruning: {
    maxAge: retentionHours[process.env.NODE_ENV] || 24,
  },
});
```

### 2. Match Interval to Data Volume

Adjust pruning frequency based on entry creation rate:

```typescript
// Estimate: ~1000 requests/hour = ~1000 entries/hour (minimum)
const estimatedEntriesPerHour = 1000;
const targetMaxEntries = 50000;

const optimalMaxAge = Math.floor(targetMaxEntries / estimatedEntriesPerHour);

NestLensModule.forRoot({
  pruning: {
    maxAge: optimalMaxAge,
    interval: 60, // Adjust based on growth rate
  },
});
```

### 3. Monitor Database Size

Track database growth to optimize pruning settings:

```bash
# Check database file size
ls -lh .cache/nestlens.db

# Monitor over time
watch -n 300 ls -lh .cache/nestlens.db
```

### 4. Coordinate with Backups

If backing up NestLens data, coordinate pruning with your backup schedule:

```typescript
NestLensModule.forRoot({
  pruning: {
    enabled: true,
    maxAge: 168,    // Keep 1 week (enough for weekly backups)
    interval: 360,  // Run every 6 hours (after backup window)
  },
});
```

### 5. Emergency Cleanup

For immediate space reclamation:

```bash
# 1. Manual API pruning with aggressive maxAge
curl -X POST http://localhost:3000/nestlens/__nestlens__/api/prune \
  -H "Content-Type: application/json" \
  -d '{"maxAge": 1}'

# 2. SQLite vacuum to reclaim space
sqlite3 .cache/nestlens.db "VACUUM;"

# 3. Check new size
ls -lh .cache/nestlens.db
```

## Performance Considerations

### Large Databases

For databases with millions of entries:

1. **Use smaller intervals**: Prevent large batch deletions
```typescript
NestLensModule.forRoot({
  pruning: {
    maxAge: 24,
    interval: 30, // More frequent, smaller batches
  },
});
```

2. **Monitor pruning duration**: Ensure pruning completes within the interval
3. **Consider database maintenance**: Regular VACUUM operations

### Impact on Application

Pruning is designed to have minimal impact:

- Runs asynchronously in the background
- Uses indexed queries for efficient deletion
- SQLite WAL mode allows concurrent reads during pruning

## Troubleshooting

### Pruning Not Running

Check these common issues:

1. **Pruning disabled**: Verify `enabled: true`
2. **Application restart**: Pruning starts after application initialization
3. **Check logs**: Look for pruning execution in application logs

### Database Still Growing

If the database continues to grow:

1. **Reduce maxAge**: Shorter retention period
2. **Increase interval frequency**: More frequent cleanup
3. **Check entry rate**: Monitor how many entries are created
4. **Vacuum database**: Reclaim deleted space
5. **Review watchers**: Disable unnecessary watchers

### Pruning Too Aggressive

If losing important data:

1. **Increase maxAge**: Longer retention
2. **Export data before pruning**: Manual backup before aggressive pruning
3. **Disable temporarily**: Turn off pruning while investigating

## Environment-Specific Configurations

```typescript
const pruningConfig = {
  development: {
    enabled: true,
    maxAge: 4,
    interval: 30,
  },
  test: {
    enabled: true,
    maxAge: 1,
    interval: 15,
  },
  staging: {
    enabled: true,
    maxAge: 24,
    interval: 60,
  },
  production: {
    enabled: true,
    maxAge: 48,
    interval: 60,
  },
};

NestLensModule.forRoot({
  pruning: pruningConfig[process.env.NODE_ENV] || pruningConfig.development,
});
```

## Next Steps

- [Storage Configuration](./storage.md) - Database and storage options
- [Basic Configuration](./basic-config.md) - General NestLens settings
- [Rate Limiting Configuration](./rate-limiting.md) - API protection
