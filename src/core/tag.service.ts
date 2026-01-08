import { Inject, Injectable, Logger } from '@nestjs/common';
import { Entry, EntryType, MonitoredTag, TagWithCount } from '../types';
import { STORAGE, StorageInterface } from './storage/storage.interface';

/**
 * Service for managing tags and auto-tagging entries
 */
@Injectable()
export class TagService {
  private readonly logger = new Logger(TagService.name);

  constructor(
    @Inject(STORAGE)
    private readonly storage: StorageInterface,
  ) {}

  /**
   * Auto-tag an entry based on its content
   */
  async autoTag(entry: Entry): Promise<string[]> {
    const tags: string[] = [];

    switch (entry.type) {
      case 'request':
        this.addRequestTags(entry, tags);
        break;
      case 'query':
        this.addQueryTags(entry, tags);
        break;
      case 'exception':
        this.addExceptionTags(entry, tags);
        break;
      case 'log':
        this.addLogTags(entry, tags);
        break;
      case 'job':
        this.addJobTags(entry, tags);
        break;
      case 'cache':
        this.addCacheTags(entry, tags);
        break;
      case 'event':
        this.addEventTags(entry, tags);
        break;
      case 'schedule':
        this.addScheduleTags(entry, tags);
        break;
      case 'mail':
        this.addMailTags(entry, tags);
        break;
      case 'http-client':
        this.addHttpClientTags(entry, tags);
        break;
      case 'redis':
        this.addRedisTags(entry, tags);
        break;
      case 'model':
        this.addModelTags(entry, tags);
        break;
      case 'notification':
        this.addNotificationTags(entry, tags);
        break;
      case 'view':
        this.addViewTags(entry, tags);
        break;
      case 'command':
        this.addCommandTags(entry, tags);
        break;
      case 'gate':
        this.addGateTags(entry, tags);
        break;
      case 'batch':
        this.addBatchTags(entry, tags);
        break;
      case 'dump':
        this.addDumpTags(entry, tags);
        break;
    }

    // Add tags to storage if entry has an ID
    if (entry.id && tags.length > 0) {
      await this.storage.addTags(entry.id, tags);
    }

    return tags;
  }

  private addRequestTags(entry: Entry, tags: string[]): void {
    if (entry.type !== 'request') return;
    const payload = entry.payload;

    // Status code based tags
    if (payload.statusCode) {
      if (payload.statusCode >= 500) {
        tags.push('ERROR');
        tags.push('5XX');
      } else if (payload.statusCode >= 400) {
        tags.push('CLIENT-ERROR');
        tags.push('4XX');
      } else if (payload.statusCode >= 300) {
        tags.push('REDIRECT');
        tags.push('3XX');
      } else if (payload.statusCode >= 200) {
        tags.push('SUCCESS');
      }
    }

    // User tag
    if (payload.user?.id) {
      tags.push(`USER:${payload.user.id}`);
    }

    // Method tag - skip for GraphQL (shown in Method column as GRAPHQL)
    // Only add HTTP method tag for non-GraphQL requests
    if (payload.method && !(payload.path && payload.path.toLowerCase().includes('/graphql'))) {
      tags.push(payload.method.toUpperCase());
    }

    // Slow request (> 1000ms)
    if (payload.duration && payload.duration > 1000) {
      tags.push('SLOW');
    }

    // Custom tags from payload
    if (payload.tags && Array.isArray(payload.tags)) {
      tags.push(...payload.tags.map((t) => t.toUpperCase()));
    }
  }

  private addQueryTags(entry: Entry, tags: string[]): void {
    if (entry.type !== 'query') return;
    const payload = entry.payload;

    // Slow query tag
    if (payload.slow) {
      tags.push('SLOW');
    }

    // Source tag (just the source name)
    if (payload.source) {
      tags.push(payload.source.toUpperCase());
    }

    // Query type detection
    const query = payload.query.toLowerCase().trim();
    if (query.startsWith('select')) {
      tags.push('SELECT');
    } else if (query.startsWith('insert')) {
      tags.push('INSERT');
    } else if (query.startsWith('update')) {
      tags.push('UPDATE');
    } else if (query.startsWith('delete')) {
      tags.push('DELETE');
    }
  }

