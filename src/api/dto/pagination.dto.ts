import { IsOptional, IsNumber, IsIn } from 'class-validator';
import {
  TransformLimit,
  TransformOffset,
  TransformSequence,
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

export class BasePaginationDto {
  @IsOptional()
  @IsIn(ENTRY_TYPES)
  type?: EntryType;

  @IsOptional()
  @TransformLimit()
  @IsNumber()
  limit?: number;

  @IsOptional()
  @TransformOffset()
  @IsNumber()
  offset?: number;
}

export class CursorPaginationBaseDto {
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
}
