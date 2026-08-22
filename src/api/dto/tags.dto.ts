import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  IsCommaSeparatedStrings,
  TransformCommaSeparatedArray,
  TransformLimit,
} from './transformers';

/** Body of the endpoints that add or remove an entry's tags. */
export class EntryTagsDto {
  /**
   * Required, and now said so: a bodyless POST answered
   * `500 Cannot read properties of undefined (reading 'tags')`, which reports a
   * caller's mistake as a server fault and names an implementation detail
   * instead of the missing field.
   */
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  tags!: string[];
}

/** Body of `POST monitored`. */
export class MonitoredTagDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  tag!: string;
}

/**
 * Query of `GET tags/entries`.
 *
 * It read three raw query parameters and trusted all of them. Measured against
 * a running application, on a store where 111 entries carried the tag:
 *
 *     /tags/entries                        500  — `undefined.split(',')`
 *     /tags/entries?tags=LOG&limit=abc     200, 0 rows    — NaN reached storage
 *     /tags/entries?tags=LOG&limit=-5      200, 106 rows  — a negative limit
 *     /tags/entries?tags=LOG&limit=1e8     200, 111 rows  — no ceiling at all
 *     /tags/entries?tags=LOG&logic=XOR     200            — treated as OR
 *
 * The first reports a caller's missing parameter as a server fault. The second
 * is worse: an unreadable limit returns an empty list, which reads as "nothing
 * carries this tag". Every other paged endpoint has been through a DTO for
 * some time; this one had not.
 */
export class TagEntriesQueryDto {
  @TransformCommaSeparatedArray()
  @IsCommaSeparatedStrings()
  @ArrayNotEmpty({ message: 'tags is required and must name at least one tag' })
  @MaxLength(100, { each: true })
  tags!: string[];

  @IsOptional()
  @IsIn(['AND', 'OR'], { message: 'logic must be AND or OR' })
  logic?: 'AND' | 'OR';

  @IsOptional()
  @TransformLimit()
  limit?: number;
}
