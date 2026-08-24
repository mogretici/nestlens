import { ENTRY_TYPES as CANONICAL_ENTRY_TYPES, EntryType } from '@/types';

/**
 * Every type an entry can have.
 *
 * One list, because two would drift: a DTO that accepts a type the storage
 * does not record, or rejects one it does, is a filter that silently returns
 * nothing.
 */
/**
 * Every type an entry can have, from the one list that defines them.
 *
 * Written out here as well until the Redis driver's copy of the same list fell
 * one type behind and made `graphql` entries invisible to stats. A DTO that
 * accepts a type the storage does not record, or rejects one it does, is a
 * filter that silently returns nothing — so this is the same list, not another
 * one.
 */
export const ENTRY_TYPES: EntryType[] = [...CANONICAL_ENTRY_TYPES];
