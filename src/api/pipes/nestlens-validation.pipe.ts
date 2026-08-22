import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
  Type,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';

/**
 * Drop-in replacement for Nest's ValidationPipe (transform + whitelist +
 * implicit conversion) that is safe against duplicate class-transformer /
 * class-validator installations.
 *
 * Nest's built-in ValidationPipe stores the resolved class-transformer and
 * class-validator packages in MODULE-LEVEL variables that are reassigned by
 * every ValidationPipe constructor. When the host application registers its
 * own ValidationPipe (e.g. app.useGlobalPipes) and resolves a DIFFERENT copy
 * of class-transformer than the one nestlens' DTO decorators registered
 * their metadata with, the @Transform decorators silently stop running and
 * comma-separated filters fail validation with 400.
 *
 * This pipe calls plainToInstance/validate directly from nestlens' own
 * imports, so it always uses the same instances as the DTO decorators.
 */
@Injectable()
export class NestLensValidationPipe implements PipeTransform {
  async transform(value: unknown, metadata: ArgumentMetadata): Promise<unknown> {
    const { metatype } = metadata;
    if (!metatype || !this.shouldValidate(metatype)) {
      return value;
    }

    // A body has to be an object before a DTO can say anything about it.
    // `plainToInstance` maps an array into an array of instances, which carries
    // none of the DTO's properties and fails no rule — so `[]` posted to a
    // tagging endpoint passed validation and arrived at the storage as
    // `undefined`: `TypeError: tags is not iterable`, answered as a 500 with a
    // stack trace, for what is a caller's mistake.
    if (
      Array.isArray(value) ||
      (value !== undefined && value !== null && typeof value !== 'object')
    ) {
      throw new BadRequestException([
        `${metadata.type === 'body' ? 'body' : metadata.type} must be an object`,
      ]);
    }

    const entity = plainToInstance(metatype, value ?? {}, {
      enableImplicitConversion: true,
    });

    const errors = await validate(entity as object, {
      whitelist: true,
      forbidUnknownValues: false,
    });

    if (errors.length > 0) {
      throw new BadRequestException(this.flattenErrors(errors));
    }

    return entity;
  }

  private shouldValidate(metatype: Type<unknown>): boolean {
    const primitives: Type<unknown>[] = [String, Boolean, Number, Array, Object];
    return !primitives.includes(metatype);
  }

  /**
   * Flatten validation errors into ValidationPipe-style messages
   */
  private flattenErrors(errors: ValidationError[], parentPath = ''): string[] {
    const messages: string[] = [];

    for (const error of errors) {
      const path = parentPath ? `${parentPath}.${error.property}` : error.property;

      if (error.constraints) {
        messages.push(...Object.values(error.constraints));
      }

      if (error.children && error.children.length > 0) {
        messages.push(...this.flattenErrors(error.children, path));
      }
    }

    return messages;
  }
}
