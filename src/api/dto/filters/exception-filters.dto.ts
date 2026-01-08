import { IsOptional, IsArray, IsString, IsBoolean } from 'class-validator';
import { TransformCommaSeparatedArray, TransformStringToBoolean } from '../transformers';

export class ExceptionFiltersDto {
  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  names?: string[];

  @IsOptional()
  @TransformStringToBoolean()
  @IsBoolean()
  resolved?: boolean;
}
