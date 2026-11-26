import {
  buildMessage,
  getMetadataStorage,
  IsOptional,
  ValidateBy,
  ValidateIf,
  ValidationOptions,
} from 'class-validator';

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
/**
 * How many values one filter may carry.
 *
 * Documented under `security.validation.maxFilterArrayLength` and enforced
 * nowhere: a request asking for two thousand statuses was answered, and every
 * value becomes another `IN` placeholder or another comparison per entry. The
 * limit lives with the validators the filters already run through, so it covers
 * every filter field at once rather than one decorator at a time.
 */
export const MAX_FILTER_VALUES = 100;

/** How long a search term may be, for the same reason. */
export const MAX_SEARCH_LENGTH = 500;

const withinFilterLimit = (value: unknown): boolean =>
  !Array.isArray(value) || value.length <= MAX_FILTER_VALUES;

export function IsCommaSeparatedStrings(validationOptions?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'isCommaSeparatedStrings',
      validator: {
        validate: (value: unknown): boolean =>
          withinFilterLimit(value) &&
          (typeof value === 'string' ||
            (Array.isArray(value) && value.every((item) => typeof item === 'string'))),
        defaultMessage: buildMessage(
          (eachPrefix) =>
            `${eachPrefix}$property must be a comma-separated string or an array of strings, ` +
            `with at most ${MAX_FILTER_VALUES} values`,
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
        validate: (value: unknown): boolean =>
          withinFilterLimit(value) && (typeof value === 'string' || Array.isArray(value)),
        defaultMessage: buildMessage(
          (eachPrefix) =>
            `${eachPrefix}$property must be a comma-separated string or an array, ` +
            `with at most ${MAX_FILTER_VALUES} values`,
          validationOptions,
        ),
      },
    },
    validationOptions,
  );
}

/**
 * A parameter given blank — empty, or nothing but whitespace — which is a
 * parameter not given. `?from=` and `?type=` are what a form submits for a
 * field left empty.
 */
export const isBlank = (value: unknown): boolean =>
  typeof value === 'string' && value.trim() === '';

const isGiven = (value: unknown): boolean =>
  value !== undefined && value !== null && !isBlank(value);

/**
 * `@IsOptional()` for a query parameter: missing, null or blank, and the
 * property's validators do not run.
 *
 * `@IsOptional()` skips only null and undefined, so a host's pipe — which
 * validates the query as the URL spelled it — refused `?type=` and `?from=`
 * while NestLens' own pipe, which drops blank parameters first, ignored them.
 * The same URL answered differently by application.
 */
export function IsOptionalParameter(validationOptions?: ValidationOptions): PropertyDecorator {
  return ValidateIf((_object, value: unknown) => isGiven(value), validationOptions);
}

const IS_NOT_BLANK = 'isNotBlank';

/**
 * `@IsOptional()` for a parameter that narrows what a mutating route changes:
 * left out, it means every one; given blank, it is refused.
 *
 * Everywhere else a blank parameter is one not given. Here that would turn an
 * empty form field into `DELETE entries` of every type — a client that sent
 * `?type=` by accident would clear everything. Left out entirely, the route
 * still means what it always has.
 */
export function IsOptionalScope(): PropertyDecorator {
  return (target, property) => {
    IsOptional()(target, property as string);
    ValidateBy({
      name: IS_NOT_BLANK,
      validator: {
        validate: (value: unknown): boolean => !isBlank(value),
        defaultMessage: buildMessage(
          () => '$property was given blank; leave it out to mean every one',
        ),
      },
    })(target, property as string);
  };
}

const blankRefusedCache = new WeakMap<object, ReadonlySet<string>>();

/** The properties of `dto` declared with {@link IsOptionalScope}, read from its metadata. */
export const blankRefusedIn = (dto: new (...args: never[]) => unknown): ReadonlySet<string> => {
  const cached = blankRefusedCache.get(dto);
  if (cached) return cached;

  const properties = new Set(
    getMetadataStorage()
      .getTargetValidationMetadatas(dto, '', true, false)
      .filter((metadata) => metadata.name === IS_NOT_BLANK)
      .map((metadata) => metadata.propertyName),
  );
  blankRefusedCache.set(dto, properties);
  return properties;
};

/** A whole number from zero, as a number or as the digits of one. */
export const isWholeNumber = (value: unknown): boolean =>
  (typeof value === 'number' && Number.isInteger(value) && value >= 0) ||
  (typeof value === 'string' && /^\d+$/.test(value));

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

/**
 * A whole number from zero, at most `max` when one is given, or the digits of
 * one when @Transform did not run.
 */
export function IsWholeNumberLike(
  bounds: { max?: number } = {},
  validationOptions?: ValidationOptions,
) {
  const { max } = bounds;
  const withinMax = (value: number): boolean => max === undefined || value <= max;

  return ValidateBy(
    {
      name: 'isWholeNumberLike',
      constraints: [max],
      validator: {
        validate: (value: unknown): boolean => isWholeNumber(value) && withinMax(Number(value)),
        defaultMessage: buildMessage(
          () =>
            max === undefined
              ? '$property must be a whole number'
              : `$property must be a whole number no greater than ${max}`,
          validationOptions,
        ),
      },
    },
    validationOptions,
  );
}

/**
 * A Date the runtime could read, or a string it can read into one when
 * TransformDate did not run.
 */
export function IsDateLike(validationOptions?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'isDateLike',
      validator: {
        validate: (value: unknown): boolean =>
          (value instanceof Date || typeof value === 'string') &&
          !Number.isNaN(new Date(value).getTime()),
        defaultMessage: buildMessage(() => '$property must be a date', validationOptions),
      },
    },
    validationOptions,
  );
}

/** The items of a list as TransformCommaSeparatedArray would leave them. */
const itemsOf = (value: unknown): unknown[] | undefined =>
  Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',').filter(Boolean)
      : undefined;

/**
 * A list with at least one item, or a comma-separated string naming one.
 */
export function IsNonEmptyListLike(validationOptions?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'isNonEmptyListLike',
      validator: {
        validate: (value: unknown): boolean => (itemsOf(value)?.length ?? 0) > 0,
        defaultMessage: buildMessage(
          () => '$property must name at least one value',
          validationOptions,
        ),
      },
    },
    validationOptions,
  );
}

/**
 * Every item a string of at most `max` characters, counted per item whether
 * the list arrived split or as the comma-separated string.
 */
export function HasItemsOfMaxLength(max: number, validationOptions?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'hasItemsOfMaxLength',
      constraints: [max],
      validator: {
        validate: (value: unknown): boolean =>
          itemsOf(value)?.every((item) => typeof item === 'string' && item.length <= max) ?? false,
        defaultMessage: buildMessage(
          () => `each value in $property must be shorter than or equal to ${max} characters`,
          validationOptions,
        ),
      },
    },
    validationOptions,
  );
}

/**
 * Refuses the property when `other` is given too. A blank one is not given.
 */
export function IsAbsentWith(other: string, validationOptions?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'isAbsentWith',
      constraints: [other],
      validator: {
        validate: (value: unknown, args): boolean =>
          !isGiven(value) || !isGiven((args?.object as Record<string, unknown>)[other]),
        defaultMessage: buildMessage(
          () => `Pass ${other} or $property, not both`,
          validationOptions,
        ),
      },
    },
    validationOptions,
  );
}