  private addExceptionTags(entry: Entry, tags: string[]): void {
    if (entry.type !== 'exception') return;
    const payload = entry.payload;

    tags.push('ERROR');

    // Exception type tag (only if it's not generic "Error")
    if (payload.name && payload.name !== 'Error') {
      tags.push(payload.name.toUpperCase());
    }

    // HTTP exception detection
    if (
      payload.name.includes('HttpException') ||
      payload.name.includes('BadRequest') ||
      payload.name.includes('Unauthorized') ||
      payload.name.includes('Forbidden') ||
      payload.name.includes('NotFound')
    ) {
      tags.push('HTTP-ERROR');
    }

    // Validation error detection
    if (
      payload.name.includes('Validation') ||
      payload.message.toLowerCase().includes('validation')
    ) {
      tags.push('VALIDATION-ERROR');
    }
  }

  private addLogTags(entry: Entry, tags: string[]): void {
    if (entry.type !== 'log') return;
    const payload = entry.payload;

    // Level tag (just the level)
    tags.push(payload.level.toUpperCase());

    // Error/warning tags
    if (payload.level === 'error') {
      tags.push('ERROR');
    } else if (payload.level === 'warn') {
      tags.push('WARNING');
    }

    // Context tag (just the context name)
    if (payload.context) {
      tags.push(payload.context.toUpperCase());
    }
  }

  private addJobTags(entry: Entry, tags: string[]): void {
    if (entry.type !== 'job') return;
    const payload = entry.payload;

    // Status tag (just the status)
    if (payload.status) {
      tags.push(payload.status.toUpperCase());
    }

    // Queue tag (just the queue name)
    if (payload.queue) {
      tags.push(payload.queue.toUpperCase());
    }

    // Failed job - add ERROR tag (FAILED already added via status)
    if (payload.status === 'failed') {
      tags.push('ERROR');
    }
  }

  private addCacheTags(entry: Entry, tags: string[]): void {
    if (entry.type !== 'cache') return;
    const payload = entry.payload;

    // Operation tag (just the operation)
    tags.push(payload.operation.toUpperCase());

    // Hit/miss tag
    if (payload.operation === 'get') {
      tags.push(payload.hit ? 'HIT' : 'MISS');
    }
  }

  private addEventTags(entry: Entry, tags: string[]): void {
    if (entry.type !== 'event') return;
    const payload = entry.payload;

    // Event name as tag (e.g., user.created -> USER.CREATED)
    if (payload.name) {
      tags.push(payload.name.toUpperCase());
    }

    // Multiple listeners tag
    if (payload.listeners && payload.listeners.length > 1) {
      tags.push('MULTI-LISTENER');
    }

    // Slow event (> 100ms)
    if (payload.duration && payload.duration > 100) {
      tags.push('SLOW');
    }
  }

  private addScheduleTags(entry: Entry, tags: string[]): void {
    if (entry.type !== 'schedule') return;
    const payload = entry.payload;

    // Status tag
    if (payload.status) {
      tags.push(payload.status.toUpperCase());
    }

    // Failed task - add ERROR tag (FAILED already added via status)
    if (payload.status === 'failed') {
      tags.push('ERROR');
    }

    // Schedule type
    if (payload.cron) {
      tags.push('CRON');
    } else if (payload.interval) {
      tags.push('INTERVAL');
    }

    // Slow task (> 1000ms)
    if (payload.duration && payload.duration > 1000) {
      tags.push('SLOW');
    }
  }

  private addMailTags(entry: Entry, tags: string[]): void {
    if (entry.type !== 'mail') return;
    const payload = entry.payload;

    // Status tag
    if (payload.status) {
      tags.push(payload.status.toUpperCase());
    }

    // Failed mail - add ERROR tag (FAILED already added via status)
    if (payload.status === 'failed') {
      tags.push('ERROR');
    }

    // Bulk mail (multiple recipients)
    const toCount = Array.isArray(payload.to) ? payload.to.length : 1;
    const ccCount = Array.isArray(payload.cc) ? payload.cc.length : payload.cc ? 1 : 0;
    const bccCount = Array.isArray(payload.bcc) ? payload.bcc.length : payload.bcc ? 1 : 0;

    if (toCount + ccCount + bccCount > 1) {
      tags.push('BULK');
    }

    // Has attachments or HTML
    if (payload.html) {
      tags.push('HTML');
    }
  }

