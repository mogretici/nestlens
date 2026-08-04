import { buildMessage, ValidateBy, ValidationOptions } from 'class-validator';

/**
 * Duplicate-package-safe validators.
 *
 * class-validator stores its metadata on `globalThis`, so validation
 * decorators registered by nestlens' copy of class-validator are also
 * enforced by a host application's copy (e.g. a global ValidationPipe in the
 * consuming app). class-transformer metadata however is module-scoped, so
 * when two copies exist the @Transform decorators do NOT run in the host's
 * pipe and query params arrive in their RAW string form.
 *
 * These validators therefore accept BOTH the raw query-string form and the
 * transformed form, so nestlens' API routes validate correctly no matter
 * which class-transformer instance processed them. The actual normalization
 * is guaranteed by NestLensValidationPipe, which always runs with nestlens'
 * own class-transformer.
 */

/**
 * Accepts a comma-separated string (raw query param) or an array of strings
 * (after TransformCommaSeparatedArray has run).
 */
export function IsCommaSeparatedStrings(validationOptions?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'isCommaSeparatedStrings',
      validator: {
        validate: (value: unknown): boolean =>
          typeof value === 'string' ||
          (Array.isArray(value) && value.every((item) => typeof item === 'string')),
        defaultMessage: buildMessage(
          (eachPrefix) =>
            `${eachPrefix}$property must be a comma-separated string or an array of strings`,
          validationOptions,
        ),
      },
    },
    validationOptions,
  );
}

/**
 * Accepts a comma-separated string (raw query param) or an array
 * (after TransformCommaSeparatedNumbersOrErr has run).
 */
export function IsCommaSeparatedList(validationOptions?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'isCommaSeparatedList',
      validator: {
        validate: (value: unknown): boolean => typeof value === 'string' || Array.isArray(value),
        defaultMessage: buildMessage(
          (eachPrefix) => `${eachPrefix}$property must be a comma-separated string or an array`,
          validationOptions,
        ),
      },
    },
    validationOptions,
  );
}

/**
 * Accepts a boolean or the strings 'true'/'false' (raw query param form,
 * before TransformStringToBoolean has run).
 */
export function IsBooleanLike(validationOptions?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'isBooleanLike',
      validator: {
        validate: (value: unknown): boolean =>
          typeof value === 'boolean' || value === 'true' || value === 'false',
        defaultMessage: buildMessage(
          (eachPrefix) => `${eachPrefix}$property must be a boolean or 'true'/'false'`,
          validationOptions,
        ),
      },
    },
    validationOptions,
  );
}
