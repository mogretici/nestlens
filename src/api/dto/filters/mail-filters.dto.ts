import { IsOptional, IsArray, IsString } from 'class-validator';
import { TransformCommaSeparatedArray } from '../transformers';

export class MailFiltersDto {
  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  mailStatuses?: string[];
}
