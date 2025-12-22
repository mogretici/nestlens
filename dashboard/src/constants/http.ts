/**
 * HTTP constants for filtering and categorization
 * Shared between HttpClientPage and HttpClientDetailView
 */

// HTTP methods for filtering
export const HTTP_METHODS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
] as const;

// Status code patterns for filtering
export const STATUS_PATTERNS = [
  '2XX',
  '3XX',
  '4XX',
  '5XX',
  'SUCCESS',
  'ERROR',
  'CLIENT-ERROR',
  'REDIRECT',
] as const;

// Type definitions derived from constants
export type HttpMethod = (typeof HTTP_METHODS)[number];
export type StatusPattern = (typeof STATUS_PATTERNS)[number];