  private addHttpClientTags(entry: Entry, tags: string[]): void {
    if (entry.type !== 'http-client') return;
    const payload = entry.payload;

    // Method tag
    if (payload.method) {
      tags.push(payload.method.toUpperCase());
    }

    // Status code based tags
    if (payload.statusCode) {
      if (payload.statusCode >= 500) {
        tags.push('ERROR');
        tags.push('5XX');
      } else if (payload.statusCode >= 400) {
        tags.push('CLIENT-ERROR');
        tags.push('4XX');
      } else if (payload.statusCode >= 300) {
        tags.push('REDIRECT');
        tags.push('3XX');
      } else if (payload.statusCode >= 200) {
        tags.push('SUCCESS');
      }
    }

    // Error tag if there's an error message
    if (payload.error) {
      tags.push('ERROR');
    }

    // Hostname tag (e.g., api.example.com -> API.EXAMPLE.COM)
    if (payload.hostname) {
      tags.push(payload.hostname.toUpperCase());
    }

    // Slow request (> 1000ms)
    if (payload.duration && payload.duration > 1000) {
      tags.push('SLOW');
    }
  }

  private addRedisTags(entry: Entry, tags: string[]): void {
    if (entry.type !== 'redis') return;
    const payload = entry.payload;

    // Tag by command type (GET, SET, DEL, LPUSH, etc.)
    if (payload.command) {
      tags.push(payload.command.toUpperCase());
    }

    // ERROR if failed
    if (payload.status === 'error' || payload.error) {
      tags.push('ERROR');
    }

    // SLOW if duration > 100ms
    if (payload.duration > 100) {
      tags.push('SLOW');
    }
  }

  private addModelTags(entry: Entry, tags: string[]): void {
    if (entry.type !== 'model') return;
    const payload = entry.payload;

    // Tag by entity name (uppercase)
    if (payload.entity) {
      tags.push(payload.entity.toUpperCase());
    }

    // Tag by action (FIND, CREATE, UPDATE, DELETE)
    if (payload.action) {
      tags.push(payload.action.toUpperCase());
    }

    // BULK if recordCount > 1
    if (payload.recordCount && payload.recordCount > 1) {
      tags.push('BULK');
    }

    // SLOW if duration > 500ms
    if (payload.duration > 500) {
      tags.push('SLOW');
    }

    // ERROR if failed
    if (payload.error) {
      tags.push('ERROR');
    }
  }

  private addNotificationTags(entry: Entry, tags: string[]): void {
    if (entry.type !== 'notification') return;
    const payload = entry.payload;

    // Tag by type (EMAIL, SMS, PUSH, SOCKET, WEBHOOK)
    if (payload.type) {
      tags.push(payload.type.toUpperCase());
    }

    // Tag by status (SENT, FAILED, PENDING)
    if (payload.status) {
      tags.push(payload.status.toUpperCase());
    }

    // ERROR if failed
    if (payload.status === 'failed') {
      tags.push('ERROR');
    }

    // BULK if multiple recipients
    const recipientCount = Array.isArray(payload.recipient) ? payload.recipient.length : 1;
    if (recipientCount > 1) {
      tags.push('BULK');
    }
  }

  private addViewTags(entry: Entry, tags: string[]): void {
    if (entry.type !== 'view') return;
    const payload = entry.payload;

    // Tag by template name (uppercase, sanitized)
    if (payload.template) {
      // Remove file extension and path separators
      const templateName = payload.template
        .replace(/\.(html|ejs|hbs|pug|jsx|tsx)$/i, '')
        .replace(/[\/\\]/g, '.')
        .toUpperCase();
      tags.push(templateName);
    }

    // Tag by format (HTML, JSON, XML, PDF)
    if (payload.format) {
      tags.push(payload.format.toUpperCase());
    }

    // CACHED if cacheHit
    if (payload.cacheHit) {
      tags.push('CACHED');
    }

    // SLOW if duration > 200ms
    if (payload.duration > 200) {
      tags.push('SLOW');
    }

    // ERROR if failed
    if (payload.status === 'error' || payload.error) {
      tags.push('ERROR');
    }
  }

