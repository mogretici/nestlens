import { getMetadataStorage } from 'class-validator';
import type { ValidationMetadata } from 'class-validator/types/metadata/ValidationMetadata';

/** The JSON types a parameter can take. */
export type ToolParameterType = 'string' | 'integer' | 'number' | 'boolean' | 'array';

/** Where a parameter travels on the wire. */
export type ToolParameterLocation = 'path' | 'query' | 'body';

export interface ToolParameter {
  name: string;
  in: ToolParameterLocation;
  type: ToolParameterType;
  required: boolean;
  /** Said once here for the shapes that are not obvious from a name and a type. */
  description?: string;
  /** For `array`, the type of each item. */
  items?: 'string' | 'integer';
  enum?: readonly string[];
  format?: 'date-time';
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  maxItems?: number;
}

/**
 * Read off a class by what its validators declare, which is the one place a
 * parameter's shape is already written down. A second description would be a
 * second thing to keep in step with the first, and the manifest exists so that
 * nothing has to be.
 */
type Constructor = new (...args: never[]) => object;

type DesignType = typeof String | typeof Number | typeof Boolean | typeof Array | typeof Date;

const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/** What a TypeScript type, as the compiler emitted it, says about the JSON type. */
const typeOfDesign = (design: unknown): ToolParameterType => {
  if (design === Number) return 'number';
  if (design === Boolean) return 'boolean';
  if (design === Array) return 'array';
  return 'string';
};

/**
 * A `ToolParameter` for every property a validated class declares.
 *
 * Only properties with at least one validator are seen — which is every
 * property these classes accept, because the validation pipe rejects the rest.
 */
export const describeDto = (
  dto: Constructor,
  location: Exclude<ToolParameterLocation, 'path'>,
): ToolParameter[] => {
  const metadata = getMetadataStorage().getTargetValidationMetadatas(
    dto,
    '',
    false,
    false,
  ) as ValidationMetadata[];

  const byProperty = new Map<string, ValidationMetadata[]>();
  for (const entry of metadata) {
    const list = byProperty.get(entry.propertyName) ?? [];
    list.push(entry);
    byProperty.set(entry.propertyName, list);
  }

  const parameters: ToolParameter[] = [];

  for (const [name, validators] of byProperty) {
    const design = Reflect.getMetadata('design:type', dto.prototype, name) as
      DesignType | undefined;
    const names = new Set(validators.map((validator) => validator.name));
    const find = (validatorName: string): ValidationMetadata | undefined =>
      validators.find((validator) => validator.name === validatorName);

    const parameter: ToolParameter = {
      name,
      in: location,
      type: typeOfDesign(design),
      required: !validators.some((validator) => validator.type === 'conditionalValidation'),
    };

    if (names.has('isInt')) parameter.type = 'integer';

    if (names.has('isBooleanLike') || names.has('isBoolean')) parameter.type = 'boolean';

    if (names.has('isArray') || names.has('isCommaSeparatedStrings')) {
      parameter.type = 'array';
      parameter.items = 'string';
    }

    if (names.has('isCommaSeparatedList')) {
      parameter.type = 'array';
      parameter.items = 'string';
      parameter.description =
        'Comma-separated; numbers, or ERR for a request that failed before it was answered';
    } else if (names.has('isCommaSeparatedStrings')) {
      parameter.description = 'Comma-separated list of values';
    }

    if (names.has('isIso8601') || names.has('isDate') || design === Date) {
      parameter.type = 'string';
      parameter.format = 'date-time';
      parameter.description = 'ISO 8601 instant, such as 2026-08-22T14:03:00Z';
    }

    const allowed = find('isIn')?.constraints?.[0];
    if (Array.isArray(allowed)) parameter.enum = allowed.map(String);

    const minimum = asNumber(find('min')?.constraints?.[0]);
    if (minimum !== undefined) parameter.minimum = minimum;

    const maximum = asNumber(find('max')?.constraints?.[0]);
    if (maximum !== undefined) parameter.maximum = maximum;

    const maxLength = asNumber(find('maxLength')?.constraints?.[0]);
    if (maxLength !== undefined) parameter.maxLength = maxLength;

    const maxItems = asNumber(find('arrayMaxSize')?.constraints?.[0]);
    if (maxItems !== undefined) parameter.maxItems = maxItems;

    parameters.push(parameter);
  }

  return parameters.sort((a, b) => a.name.localeCompare(b.name));
};
