import { IsOptional, IsArray, IsString, IsBoolean } from 'class-validator';
import {
  TransformCommaSeparatedArray,
  TransformStringToBoolean,
} from '../transformers';

export class GraphQLFiltersDto {
  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  operationTypes?: string[];

  @IsOptional()
  @TransformCommaSeparatedArray()
  @IsArray()
  @IsString({ each: true })
  operationNames?: string[];

  @IsOptional()
  @TransformStringToBoolean()
  @IsBoolean()
  hasErrors?: boolean;

  @IsOptional()
  @TransformStringToBoolean()
  @IsBoolean()
  hasN1?: boolean;
}
