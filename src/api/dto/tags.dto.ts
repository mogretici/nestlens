import { ArrayNotEmpty, IsArray, IsNotEmpty, IsString, MaxLength } from 'class-validator';

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
