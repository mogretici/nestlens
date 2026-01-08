import { IsOptional, IsArray, IsString } from 'class-validator';
import { TransformCommaSeparatedArray, TransformCommaSeparatedNumbersOrErr } from '../transformers';

export class RequestFiltersDto {
  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  methods?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  paths?: string[];

  @IsOptional()
  @TransformCommaSeparatedNumbersOrErr()
  @IsArray()
  statuses?: (number | 'ERR')[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  controllers?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  hostnames?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  ips?: string[];
}
