import { IsOptional, IsArray, IsString } from 'class-validator';
import { TransformCommaSeparatedArray } from '../transformers';

export class GateFiltersDto {
  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  gateNames?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  gateResults?: string[];
}
