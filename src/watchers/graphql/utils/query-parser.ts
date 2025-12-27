/**
 * GraphQL Query Parser Utilities
 *
 * Provides query parsing, hashing, and truncation utilities for GraphQL operations.
 */

/**
 * Hash a GraphQL query string for deduplication and grouping
 * Uses a simple but effective hash algorithm (djb2)
 */
export function hashQuery(query: string): string {
  // Normalize the query before hashing
  const normalized = normalizeQuery(query);

  let hash = 5381;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash * 33) ^ normalized.charCodeAt(i);
  }

  // Convert to unsigned 32-bit integer and then to hex
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Normalize a GraphQL query for consistent hashing
 * Removes extra whitespace, comments, and normalizes formatting
 */
export function normalizeQuery(query: string): string {
  return (
    query
      // Remove comments
      .replace(/#[^\n]*/g, '')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      // Remove spaces around punctuation
      .replace(/\s*([{}():,!])\s*/g, '$1')
      // Trim
      .trim()
  );
}

/**
 * Truncate a query to a maximum size
 */
export function truncateQuery(query: string, maxSize: number): string {
  if (query.length <= maxSize) {
    return query;
  }

  // Try to truncate at a reasonable point (end of a field or brace)
  const truncated = query.substring(0, maxSize);
  const lastBrace = truncated.lastIndexOf('}');
  const lastField = truncated.lastIndexOf(',');
  const cutPoint = Math.max(lastBrace, lastField, maxSize - 50);

  return truncated.substring(0, cutPoint) + '\n... [truncated]';
}

/**
 * Extract operation name from a GraphQL query
 */
export function extractOperationName(query: string): string | undefined {
  // Match: query OperationName, mutation OperationName, subscription OperationName
  const match = query.match(
    /(?:query|mutation|subscription)\s+([a-zA-Z_][a-zA-Z0-9_]*)/,
  );
  return match?.[1];
}

/**
 * Extract operation type from a GraphQL query
 */
export function extractOperationType(
  query: string,
): 'query' | 'mutation' | 'subscription' {
  const trimmed = query.trim();

  if (trimmed.startsWith('mutation')) {
    return 'mutation';
  }

  if (trimmed.startsWith('subscription')) {
    return 'subscription';
  }

  // Default to query (handles shorthand queries like `{ user { name } }`)
  return 'query';
}

/**
 * Check if a query is an introspection query
 */
export function isIntrospectionQuery(query: string): boolean {
  const normalized = query.toLowerCase();

  return (
    normalized.includes('__schema') ||
    normalized.includes('__type') ||
    normalized.includes('introspectionquery')
  );
}

/**
 * Count the number of fields in a selection set
 * This is a simplified count - not a full AST traversal
 */
export function countFields(query: string): number {
  // Remove strings to avoid false positives
  const withoutStrings = query.replace(/"[^"]*"/g, '');

  // Count field-like patterns (word followed by optional arguments and selection)
  // This is a heuristic, not a full parse
  const fieldPattern = /\b[a-zA-Z_][a-zA-Z0-9_]*\s*(?:\([^)]*\))?\s*(?:{|$)/g;
  const matches = withoutStrings.match(fieldPattern);

  return matches ? matches.length : 0;
}

/**
 * Parse a GraphQL query and extract basic information
 */
export interface ParsedQuery {
  operationName?: string;
  operationType: 'query' | 'mutation' | 'subscription';
  hash: string;
  fieldCount: number;
  isIntrospection: boolean;
}

export function parseQuery(query: string, maxSize: number): ParsedQuery {
  const truncated = truncateQuery(query, maxSize);

  return {
    operationName: extractOperationName(query),
    operationType: extractOperationType(query),
    hash: hashQuery(query),
    fieldCount: countFields(truncated),
    isIntrospection: isIntrospectionQuery(query),
  };
}

/**
 * Format a GraphQL query for display (pretty print)
 * This is a simple formatter, not a full AST-based formatter
 */
export function formatQuery(query: string): string {
  let formatted = '';
  let indent = 0;
  let inString = false;
  let prevChar = '';

  for (let i = 0; i < query.length; i++) {
    const char = query[i];

    // Handle strings
    if (char === '"' && prevChar !== '\\') {
      inString = !inString;
    }

    if (inString) {
      formatted += char;
      prevChar = char;
      continue;
    }

    switch (char) {
      case '{':
        formatted += ' {\n' + '  '.repeat(++indent);
        break;
      case '}':
        formatted = formatted.trimEnd();
        formatted += '\n' + '  '.repeat(--indent) + '}';
        break;
      case ',':
        formatted = formatted.trimEnd();
        formatted += '\n' + '  '.repeat(indent);
        break;
      case ' ':
      case '\n':
      case '\t':
        if (formatted[formatted.length - 1] !== ' ' && formatted[formatted.length - 1] !== '\n') {
          formatted += ' ';
        }
        break;
      default:
        formatted += char;
    }

    prevChar = char;
  }

  return formatted.trim();
}
