/**
 * Parse a date string from the backend.
 * Backend stores dates as "YYYY-MM-DD HH:mm:ss" in UTC.
 * This function converts it to a proper Date object.
 */
export function parseDate(dateStr: string): Date {
  // If it's already ISO format with timezone, parse directly
  if (dateStr.includes('T') && (dateStr.includes('Z') || dateStr.includes('+'))) {
    return new Date(dateStr);
  }

  // Backend format: "2025-12-17 18:29:37" (UTC)
  // Convert to ISO format with Z suffix to indicate UTC
  const isoStr = dateStr.replace(' ', 'T') + 'Z';
  return new Date(isoStr);
}
