/**
 * GraphQL Query Depth Calculator
 *
 * Calculates the maximum nesting depth of a GraphQL query.
 * Useful for detecting deeply nested queries that may cause performance issues.
 */

/**
 * Depth calculation result
 */
export interface DepthResult {
  /** Maximum depth reached */
  maxDepth: number;
  /** Path to the deepest field */
  deepestPath: string[];
  /** Warnings if depth exceeds recommended limits */
  warnings: string[];
}

/**
 * Default recommended maximum depth
 */
const DEFAULT_MAX_RECOMMENDED_DEPTH = 10;

/**
 * Calculate the depth of a GraphQL query
 *
 * This is a simplified depth calculator that uses string parsing
 * rather than full AST traversal for performance.
 *
 * @param query - The GraphQL query string
 * @param maxRecommendedDepth - The recommended maximum depth (default: 10)
 */
export function calculateDepth(
  query: string,
  maxRecommendedDepth: number = DEFAULT_MAX_RECOMMENDED_DEPTH,
): DepthResult {
  // Remove comments and strings to avoid false positives
  const cleanQuery = query
    .replace(/#[^\n]*/g, '') // Remove comments
    .replace(/"[^"]*"/g, '""'); // Replace strings with empty strings

  let currentDepth = 0;
  let maxDepth = 0;
  const pathStack: string[] = [];
  let deepestPath: string[] = [];
  const warnings: string[] = [];

  // State tracking
  let inArgs = 0; // Parenthesis depth for arguments
  let currentField = '';

  for (let i = 0; i < cleanQuery.length; i++) {
    const char = cleanQuery[i];

    switch (char) {
      case '(':
        // Entering arguments, don't count as depth
        inArgs++;
        break;

      case ')':
        // Exiting arguments
        inArgs--;
        break;

      case '{':
        if (inArgs > 0) continue; // Skip braces in arguments

        currentDepth++;

        // Push current field to path if we have one
        if (currentField) {
          pathStack.push(currentField);
          currentField = '';
        }

        if (currentDepth > maxDepth) {
          maxDepth = currentDepth;
          deepestPath = [...pathStack];
        }
        break;

      case '}':
        if (inArgs > 0) continue; // Skip braces in arguments

        currentDepth--;
        pathStack.pop();
        break;

      case ':':
        // Alias, skip to the actual field name
        currentField = '';
        break;

      default:
        if (inArgs > 0) continue; // Skip characters in arguments

        if (/[a-zA-Z_]/.test(char)) {
          // Building field name
          currentField += char;
        } else if (/[a-zA-Z0-9_]/.test(char) && currentField) {
          // Continuing field name
          currentField += char;
        } else if (currentField && /\s/.test(char)) {
          // End of field name on whitespace
          // Don't clear yet, we might hit a {
        }
    }
  }

  // Generate warnings if depth exceeds recommended
  if (maxDepth > maxRecommendedDepth) {
    warnings.push(
      `Query depth of ${maxDepth} exceeds recommended maximum of ${maxRecommendedDepth}. ` +
        `Deep queries can cause performance issues.`,
    );
  }

  // Add warning for very deep queries
  if (maxDepth > maxRecommendedDepth * 2) {
    warnings.push(
      `Query is extremely deep (${maxDepth} levels). ` +
        `Consider implementing depth limiting to prevent DoS attacks.`,
    );
  }

  return {
    maxDepth,
    deepestPath,
    warnings,
  };
}
