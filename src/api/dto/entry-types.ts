import { EntryType } from '@/types';

/**
 * Every type an entry can have.
 *
 * One list, because two would drift: a DTO that accepts a type the storage
 * does not record, or rejects one it does, is a filter that silently returns
 * nothing.
 */
export const ENTRY_TYPES: EntryType[] = [
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
