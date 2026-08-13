import { IsOptional, IsIn, IsString, MaxLength } from 'class-validator';
import {
  TransformLimit,
  TransformSequence,
  TransformCommaSeparatedArray,
  TransformCommaSeparatedNumbersOrErr,
  TransformStringToBoolean,
  IsCommaSeparatedStrings,
  IsCommaSeparatedList,
  IsBooleanLike,
  MAX_SEARCH_LENGTH,
} from './transformers';
import { EntryType } from '@/types';

const ENTRY_TYPES: EntryType[] = [
  'request',
  'query',
  'exception',
  'log',
  'cache',
  'event',
  'job',
  'schedule',
  'mail',
  'http-client',
  'redis',
  'model',
  'notification',
  'view',
  'command',
  'gate',
  'batch',
  'dump',
  'graphql',
];

/** Names that reach an object's prototype rather than its own properties. */
const UNSAFE_KEYS = ['__proto__', 'constructor', 'prototype'];

/**
 * Complete cursor query DTO that combines pagination with all filter types.
 * Replaces 50+ individual @Query parameters with a single typed DTO.
 */
export class CursorQueryDto {
  // ==================== Pagination ====================

  @IsOptional()
  @IsIn(ENTRY_TYPES)
  type?: EntryType;

  @IsOptional()
  @TransformLimit()
  limit?: number;

  @IsOptional()
  @TransformSequence()
  beforeSequence?: number;

  @IsOptional()
  @TransformSequence()
  afterSequence?: number;

  // ==================== Log Filters ====================

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  levels?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  contexts?: string[];

  // ==================== Query Filters ====================

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  queryTypes?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  sources?: string[];

  @IsOptional()
  @TransformStringToBoolean()
  @IsBooleanLike()
  slow?: boolean;

  // ==================== Request/HTTP Filters ====================

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  methods?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  paths?: string[];

  @IsOptional()
  @TransformCommaSeparatedNumbersOrErr()
  @IsCommaSeparatedList()
  statuses?: (number | 'ERR')[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  controllers?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  hostnames?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  ips?: string[];

  // ==================== Exception Filters ====================

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  names?: string[];

  @IsOptional()
  @TransformStringToBoolean()
  @IsBooleanLike()
  resolved?: boolean;

  // ==================== Event Filters ====================

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  eventNames?: string[];

  // ==================== Schedule Filters ====================

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  scheduleStatuses?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  scheduleNames?: string[];

  // ==================== Job Filters ====================

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  jobStatuses?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  jobNames?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  queues?: string[];

  // ==================== Cache Filters ====================

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  cacheOperations?: string[];

  // ==================== Mail Filters ====================

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  mailStatuses?: string[];

  // ==================== Redis Filters ====================

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  redisStatuses?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  redisCommands?: string[];

  // ==================== Model Filters ====================

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  modelActions?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  entities?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  modelSources?: string[];

  // ==================== Notification Filters ====================

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  notificationTypes?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  notificationStatuses?: string[];

  // ==================== View Filters ====================

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  viewFormats?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  viewStatuses?: string[];

  // ==================== Command Filters ====================

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  commandStatuses?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  commandNames?: string[];

  // ==================== Gate Filters ====================

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  gateNames?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  gateResults?: string[];

  // ==================== Batch Filters ====================

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  batchStatuses?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  batchOperations?: string[];

  // ==================== Dump Filters ====================

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  dumpStatuses?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  dumpOperations?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  dumpFormats?: string[];

  // ==================== GraphQL Filters ====================

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  operationTypes?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  operationNames?: string[];

  @IsOptional()
  @TransformStringToBoolean()
  @IsBooleanLike()
  hasErrors?: boolean;

  @IsOptional()
  @TransformStringToBoolean()
  @IsBooleanLike()
  hasN1?: boolean;

  // ==================== Common Filters ====================

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  tags?: string[];

  /**
   * Capped for the same reason the filter arrays are: every entry's payload is
   * stringified and searched, and `security.validation.maxSearchLength` was
   * documented while nothing enforced it.
   */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SEARCH_LENGTH)
  search?: string;

  // ==================== Helper Methods ====================

  /**
   * Keys that are pagination params (not filters)
   */
  private static readonly PAGINATION_KEYS = ['type', 'limit', 'beforeSequence', 'afterSequence'];

  /**
   * Convert DTO to the filters object expected by storage
   * Returns undefined if no filters are set
   */
  toFilters(): Record<string, unknown> | undefined {
    // Built without a prototype, and with the three names that reach one
    // refused outright. The validation pipe runs with `whitelist: true`, so a
    // query parameter the DTO does not declare is stripped before this runs —
    // but that is a setting in another file, and a key taken from a request and
    // written to an object should not depend on it.
    const filters = Object.create(null) as Record<string, unknown>;

    for (const [key, value] of Object.entries(this)) {
      if (
        !CursorQueryDto.PAGINATION_KEYS.includes(key) &&
        !UNSAFE_KEYS.includes(key) &&
        value !== undefined &&
        typeof value !== 'function'
      ) {
        filters[key] = value;
      }
    }

    return Object.keys(filters).length > 0 ? filters : undefined;
  }
}
