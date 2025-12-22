---
sidebar_position: 19
---

# Dump Watcher

The Dump Watcher tracks database dumps, exports, imports, backups, and migrations in your NestJS application, monitoring data transfer operations and their performance.

## What Gets Captured

- Operation type (export, import, backup, restore, migrate)
- Data format (SQL, JSON, CSV, binary)
- Source database/table
- Destination file/location
- Number of records
- File size
- Operation duration
- Operation status (completed, failed)
- Compression status
- Encryption status
- Error messages

## Configuration

```typescript
NestLensModule.forRoot({
  watchers: {
    dump: {
      enabled: true,
    },
  },
})
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable/disable dump tracking |

## Payload Structure

```typescript
interface DumpEntry {
  type: 'dump';
  payload: {
    operation: 'export' | 'import' | 'backup' | 'restore' | 'migrate';
    format: 'sql' | 'json' | 'csv' | 'binary';
    source?: string;            // Source database/table
    destination?: string;       // Destination file/path
    recordCount?: number;       // Number of records
    fileSize?: number;          // File size in bytes
    duration: number;           // Operation time (ms)
    status: 'completed' | 'failed';
    compressed?: boolean;       // Compression enabled
    encrypted?: boolean;        // Encryption enabled
    error?: string;             // Error message
  };
}
```

## Usage Example

### Manual Tracking

```typescript
import { DumpWatcher } from 'nestlens';

@Injectable()
export class DatabaseService {
  constructor(private dumpWatcher: DumpWatcher) {}

  async exportDatabase(format: 'sql' | 'json' | 'csv') {
    const startTime = Date.now();

    try {
      const data = await this.fetchAllData();
      const output = await this.formatData(data, format);
      const filePath = await this.writeFile(output, format);

      const duration = Date.now() - startTime;
      const fileSize = output.length;

      // Track export operation
      this.dumpWatcher.trackDump(
        'export',
        format,
        duration,
        'completed',
        {
          source: 'main_database',
          destination: filePath,
          recordCount: data.length,
          fileSize,
          compressed: false,
          encrypted: false,
        },
      );

      return filePath;
    } catch (error) {
      const duration = Date.now() - startTime;

      this.dumpWatcher.trackDump(
        'export',
        format,
        duration,
        'failed',
        {
          source: 'main_database',
          error: error.message,
        },
      );

      throw error;
    }
  }
}
```

### Database Backup

```typescript
@Injectable()
export class BackupService {
  async createBackup(): Promise<string> {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();
    const backupPath = `backups/backup-${timestamp}.sql`;

    try {
      // Create database dump
      const dump = await this.createDump();
      const compressed = await this.compress(dump);
      const encrypted = await this.encrypt(compressed);

      await this.saveToFile(backupPath, encrypted);

      const duration = Date.now() - startTime;

      this.dumpWatcher.trackDump(
        'backup',
        'sql',
        duration,
        'completed',
        {
          source: 'production_db',
          destination: backupPath,
          recordCount: dump.recordCount,
          fileSize: encrypted.length,
          compressed: true,
          encrypted: true,
        },
      );

      return backupPath;
    } catch (error) {
      this.dumpWatcher.trackDump(
        'backup',
        'sql',
        Date.now() - startTime,
        'failed',
        {
          source: 'production_db',
          destination: backupPath,
          error: error.message,
        },
      );

      throw error;
    }
  }

  async restoreBackup(backupPath: string): Promise<void> {
    const startTime = Date.now();

    try {
      const encrypted = await this.readFile(backupPath);
      const compressed = await this.decrypt(encrypted);
      const dump = await this.decompress(compressed);

      await this.restoreFromDump(dump);

      this.dumpWatcher.trackDump(
        'restore',
        'sql',
        Date.now() - startTime,
        'completed',
        {
          source: backupPath,
          destination: 'production_db',
          recordCount: dump.recordCount,
          compressed: true,
          encrypted: true,
        },
      );
    } catch (error) {
      this.dumpWatcher.trackDump(
        'restore',
        'sql',
        Date.now() - startTime,
        'failed',
        {
          source: backupPath,
          destination: 'production_db',
          error: error.message,
        },
      );

      throw error;
    }
  }
}
```

### Data Import

```typescript
@Injectable()
export class ImportService {
  async importCSV(filePath: string): Promise<void> {
    const startTime = Date.now();

    try {
      const csvData = await this.readFile(filePath);
      const records = await this.parseCSV(csvData);

      let imported = 0;
      for (const record of records) {
        await this.database.insert(record);
        imported++;
      }

      this.dumpWatcher.trackDump(
        'import',
        'csv',
        Date.now() - startTime,
        'completed',
        {
          source: filePath,
          destination: 'users_table',
          recordCount: imported,
          fileSize: csvData.length,
        },
      );
    } catch (error) {
      this.dumpWatcher.trackDump(
        'import',
        'csv',
        Date.now() - startTime,
        'failed',
        {
          source: filePath,
          destination: 'users_table',
          error: error.message,
        },
      );

      throw error;
    }
  }
}
```

### Database Migration

```typescript
@Injectable()
export class MigrationService {
  async migrateData(from: string, to: string): Promise<void> {
    const startTime = Date.now();

    try {
      const data = await this.extractData(from);
      await this.transformData(data);
      await this.loadData(to, data);

      this.dumpWatcher.trackDump(
        'migrate',
        'json',
        Date.now() - startTime,
        'completed',
        {
          source: from,
          destination: to,
          recordCount: data.length,
        },
      );
    } catch (error) {
      this.dumpWatcher.trackDump(
        'migrate',
        'json',
        Date.now() - startTime,
        'failed',
        {
          source: from,
          destination: to,
          error: error.message,
        },
      );

      throw error;
    }
  }
}
```

## Dashboard View

In the NestLens dashboard, dump entries show:

- Dump/backup operation timeline
- Success/failure rates
- Largest exports/imports
- Slowest operations
- Storage size trends
- Compression effectiveness
- Backup schedule compliance

## Operation Types

### Export
Export data from database to file:
```typescript
trackDump('export', 'json', duration, 'completed', {
  source: 'users_db',
  destination: 'exports/users.json',
});
```

### Import
Import data from file to database:
```typescript
trackDump('import', 'csv', duration, 'completed', {
  source: 'data/users.csv',
  destination: 'users_table',
});
```

### Backup
Create database backup:
```typescript
trackDump('backup', 'sql', duration, 'completed', {
  source: 'production_db',
  destination: 'backups/prod-2024-01-01.sql',
  compressed: true,
  encrypted: true,
});
```

### Restore
Restore from backup:
```typescript
trackDump('restore', 'sql', duration, 'completed', {
  source: 'backups/prod-2024-01-01.sql',
  destination: 'production_db',
});
```

### Migrate
Migrate data between systems:
```typescript
trackDump('migrate', 'json', duration, 'completed', {
  source: 'legacy_system',
  destination: 'new_system',
});
```

## Compression & Encryption

Track security features:

```typescript
const compressed = await gzip(data);
const encrypted = await encrypt(compressed);

trackDump('backup', 'sql', duration, 'completed', {
  compressed: true,  // Data was compressed
  encrypted: true,   // Data was encrypted
});
```

## Related Watchers

- [Batch Watcher](./batch) - Track bulk data processing
- [Model Watcher](./model) - Monitor database operations
- [Query Watcher](./query) - See underlying SQL queries
