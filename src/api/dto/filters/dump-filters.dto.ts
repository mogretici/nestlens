import { IsOptional, IsArray, IsString } from 'class-validator';
import { TransformCommaSeparatedArray } from '../transformers';

export class DumpFiltersDto {
  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  dumpStatuses?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  dumpOperations?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  dumpFormats?: string[];
}
