# Storage Configuration

NestLens uses a storage backend to persist monitoring data collected by watchers. This guide covers storage configuration options and database details.

## StorageConfig Interface

The storage configuration interface allows you to customize how NestLens stores monitoring data:

```typescript
interface StorageConfig {
  type?: 'sqlite';    // Storage type (only option currently)
  filename?: string;  // Database filename
}
```

## SQLite Storage

NestLens currently uses SQLite as its storage backend. SQLite provides a lightweight, serverless, and zero-configuration database solution that's perfect for development and monitoring purposes.

### Configuration

```typescript
NestLensModule.forRoot({
  storage: {
    type: 'sqlite',
    filename: '.cache/nestlens.db',
  },
});
```

### filename Option

Specifies the database file location.

- **Type**: `string`
- **Default**: `'.cache/nestlens.db'`

NestLens automatically creates the directory if it doesn't exist.

The filename can be:

1. **Default location**: Stored in `.cache/` directory (recommended)
```typescript
NestLensModule.forRoot({
  storage: {
    filename: '.cache/nestlens.db', // Default - hidden in .cache folder
  },
});
```

2. **Absolute path**: Stored at a specific location
```typescript
NestLensModule.forRoot({
  storage: {
    filename: '/var/lib/myapp/nestlens.db',
  },
});
```

3. **Custom directory**: Organized with other data files
```typescript
NestLensModule.forRoot({
  storage: {
    filename: './data/monitoring/nestlens.db',
  },
});
```

4. **Environment-specific**: Different databases per environment
```typescript
NestLensModule.forRoot({
  storage: {
    filename: `nestlens-${process.env.NODE_ENV}.db`,
  },
});
```

## Database Schema Overview

NestLens creates three tables to store monitoring data:

### nestlens_entries Table

The main table that stores all monitoring entries:

```sql
CREATE TABLE IF NOT EXISTS nestlens_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,  -- Unique entry identifier
  type TEXT NOT NULL,                     -- Entry type (request, query, exception, etc.)
  request_id TEXT,                        -- Request correlation ID
  payload TEXT NOT NULL,                  -- JSON-encoded entry data
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Added via migrations:
-- family_hash TEXT                       -- Hash for grouping similar entries
-- resolved_at TEXT                       -- Resolution timestamp (nullable)

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_nestlens_type ON nestlens_entries(type);
CREATE INDEX IF NOT EXISTS idx_nestlens_request_id ON nestlens_entries(request_id);
CREATE INDEX IF NOT EXISTS idx_nestlens_created_at ON nestlens_entries(created_at);
CREATE INDEX IF NOT EXISTS idx_nestlens_family_hash ON nestlens_entries(family_hash);
```

### nestlens_tags Table

Tags are stored in a separate table for normalized storage:

```sql
CREATE TABLE IF NOT EXISTS nestlens_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL,
  tag TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (entry_id) REFERENCES nestlens_entries(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_nestlens_tags_entry_id ON nestlens_tags(entry_id);
CREATE INDEX IF NOT EXISTS idx_nestlens_tags_tag ON nestlens_tags(tag);
```

### nestlens_monitored_tags Table

Stores tags that are being monitored/watched:

```sql
CREATE TABLE IF NOT EXISTS nestlens_monitored_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tag TEXT NOT NULL UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### Field Descriptions

**nestlens_entries:**
- **id**: Auto-incrementing primary key
- **type**: The type of entry (`request`, `query`, `exception`, `log`, `cache`, `event`, etc.)
- **request_id**: Correlates entries to their originating HTTP request
- **payload**: JSON-encoded data specific to the entry type
- **created_at**: Timestamp when the entry was created
- **family_hash**: Groups entries by similar characteristics (added via migration)
- **resolved_at**: Timestamp when the entry was marked as resolved (added via migration)

**nestlens_tags:**
- **entry_id**: Foreign key to nestlens_entries
- **tag**: The tag string
- **created_at**: When the tag was added

### Example Payload Structures

Different entry types store different payload structures:

**Request Entry Payload:**
```json
{
  "method": "GET",
  "url": "http://localhost:3000/api/users",
  "path": "/api/users",
  "statusCode": 200,
  "duration": 45,
  "ip": "127.0.0.1",
  "userAgent": "Mozilla/5.0...",
  "headers": {"content-type": "application/json"},
  "query": {"page": "1"},
  "body": null,
  "responseBody": {"users": []},
  "controllerAction": "UserController.findAll"
}
```

**Query Entry Payload:**
```json
{
  "query": "SELECT * FROM users WHERE id = $1",
  "parameters": [123],
  "duration": 12,
  "slow": false,
  "source": "typeorm",
  "connection": "default"
}
```

**Exception Entry Payload:**
```json
{
  "name": "BadRequestException",
  "message": "Invalid input",
  "stack": "Error: Invalid input\n    at UserController.create...",
  "code": 400,
  "context": "HTTP",
  "request": {
    "method": "POST",
    "url": "/api/users"
  }
}
```

## WAL Mode Benefits

NestLens configures SQLite to use Write-Ahead Logging (WAL) mode by default. WAL mode provides several benefits:

### 1. Better Concurrency

WAL allows readers and writers to work simultaneously without blocking each other. This means:
- Your application can query NestLens data while new entries are being written
- The dashboard can be accessed without impacting your application's performance
- Multiple readers can access the database concurrently

```typescript
// WAL mode is automatically enabled - no configuration needed
NestLensModule.forRoot({
  storage: {
    type: 'sqlite',
    filename: '.cache/nestlens.db', // WAL mode enabled automatically
  },
});
```

### 2. Improved Performance

Write operations are faster in WAL mode:
- Writes are appended to a log file instead of modifying the main database
- Reduces I/O operations and disk seeks
- Better performance for high-frequency monitoring data

### 3. Crash Recovery

WAL mode provides better crash recovery:
- Changes are atomic and durable
- Database corruption is less likely
- Automatic checkpoint mechanism ensures data integrity

### 4. WAL Files

When using WAL mode, you'll see additional files alongside your database:

```
.cache/nestlens.db           # Main database file
.cache/nestlens.db-wal       # Write-ahead log
.cache/nestlens.db-shm       # Shared memory file
```

These files are managed automatically by SQLite. Don't delete them while your application is running.

## Storage Best Practices

### 1. Database Location

Choose an appropriate location for your database:

```typescript
// Development: Use default .cache directory (recommended)
NestLensModule.forRoot({
  storage: {
    filename: '.cache/nestlens.db',
  },
});

