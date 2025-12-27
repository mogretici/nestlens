/**
 * Configuration for input validation limits.
 */
export interface InputValidatorConfig {
  /** Maximum number of items in filter arrays */
  maxFilterArrayLength?: number;
  /** Maximum length of search strings */
  maxSearchLength?: number;
  /** Maximum length of tag names */
  maxTagLength?: number;
  /** Maximum number of tags that can be applied to an entry */
  maxTagsPerEntry?: number;
}

/**
 * Default limits for input validation.
 */
const DEFAULTS = {
  MAX_FILTER_ARRAY_LENGTH: 100,
  MAX_SEARCH_LENGTH: 500,
  MAX_TAG_LENGTH: 100,
  MAX_TAGS_PER_ENTRY: 50,
};

/**
 * Utility class for validating and sanitizing user input.
 * Prevents DoS attacks through excessive data or malformed input.
 */
export class InputValidator {
  private readonly maxFilterArrayLength: number;
  private readonly maxSearchLength: number;
  private readonly maxTagLength: number;
  private readonly maxTagsPerEntry: number;

  constructor(config?: InputValidatorConfig) {
    this.maxFilterArrayLength =
      config?.maxFilterArrayLength ?? DEFAULTS.MAX_FILTER_ARRAY_LENGTH;
    this.maxSearchLength =
      config?.maxSearchLength ?? DEFAULTS.MAX_SEARCH_LENGTH;
    this.maxTagLength = config?.maxTagLength ?? DEFAULTS.MAX_TAG_LENGTH;
    this.maxTagsPerEntry =
      config?.maxTagsPerEntry ?? DEFAULTS.MAX_TAGS_PER_ENTRY;
  }

  /**
   * Validate and truncate a filter array to prevent DoS.
   * @returns Truncated array if too long, original array otherwise.
   */
  validateFilterArray<T>(arr: T[] | undefined, fieldName?: string): T[] {
    if (!arr || !Array.isArray(arr)) {
      return [];
    }

    if (arr.length > this.maxFilterArrayLength) {
      console.warn(
        `Filter array ${fieldName || 'unknown'} truncated from ${arr.length} to ${this.maxFilterArrayLength} items`,
      );
      return arr.slice(0, this.maxFilterArrayLength);
    }

    return arr;
  }

  /**
   * Validate and truncate a search term.
   * @returns Truncated search term if too long, original otherwise.
   */
  validateSearchTerm(search: string | undefined): string {
    if (!search || typeof search !== 'string') {
      return '';
    }

    const trimmed = search.trim();

    if (trimmed.length > this.maxSearchLength) {
      console.warn(
        `Search term truncated from ${trimmed.length} to ${this.maxSearchLength} characters`,
      );
      return trimmed.slice(0, this.maxSearchLength);
    }

    return trimmed;
  }

  /**
   * Validate a tag name.
   * @returns Sanitized tag name.
   * @throws Error if tag name is invalid.
   */
  validateTagName(tag: string): string {
    if (!tag || typeof tag !== 'string') {
      throw new Error('Tag name must be a non-empty string');
    }

    const trimmed = tag.trim();

    if (trimmed.length === 0) {
      throw new Error('Tag name cannot be empty');
    }

    if (trimmed.length > this.maxTagLength) {
      throw new Error(
        `Tag name cannot exceed ${this.maxTagLength} characters`,
      );
    }

    // Allow alphanumeric, hyphens, underscores, and colons
    if (!/^[\w:-]+$/i.test(trimmed)) {
      throw new Error(
        'Tag name can only contain letters, numbers, hyphens, underscores, and colons',
      );
    }

    return trimmed.toLowerCase();
  }

  /**
   * Validate an array of tags.
   * @returns Array of validated tag names.
   */
  validateTags(tags: string[] | undefined): string[] {
    if (!tags || !Array.isArray(tags)) {
      return [];
    }

    const validated: string[] = [];

    for (const tag of tags) {
      try {
        const validTag = this.validateTagName(tag);
        if (!validated.includes(validTag)) {
          validated.push(validTag);
        }
      } catch {
        // Skip invalid tags
        console.warn(`Invalid tag skipped: ${tag}`);
      }
    }

    if (validated.length > this.maxTagsPerEntry) {
      console.warn(
        `Tags truncated from ${validated.length} to ${this.maxTagsPerEntry}`,
      );
      return validated.slice(0, this.maxTagsPerEntry);
    }

    return validated;
  }

  /**
   * Validate a numeric ID.
   */
  validateId(id: unknown): number {
    const parsed = typeof id === 'string' ? parseInt(id, 10) : Number(id);

    if (isNaN(parsed) || !Number.isInteger(parsed) || parsed < 1) {
      throw new Error('ID must be a positive integer');
    }

    return parsed;
  }

  /**
   * Validate and parse a date string.
   */
  validateDate(dateStr: string | undefined): Date | undefined {
    if (!dateStr) {
      return undefined;
    }

    const date = new Date(dateStr);

    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date format: ${dateStr}`);
    }

    return date;
  }

  /**
   * Get current limits for reference.
   */
  getLimits(): InputValidatorConfig {
    return {
      maxFilterArrayLength: this.maxFilterArrayLength,
      maxSearchLength: this.maxSearchLength,
      maxTagLength: this.maxTagLength,
      maxTagsPerEntry: this.maxTagsPerEntry,
    };
  }
}

/**
 * Default validator instance with standard limits.
 */
export const inputValidator = new InputValidator();
