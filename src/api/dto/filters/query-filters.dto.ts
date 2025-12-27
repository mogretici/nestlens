import { IsOptional, IsArray, IsString, IsBoolean } from 'class-validator';
import {
  TransformCommaSeparatedArray,
  TransformStringToBoolean,
} from '../transformers';

export class QueryFiltersDto {
  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  queryTypes?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  sources?: string[];

  @IsOptional()
  @TransformStringToBoolean()
  @IsBoolean()
  slow?: boolean;
}
