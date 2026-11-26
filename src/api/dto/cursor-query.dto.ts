import { IsISO8601, IsIn, IsString, MaxLength } from 'class-validator';
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
  IsWholeNumberLike,
  IsAbsentWith,
  IsOptionalParameter,
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

  @IsOptionalParameter()
  @IsIn(ENTRY_TYPES)
  type?: EntryType;

  @IsOptionalParameter()
  @TransformLimit()
  limit?: number;

  @IsOptionalParameter()
  @TransformSequence()
  @IsWholeNumberLike()
  beforeSequence?: number;

  /**
   * One direction or the other. Given both, memory storage returned the range
   * between them while SQLite and Redis read below `beforeSequence` alone.
   */
  @IsOptionalParameter()
  @TransformSequence()
  @IsWholeNumberLike()
  @IsAbsentWith('beforeSequence')
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
  @IsOptionalParameter()
  @IsISO8601({}, { message: 'from must be an ISO 8601 instant, such as 2026-08-22T14:03:00Z' })
  from?: string;

  @IsOptionalParameter()
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
  @IsOptionalParameter()
  @IsWholeNumberLike({}, { message: 'minDuration must be a whole number of milliseconds' })
  @TransformToInt({ min: 0 })
  minDuration?: number;

  @IsOptionalParameter()
  @IsWholeNumberLike({}, { message: 'maxDuration must be a whole number of milliseconds' })
  @TransformToInt({ min: 0 })
  maxDuration?: number;

  /** Everything one request produced, which is what a detail page shows. */
  @IsOptionalParameter()
  @IsString()
  @MaxLength(200)
  requestId?: string;

  // ==================== Log Filters ====================

  @IsOptionalParameter()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  levels?: string[];

  @IsOptionalParameter()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  contexts?: string[];

  // ==================== Query Filters ====================

  @IsOptionalParameter()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  queryTypes?: string[];

  @IsOptionalParameter()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  sources?: string[];

  @IsOptionalParameter()
  @TransformStringToBoolean()
  @IsBooleanLike()
  slow?: boolean;

  // ==================== Request/HTTP Filters ====================

  @IsOptionalParameter()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  methods?: string[];

  @IsOptionalParameter()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  paths?: string[];

  @IsOptionalParameter()
  @TransformCommaSeparatedNumbersOrErr()
  @IsCommaSeparatedList()
  statuses?: (number | 'ERR')[];

  @IsOptionalParameter()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  controllers?: string[];

  @IsOptionalParameter()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  hostnames?: string[];

  @IsOptionalParameter()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  ips?: string[];

  // ==================== Exception Filters ====================

  @IsOptionalParameter()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  names?: string[];

  @IsOptionalParameter()
  @TransformStringToBoolean()
  @IsBooleanLike()
  resolved?: boolean;

  // ==================== Event Filters ====================

  @IsOptionalParameter()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  eventNames?: string[];

  // ==================== Schedule Filters ====================

  @IsOptionalParameter()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  scheduleStatuses?: string[];

  @IsOptionalParameter()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  scheduleNames?: string[];

  // ==================== Job Filters ====================

  @IsOptionalParameter()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  jobStatuses?: string[];

  @IsOptionalParameter()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  jobNames?: string[];

  @IsOptionalParameter()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  queues?: string[];

  // ==================== Cache Filters ====================

  @IsOptionalParameter()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  cacheOperations?: string[];

  // ==================== Mail Filters ====================

  @IsOptionalParameter()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  mailStatuses?: string[];

  // ==================== Redis Filters ====================

  @IsOptionalParameter()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  redisStatuses?: string[];

  @IsOptionalParameter()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  redisCommands?: string[];

  // ==================== Model Filters ====================

  @IsOptionalParameter()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  modelActions?: string[];

  @IsOptionalParameter()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  entities?: string[];

  @IsOptionalParameter()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  modelSources?: string[];

  // ==================== Notification Filters ====================

  @IsOptionalParameter()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  notificationTypes?: string[];

  @IsOptionalParameter()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  notificationStatuses?: string[];

  // ==================== View Filters ====================

  @IsOptionalParameter()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  viewFormats?: string[];

  @IsOptionalParameter()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  viewStatuses?: string[];

  // ==================== Command Filters ====================

  @IsOptionalParameter()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  commandStatuses?: string[];

  @IsOptionalParameter()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  commandNames?: string[];

  // ==================== Gate Filters ====================

  @IsOptionalParameter()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  gateNames?: string[];

  @IsOptionalParameter()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  gateResults?: string[];

  // ==================== Batch Filters ====================

  @IsOptionalParameter()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  batchStatuses?: string[];

  @IsOptionalParameter()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  batchOperations?: string[];

  // ==================== Dump Filters ====================

  @IsOptionalParameter()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  dumpStatuses?: string[];

  @IsOptionalParameter()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  dumpOperations?: string[];

  @IsOptionalParameter()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  dumpFormats?: string[];

  // ==================== GraphQL Filters ====================

  @IsOptionalParameter()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  operationTypes?: string[];

  @IsOptionalParameter()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  operationNames?: string[];

  @IsOptionalParameter()
  @TransformStringToBoolean()
  @IsBooleanLike()
  hasErrors?: boolean;

  @IsOptionalParameter()
  @TransformStringToBoolean()
  @IsBooleanLike()
  hasN1?: boolean;

  // ==================== Common Filters ====================

  @IsOptionalParameter()
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  tags?: string[];

  /**
   * Capped for the same reason the filter arrays are: every entry's payload is
   * stringified and searched, and `security.validation.maxSearchLength` was
   * documented while nothing enforced it.
   */
  @IsOptionalParameter()
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
