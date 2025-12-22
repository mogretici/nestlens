/**
 * Format milliseconds to human-readable duration
 * Examples:
 *   500 -> "500ms"
 *   1000 -> "1s"
 *   60000 -> "1m"
 *   1800000 -> "30m"
 *   3600000 -> "1h"
 *   5400000 -> "1h 30m"
 *   86400000 -> "1d"
 */
export function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remainingHours = hours % 24;
    if (remainingHours > 0) {
      return `${days}d ${remainingHours}h`;
    }
    return `${days}d`;
  }

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    if (remainingMinutes > 0) {
      return `${hours}h ${remainingMinutes}m`;
    }
    return `${hours}h`;
  }

  if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    if (remainingSeconds > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${minutes}m`;
  }

  return `${seconds}s`;
}

/**
 * Get human-readable format for large ms values (>= 1 second)
 * Returns null if the value is too small to need a human-readable version
 */
export function formatMsHuman(ms: number): string | null {
  if (ms < 1000) return null; // No need for human-readable under 1 second
  return formatMs(ms);
}

/**
 * Format interval for schedule display
 * Examples:
 *   1000 -> "Every 1s"
 *   60000 -> "Every 1m"
 *   1800000 -> "Every 30m"
 */
export function formatInterval(ms: number): string {
  return `Every ${formatMs(ms)}`;
}

/**
 * Filter value normalization utilities
 * URL format: always lowercase for consistency
 * Display format: category-specific (uppercase for methods, etc.)
 */

// Normalize filter value for URL based on category
export function normalizeFilterForUrl(value: string, category?: string): string {
  // If category specified, use its format rules
  if (category) {
    const format = categoryDisplayFormats[category] || 'preserve';
    switch (format) {
      case 'uppercase':
        return value.toLowerCase(); // Store lowercase in URL, display uppercase
      case 'lowercase':
        return value.toLowerCase();
      default:
        return value; // Preserve original case for hostnames, controllers, etc.
    }
  }
  // Default: lowercase for URL consistency
  return value.toLowerCase();
}

// Display formats by category
type DisplayFormat = 'uppercase' | 'lowercase' | 'preserve';

const categoryDisplayFormats: Record<string, DisplayFormat> = {
  // Uppercase categories
  methods: 'uppercase',
  types: 'uppercase',      // Query types: SELECT, INSERT
  tags: 'uppercase',       // SLOW, AUTH
  // Lowercase categories
  levels: 'lowercase',     // Log levels: error, warn
  sources: 'lowercase',    // prisma, typeorm
  operations: 'lowercase', // Cache operations
  queues: 'lowercase',     // Job queues
  // Preserve as-is (case-sensitive or mixed case values)
  statuses: 'preserve',    // 200, 404, sent, failed
  names: 'preserve',       // TypeError, ValidationError
  controllers: 'preserve', // UserController#show
  hostnames: 'preserve',   // localhost:3000
  ips: 'preserve',
  paths: 'preserve',
  contexts: 'preserve',    // Log contexts
  events: 'preserve',      // Event names
};

// Format filter value for display based on category
export function formatFilterForDisplay(value: string, category: string): string {
  const format = categoryDisplayFormats[category] || 'preserve';
  switch (format) {
    case 'uppercase':
      return value.toUpperCase();
    case 'lowercase':
      return value.toLowerCase();
    default:
      return value;
  }
}

// Check if a filter value matches (case-insensitive)
export function filterMatches(filterValue: string, targetValue: string): boolean {
  return filterValue.toLowerCase() === targetValue.toLowerCase();
}

// Check if filter array includes a value (case-insensitive)
export function filtersInclude(filters: string[], value: string): boolean {
  const normalizedValue = value.toLowerCase();
  return filters.some(f => f.toLowerCase() === normalizedValue);
}

// Format filter value for server/API requests (backend expects specific formats)
export function formatFilterForServer(value: string, category: string): string {
  const format = categoryDisplayFormats[category] || 'preserve';
  switch (format) {
    case 'uppercase':
      return value.toUpperCase();
    case 'lowercase':
      return value.toLowerCase();
    default:
      return value;
  }
}

// Format array of filter values for server
export function formatFiltersForServer(values: string[], category: string): string[] {
  return values.map(v => formatFilterForServer(v, category));
}