  private addCommandTags(entry: Entry, tags: string[]): void {
    if (entry.type !== 'command') return;
    const payload = entry.payload;

    // Tag by command name (uppercase)
    if (payload.name) {
      tags.push(payload.name.toUpperCase());
    }

    // Tag by status (EXECUTING, COMPLETED, FAILED)
    if (payload.status) {
      tags.push(payload.status.toUpperCase());
    }

    // ERROR if failed
    if (payload.status === 'failed') {
      tags.push('ERROR');
    }

    // SLOW if duration > 1s
    if (payload.duration && payload.duration > 1000) {
      tags.push('SLOW');
    }
  }

  private addGateTags(entry: Entry, tags: string[]): void {
    if (entry.type !== 'gate') return;
    const payload = entry.payload;

    // ALLOWED or DENIED based on result
    tags.push(payload.allowed ? 'ALLOWED' : 'DENIED');

    // Tag by gate name (uppercase)
    if (payload.gate) {
      tags.push(payload.gate.toUpperCase());
    }
  }

  private addBatchTags(entry: Entry, tags: string[]): void {
    if (entry.type !== 'batch') return;
    const payload = entry.payload;

    // Tag by status (COMPLETED, PARTIAL, FAILED)
    if (payload.status) {
      tags.push(payload.status.toUpperCase());
    }

    // LARGE if totalItems > 1000
    if (payload.totalItems > 1000) {
      tags.push('LARGE');
    }

    // ERROR if failedItems > 0
    if (payload.failedItems > 0) {
      tags.push('ERROR');
    }
  }

  private addDumpTags(entry: Entry, tags: string[]): void {
    if (entry.type !== 'dump') return;
    const payload = entry.payload;

    // Tag by operation (EXPORT, IMPORT, BACKUP, RESTORE, MIGRATE)
    if (payload.operation) {
      tags.push(payload.operation.toUpperCase());
    }

    // Tag by format (SQL, JSON, CSV, BINARY)
    if (payload.format) {
      tags.push(payload.format.toUpperCase());
    }

    // COMPRESSED if compressed
    if (payload.compressed) {
      tags.push('COMPRESSED');
    }

    // ENCRYPTED if encrypted
    if (payload.encrypted) {
      tags.push('ENCRYPTED');
    }

    // ERROR if failed
    if (payload.status === 'failed' || payload.error) {
      tags.push('ERROR');
    }
  }

  // ==================== Tag Management ====================

  /**
   * Add tags to an entry
   */
  async addTags(entryId: number, tags: string[]): Promise<void> {
    await this.storage.addTags(entryId, tags);
  }

  /**
   * Remove tags from an entry
   */
  async removeTags(entryId: number, tags: string[]): Promise<void> {
    await this.storage.removeTags(entryId, tags);
  }

  /**
   * Get tags for an entry
   */
  async getEntryTags(entryId: number): Promise<string[]> {
    return this.storage.getEntryTags(entryId);
  }

  /**
   * Get all tags with counts
   */
  async getAllTags(): Promise<TagWithCount[]> {
    return this.storage.getAllTags();
  }

  /**
   * Find entries by tags
   */
  async findByTags(
    tags: string[],
    logic: 'AND' | 'OR' = 'OR',
    limit: number = 50,
  ): Promise<Entry[]> {
    return this.storage.findByTags(tags, logic, limit);
  }

  // ==================== Monitored Tags ====================

  /**
   * Add a monitored tag
   */
  async addMonitoredTag(tag: string): Promise<MonitoredTag> {
    return this.storage.addMonitoredTag(tag);
  }

  /**
   * Remove a monitored tag
   */
  async removeMonitoredTag(tag: string): Promise<void> {
    await this.storage.removeMonitoredTag(tag);
  }

  /**
   * Get all monitored tags
   */
  async getMonitoredTags(): Promise<MonitoredTag[]> {
    return this.storage.getMonitoredTags();
  }

  /**
   * Get monitored tags with their entry counts
   */
  async getMonitoredTagsWithCounts(): Promise<(MonitoredTag & { count: number })[]> {
    const monitoredTags = await this.storage.getMonitoredTags();
    const allTags = await this.storage.getAllTags();

    const tagCountMap = new Map(allTags.map((t) => [t.tag, t.count]));

    return monitoredTags.map((tag) => ({
      ...tag,
      count: tagCountMap.get(tag.tag) || 0,
    }));
  }
}