// Production: Use dedicated data directory
NestLensModule.forRoot({
  storage: {
    filename: '/var/lib/myapp/nestlens.db',
  },
});

// Docker: Use volume mount
NestLensModule.forRoot({
  storage: {
    filename: '/app/data/nestlens.db', // Map /app/data to a volume
  },
});
```

### 2. Disk Space Management

Monitor disk space usage, especially in production:

- Enable pruning to automatically remove old entries (see [Pruning Configuration](./pruning.md))
- Monitor database file size
- Consider disk space when setting `pruning.maxAge`

```typescript
NestLensModule.forRoot({
  storage: {
    filename: '.cache/nestlens.db',
  },
  pruning: {
    enabled: true,
    maxAge: 24, // Keep only 24 hours of data
    interval: 60, // Clean up every hour
  },
});
```

### 3. Backup Strategy

For production environments, implement regular backups:

```bash
# Simple file copy (when application is stopped)
cp .cache/nestlens.db .cache/nestlens.db.backup

# SQLite backup command (can run while application is running)
sqlite3 .cache/nestlens.db ".backup .cache/nestlens.db.backup"

# Automated backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
sqlite3 .cache/nestlens.db ".backup /backups/nestlens_${DATE}.db"
```

### 4. Version Control

Add database files to `.gitignore`:

```gitignore
# NestLens database files (default location)
.cache/

# Or if using custom location
nestlens.db
nestlens.db-wal
nestlens.db-shm
nestlens-*.db
```

### 5. Performance Considerations

For high-traffic applications:

- Ensure adequate disk I/O performance
- Use SSD storage for better performance
- Monitor database file size growth
- Adjust pruning settings to match your traffic patterns

```typescript
// High-traffic configuration
NestLensModule.forRoot({
  storage: {
    filename: '/fast-ssd/nestlens.db',
  },
  pruning: {
    enabled: true,
    maxAge: 12, // Shorter retention for high-volume apps
    interval: 30, // More frequent cleanup
  },
  watchers: {
    request: {
      enabled: true,
      maxBodySize: 1024, // Smaller body capture to reduce storage
    },
  },
});
```

## Database Maintenance

### Manual Vacuum

Periodically vacuum the database to reclaim space (especially after pruning):

```bash
sqlite3 .cache/nestlens.db "VACUUM;"
```

### Check Database Integrity

Verify database integrity:

```bash
sqlite3 .cache/nestlens.db "PRAGMA integrity_check;"
```

### View Database Statistics

Check database size and page count:

```bash
sqlite3 .cache/nestlens.db "PRAGMA page_count; PRAGMA page_size;"
```

## Troubleshooting

### Database Locked Errors

If you encounter "database is locked" errors:

1. Ensure WAL mode is enabled (it's automatic)
2. Check file permissions
3. Verify no other processes are holding locks
4. Increase SQLite busy timeout (handled automatically by NestLens)

### File Permission Issues

Ensure your application has write permissions:

```bash
# Check permissions
ls -l .cache/nestlens.db

# Fix permissions (adjust as needed)
chmod 664 .cache/nestlens.db
chown myapp:myapp .cache/nestlens.db
```

### Disk Space Issues

If running out of disk space:

1. Enable or reduce `pruning.maxAge`
2. Manually prune old data via API
3. Vacuum the database
4. Disable verbose watchers temporarily

## Future Storage Options

NestLens currently supports only SQLite, but future versions may include:

- PostgreSQL for distributed deployments
- MySQL/MariaDB support
- In-memory storage for testing
- Custom storage adapters

## Next Steps

- [Pruning Configuration](./pruning.md) - Automatic data cleanup
- [Basic Configuration](./basic-config.md) - General NestLens settings
- [Rate Limiting Configuration](./rate-limiting.md) - API protection
