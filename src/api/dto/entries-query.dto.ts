import { IsIn, IsString, MaxLength, ValidationArguments } from 'class-validator';
import { ENTRY_TYPES } from './entry-types';
import {
  MAX_OFFSET,
  TransformDate,
  TransformLimit,
  TransformOffset,
  TransformSequence,
  TransformStringToBoolean,
  TransformToInt,
  IsBooleanLike,
  IsDateLike,
  IsOptionalParameter,
  IsWholeNumberLike,
  isWholeNumber,
} from './transformers';
import { EntryType } from '@/types';

/**
 * Query of the offset-paged endpoints: `entries`, `requests`, `exceptions`,
 * `logs` and `queries`. Only `entries` takes a `type`; the others are one type
 * each, and {@link EntriesQueryDto} adds it.
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
/**
 * Where to page instead, said only to an offset that is a whole number past
 * the bound; anything else is told what an offset is.
 */
const offsetRefusal = ({ value }: ValidationArguments): string =>
  isWholeNumber(value)
    ? `offset must be at most ${MAX_OFFSET}; use entries/cursor to page further`
    : `offset must be a whole number from 0 to ${MAX_OFFSET}`;

export class PageQueryDto {
  @IsOptionalParameter()
  @IsString()
  @MaxLength(200)
  requestId?: string;

  @IsOptionalParameter()
  @TransformLimit()
  limit?: number;

  @IsOptionalParameter()
  @IsWholeNumberLike({ max: MAX_OFFSET }, { message: offsetRefusal })
  @TransformOffset()
  offset?: number;

  @IsOptionalParameter()
  @IsDateLike({ message: 'from must be a date the runtime can read, such as an ISO 8601 string' })
  @TransformDate()
  from?: Date;

  @IsOptionalParameter()
  @IsDateLike({ message: 'to must be a date the runtime can read, such as an ISO 8601 string' })
  @TransformDate()
  to?: Date;

  /** Bounds on `duration`, in milliseconds. See `CursorQueryDto`. */
  @IsOptionalParameter()
  @IsWholeNumberLike({}, { message: 'minDuration must be a whole number of milliseconds' })
  @TransformToInt({ min: 0 })
  minDuration?: number;

  @IsOptionalParameter()
  @IsWholeNumberLike({}, { message: 'maxDuration must be a whole number of milliseconds' })
  @TransformToInt({ min: 0 })
  maxDuration?: number;
}

/** `GET entries`, which can be any type. */
export class EntriesQueryDto extends PageQueryDto {
  @IsOptionalParameter()
  @IsIn(ENTRY_TYPES)
  type?: EntryType;
}

/** `GET logs`, which narrows by level. */
export class LogsQueryDto extends PageQueryDto {
  @IsOptionalParameter()
  @IsString()
  @MaxLength(50)
  level?: string;
}

/** `GET queries`, which narrows to the slow ones. */
export class QueriesQueryDto extends PageQueryDto {
  @IsOptionalParameter()
  @TransformStringToBoolean()
  @IsBooleanLike()
  slow?: boolean;
}

/**
 * Query of `GET entries/check-new`, which the live tail polls.
 *
 * `afterSequence` was read with `parseInt` and passed on unchecked, so a
 * missing or unreadable one became NaN — and Redis, asked for
 * `zcount (NaN +inf`, answered with an error. Required and numeric here.
 */
export class CheckNewQueryDto {
  @IsWholeNumberLike()
  @TransformSequence()
  afterSequence!: number;

  @IsOptionalParameter()
  @IsIn(ENTRY_TYPES)
  type?: EntryType;
}

/**
 * Query of `GET entries/latest-sequence`, which the live tail polls beside
 * `check-new`.
 *
 * The two took the same parameter and answered differently: `check-new`
 * refused a type that does not exist and this one accepted it, looked for a
 * type index that cannot be there, and answered `null`. One API, one answer.
 */
export class LatestSequenceQueryDto {
  @IsOptionalParameter()
  @IsIn(ENTRY_TYPES)
  type?: EntryType;
}

/**
 * Query of `GET entries/grouped`, which reads a type and a page size and
 * nothing else. It took the whole offset query, and so published a window and
 * an offset it never applied.
 */
export class GroupedEntriesQueryDto {
  @IsOptionalParameter()
  @IsIn(ENTRY_TYPES)
  type?: EntryType;

  @IsOptionalParameter()
  @TransformLimit()
  limit?: number;
}

/** Query of `GET entries/family/:hash`: the hash is the filter, so only a page size. */
export class FamilyQueryDto {
  @IsOptionalParameter()
  @TransformLimit()
  limit?: number;
}
