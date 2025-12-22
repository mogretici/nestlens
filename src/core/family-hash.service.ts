import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { Entry } from '../types';

/**
 * Service for generating family hashes to group similar entries
 *
 * Family hashes allow grouping similar exceptions, queries, etc.
 * to identify recurring issues and reduce noise in the dashboard.
 */
@Injectable()
export class FamilyHashService {
  private readonly logger = new Logger(FamilyHashService.name);

  /**
   * Generate a family hash for an entry
   * Returns undefined if no meaningful hash can be generated
   */
  generateFamilyHash(entry: Entry): string | undefined {
    switch (entry.type) {
      case 'exception':
        return this.hashException(entry);
      case 'query':
        return this.hashQuery(entry);
      case 'log':
        return this.hashLog(entry);
      case 'command':
        return this.hashCommand(entry);
      case 'gate':
        return this.hashGate(entry);
      case 'batch':
        return this.hashBatch(entry);
      default:
        return undefined;
    }
  }

  /**
   * Hash an exception based on name, file, and line number
   */
  private hashException(entry: Entry): string | undefined {
    if (entry.type !== 'exception') return undefined;
    const payload = entry.payload;

    // Extract file and line from stack trace
    const stackInfo = this.extractStackInfo(payload.stack);

    // Create hash from exception name + first stack frame location
    const hashInput = [
      payload.name,
      stackInfo?.file || '',
      stackInfo?.line || '',
      // Include message pattern (without specific values)
      this.normalizeErrorMessage(payload.message),
    ].join('|');

    return this.hash(hashInput);
  }

  /**
   * Hash a query based on normalized SQL
   */
  private hashQuery(entry: Entry): string | undefined {
    if (entry.type !== 'query') return undefined;
    const payload = entry.payload;

    // Normalize the SQL query
    const normalizedQuery = this.normalizeQuery(payload.query);

    const hashInput = [
      normalizedQuery,
      payload.source || '',
    ].join('|');

    return this.hash(hashInput);
  }

  /**
   * Hash a log entry based on context and message pattern
   */
  private hashLog(entry: Entry): string | undefined {
    if (entry.type !== 'log') return undefined;
    const payload = entry.payload;

    // Only hash error and warning logs
    if (payload.level !== 'error' && payload.level !== 'warn') {
      return undefined;
    }

    const normalizedMessage = this.normalizeErrorMessage(payload.message);

    const hashInput = [
      payload.level,
      payload.context || '',
      normalizedMessage,
    ].join('|');

    return this.hash(hashInput);
  }

  /**
   * Hash a command based on command name and handler
   */
  private hashCommand(entry: Entry): string | undefined {
    if (entry.type !== 'command') return undefined;
    const payload = entry.payload;

    // Normalize parameters by removing specific values
    const hashInput = [
      payload.name,
      payload.handler || '',
    ].join('|');

    return this.hash(hashInput);
  }

  /**
   * Hash a gate based on gate name, action, and subject type
   */
  private hashGate(entry: Entry): string | undefined {
    if (entry.type !== 'gate') return undefined;
    const payload = entry.payload;

    // Hash by gate + action + subject type (without specific IDs)
    const normalizedSubject = payload.subject ? this.normalizeSubject(payload.subject) : '';

    const hashInput = [
      payload.gate,
      payload.action,
      normalizedSubject,
    ].join('|');

    return this.hash(hashInput);
  }

  /**
   * Hash a batch operation based on name and operation
   */
  private hashBatch(entry: Entry): string | undefined {
    if (entry.type !== 'batch') return undefined;
    const payload = entry.payload;

    const hashInput = [
      payload.name,
      payload.operation,
    ].join('|');

    return this.hash(hashInput);
  }

  /**
   * Extract file and line information from stack trace
   */
  private extractStackInfo(stack?: string): { file: string; line: string } | undefined {
    if (!stack) return undefined;

    // Match common stack trace patterns
    // Node.js: at Function.name (/path/to/file.js:10:15)
    // or: at /path/to/file.js:10:15
    const patterns = [
      /at\s+(?:[^\s]+\s+)?\(?([^:]+):(\d+):\d+\)?/,
      /^\s+at\s+([^:]+):(\d+):\d+$/m,
    ];

    for (const pattern of patterns) {
      const match = stack.match(pattern);
      if (match) {
        return {
          file: this.normalizeFilePath(match[1]),
          line: match[2],
        };
      }
    }

    return undefined;
  }

  /**
   * Normalize file path to remove node_modules and project root
   */
  private normalizeFilePath(filePath: string): string {
    // Remove absolute path prefixes
    let normalized = filePath.replace(/^.*[\/\\](?=src[\/\\]|lib[\/\\]|dist[\/\\])/, '');

    // If still has node_modules, mark as external
    if (normalized.includes('node_modules')) {
      const match = normalized.match(/node_modules[\/\\]([^\/\\]+)/);
      return match ? `[node_modules]/${match[1]}` : '[external]';
    }

    return normalized;
  }

  /**
   * Normalize SQL query by removing specific values
   */
  private normalizeQuery(query: string): string {
    return query
      // Remove extra whitespace
      .replace(/\s+/g, ' ')
      .trim()
      // Replace string literals with placeholder
      .replace(/'[^']*'/g, '?')
      .replace(/"[^"]*"/g, '?')
      // Replace numeric literals with placeholder
      .replace(/\b\d+\b/g, '?')
      // Replace parameter placeholders ($1, $2, :param, @param)
      .replace(/\$\d+/g, '?')
      .replace(/:\w+/g, '?')
      .replace(/@\w+/g, '?')
      // Lowercase for consistency
      .toLowerCase();
  }

  /**
   * Normalize error message by removing specific values
   */
  private normalizeErrorMessage(message: string): string {
    return message
      // Remove UUIDs
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[UUID]')
      // Remove numbers
      .replace(/\b\d+\b/g, '[N]')
      // Remove email addresses
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
      // Remove URLs
      .replace(/https?:\/\/[^\s]+/g, '[URL]')
      // Remove file paths
      .replace(/[\/\\][\w\-\.\/\\]+\.\w+/g, '[PATH]')
      // Remove quoted strings
      .replace(/'[^']*'/g, '[STR]')
      .replace(/"[^"]*"/g, '[STR]')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Normalize subject by removing IDs and specific values
   */
  private normalizeSubject(subject: string): string {
    return subject
      // Remove UUIDs
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[ID]')
      // Remove numeric IDs
      .replace(/\b\d+\b/g, '[ID]')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Create SHA256 hash of input, truncated to 16 characters
   */
  private hash(input: string): string {
    return crypto
      .createHash('sha256')
      .update(input)
      .digest('hex')
      .substring(0, 16);
  }
}
