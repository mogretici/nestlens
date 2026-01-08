import { IsOptional, IsNumber, IsIn, IsArray, IsString, IsBoolean } from 'class-validator';
import {
  TransformLimit,
  TransformSequence,
  TransformCommaSeparatedArray,
  TransformCommaSeparatedNumbersOrErr,
  TransformStringToBoolean,
} from './transformers';
import { EntryType } from '../../types';

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
  @IsNumber()
  limit?: number;

  @IsOptional()
  @TransformSequence()
  @IsNumber()
  beforeSequence?: number;

  @IsOptional()
  @TransformSequence()
  @IsNumber()
  afterSequence?: number;

  // ==================== Log Filters ====================

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  levels?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  contexts?: string[];

  // ==================== Query Filters ====================

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  queryTypes?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  sources?: string[];

  @IsOptional()
  @TransformStringToBoolean()
  @IsBoolean()
  slow?: boolean;

  // ==================== Request/HTTP Filters ====================

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  methods?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  paths?: string[];

  @IsOptional()
  @TransformCommaSeparatedNumbersOrErr()
  @IsArray()
  statuses?: (number | 'ERR')[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  controllers?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  hostnames?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  ips?: string[];

  // ==================== Exception Filters ====================

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  names?: string[];

  @IsOptional()
  @TransformStringToBoolean()
  @IsBoolean()
  resolved?: boolean;

  // ==================== Event Filters ====================

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  eventNames?: string[];

  // ==================== Schedule Filters ====================

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  scheduleStatuses?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  scheduleNames?: string[];

  // ==================== Job Filters ====================

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  jobStatuses?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  jobNames?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  queues?: string[];

  // ==================== Cache Filters ====================

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  cacheOperations?: string[];

  // ==================== Mail Filters ====================

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  mailStatuses?: string[];

  // ==================== Redis Filters ====================

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  redisStatuses?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  redisCommands?: string[];

  // ==================== Model Filters ====================

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  modelActions?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  entities?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  modelSources?: string[];

  // ==================== Notification Filters ====================

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  notificationTypes?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  notificationStatuses?: string[];

  // ==================== View Filters ====================

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  viewFormats?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  viewStatuses?: string[];

  // ==================== Command Filters ====================

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  commandStatuses?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  commandNames?: string[];

  // ==================== Gate Filters ====================

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  gateNames?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  gateResults?: string[];

  // ==================== Batch Filters ====================

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  batchStatuses?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  batchOperations?: string[];

  // ==================== Dump Filters ====================

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  dumpStatuses?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  dumpOperations?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  dumpFormats?: string[];

  // ==================== GraphQL Filters ====================

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  operationTypes?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  operationNames?: string[];

  @IsOptional()
  @TransformStringToBoolean()
  @IsBoolean()
  hasErrors?: boolean;

  @IsOptional()
  @TransformStringToBoolean()
  @IsBoolean()
  hasN1?: boolean;

  // ==================== Common Filters ====================

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
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
    const filters: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(this)) {
      if (
        !CursorQueryDto.PAGINATION_KEYS.includes(key) &&
        value !== undefined &&
        typeof value !== 'function'
      ) {
        filters[key] = value;
      }
    }

    return Object.keys(filters).length > 0 ? filters : undefined;
  }
}
