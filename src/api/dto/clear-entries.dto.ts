import { IsIn, IsOptional } from 'class-validator';
import { EntryType } from '@/types';
import { ENTRY_TYPES } from './entry-types';

/**
 * Query of `DELETE entries`.
 *
 * Without a type it deletes everything, which is what the button in the
 * sidebar has always done. With one it deletes that type and leaves the rest —
 * `pruneByType` existed on every storage and on the interface, and nothing
 * called it: the capability was there and had no door.
 */
export class ClearEntriesQueryDto {
  @IsOptional()
  @IsIn(ENTRY_TYPES, {
    message: `type must be one of: ${ENTRY_TYPES.join(', ')}`,
  })
  type?: EntryType;
}
