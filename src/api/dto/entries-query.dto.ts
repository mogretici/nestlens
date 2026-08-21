import { IsDate, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ENTRY_TYPES } from './entry-types';
import { TransformDate, TransformLimit, TransformOffset, TransformSequence } from './transformers';
import { EntryType } from '@/types';

/**
 * Query of the offset-paged endpoints: `entries`, `requests`, `exceptions`,
 * `logs` and `queries`.
 *
 * They read their parameters as raw strings and parsed them by hand, so
 * anything the parse did not anticipate reached the storage as it was.
 * `?from=yesterday` became an Invalid Date, which SQLite turned into
 * `RangeError: Invalid time value` — a 500 from a query string — while the
 * other two backends silently answered with nothing. `?type=nonsense` went
 * straight through to a lookup for a type that cannot exist.
 *
 * The cursor endpoint next to them has been validating its fifty parameters
 * through a DTO all along. These now do the same, so an unusable parameter is
 * a 400 that says which one, from every backend.
 */
export class EntriesQueryDto {
  @IsOptional()
  @IsIn(ENTRY_TYPES)
  type?: EntryType;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  requestId?: string;

  @IsOptional()
  @TransformLimit()
  limit?: number;

  @IsOptional()
  @TransformOffset()
  offset?: number;

  @IsOptional()
  @IsDate({ message: 'from must be a date the runtime can read, such as an ISO 8601 string' })
  @TransformDate()
  from?: Date;

  @IsOptional()
  @IsDate({ message: 'to must be a date the runtime can read, such as an ISO 8601 string' })
  @TransformDate()
  to?: Date;
}

/** `GET logs`, which narrows by level. */
export class LogsQueryDto extends EntriesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  level?: string;
}

/** `GET queries`, which narrows to the slow ones. */
export class QueriesQueryDto extends EntriesQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(['true', 'false'])
  slow?: string;
}

/**
 * Query of `GET entries/check-new`, which the live tail polls.
 *
 * `afterSequence` was read with `parseInt` and passed on unchecked, so a
 * missing or unreadable one became NaN — and Redis, asked for
 * `zcount (NaN +inf`, answered with an error. Required and numeric here.
 */
export class CheckNewQueryDto {
  @IsInt({ message: 'afterSequence must be a whole number' })
  @Min(0)
  @TransformSequence()
  afterSequence!: number;

  @IsOptional()
  @IsIn(ENTRY_TYPES)
  type?: EntryType;
}
