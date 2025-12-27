import { IsOptional, IsArray, IsString } from 'class-validator';
import { TransformCommaSeparatedArray } from '../transformers';

export class CommandFiltersDto {
  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  commandStatuses?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  commandNames?: string[];
}
