import { IsOptional, IsArray, IsString } from 'class-validator';
import { TransformCommaSeparatedArray } from '../transformers';

export class ScheduleFiltersDto {
  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  scheduleStatuses?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  scheduleNames?: string[];
}
