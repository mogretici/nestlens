import { IsInt, IsISO8601, IsOptional, IsIn, IsString, MaxLength, Min } from 'class-validator';
import {
  TransformLimit,
  TransformSequence,
  TransformCommaSeparatedArray,
  TransformCommaSeparatedNumbersOrErr,
  TransformStringToBoolean,
  TransformToInt,
  IsCommaSeparatedStrings,
  IsCommaSeparatedList,
  IsBooleanLike,
  MAX_SEARCH_LENGTH,
} from './transformers';
import { ENTRY_TYPES } from './entry-types';
import { EntryType } from '@/types';

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

  // ==================== The window ====================

  /**
   * The instants an entry has to fall between.
   *
   * The dashboard could not narrow by time at all: this endpoint is what every
   * list is paged through, and it took no window, so "what happened at 14:03"
   * had no answer. `entries`, `requests` and `exceptions` accepted `from` and
   * `to` through a different path; `logs` and `queries` accepted them and
   * ignored them, which is worse than refusing.
   */
  @IsOptional()
  @IsISO8601({}, { message: 'from must be an ISO 8601 instant, such as 2026-08-22T14:03:00Z' })
  from?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'to must be an ISO 8601 instant, such as 2026-08-22T14:03:00Z' })
  to?: string;

  // ==================== How long it took ====================

  /**
   * Bounds on `duration`, in milliseconds.
   *
   * Every entry that measures anything carries one, and there was no way to
   * ask about it: the only related filter was `slow`, a boolean the query
   * watcher sets from its own threshold. "Requests over 500ms" is the first
   * question anybody asks a debugging tool.
   */
  @IsOptional()
  @IsInt({ message: 'minDuration must be a whole number of milliseconds' })
  @Min(0)
  @TransformToInt({ min: 0 })
  minDuration?: number;

  @IsOptional()
  @IsInt({ message: 'maxDuration must be a whole number of milliseconds' })
  @Min(0)
  @TransformToInt({ min: 0 })
  maxDuration?: number;

  /** Everything one request produced, which is what a detail page shows. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  requestId?: string;

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
   * The filters that may be read off a request, named one by one.
   *
   * The alternative — copying every own property of this object — puts a key
   * that came from a query string into an object write, and no amount of
   * refusing `__proto__` afterwards makes that shape safe to read. Naming them
   * is also what lets `filter-key-coverage.spec.ts` prove the list matches the
   * properties this DTO declares, so a filter added later cannot go missing.
   */
  private static readonly FILTER_KEYS = [
    'from',
    'to',
    'minDuration',
    'maxDuration',
    'requestId',
    'levels',
    'contexts',
    'queryTypes',
    'sources',
    'slow',
    'methods',
    'paths',
    'statuses',
    'controllers',
    'hostnames',
    'ips',
    'names',
    'resolved',
    'eventNames',
    'scheduleStatuses',
    'scheduleNames',
    'jobStatuses',
    'jobNames',
    'queues',
    'cacheOperations',
    'mailStatuses',
    'redisStatuses',
    'redisCommands',
    'modelActions',
    'entities',
    'modelSources',
    'notificationTypes',
    'notificationStatuses',
    'viewFormats',
    'viewStatuses',
    'commandStatuses',
    'commandNames',
    'gateNames',
    'gateResults',
    'batchStatuses',
    'batchOperations',
    'dumpStatuses',
    'dumpOperations',
    'dumpFormats',
    'operationTypes',
    'operationNames',
    'hasErrors',
    'hasN1',
    'tags',
    'search',
  ] as const;

  /**
   * Convert DTO to the filters object expected by storage
   * Returns undefined if no filters are set
   */
  toFilters(): Record<string, unknown> | undefined {
    // Read by name from a fixed list, so nothing a request carries decides
    // which property is written. Built without a prototype as the second line.
    const self = this as unknown as Record<string, unknown>;
    const filters = Object.create(null) as Record<string, unknown>;

    for (const key of CursorQueryDto.FILTER_KEYS) {
      const value = self[key];
      if (value !== undefined && typeof value !== 'function') {
        filters[key] = value;
      }
    }

    return Object.keys(filters).length > 0 ? filters : undefined;
  }
}
