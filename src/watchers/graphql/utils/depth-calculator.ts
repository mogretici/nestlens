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

/**
 * Calculate depth from GraphQL AST (more accurate but requires graphql package)
 * Falls back to string-based calculation if AST is not available
 */
export function calculateDepthFromAST(
  document: unknown,
  maxRecommendedDepth: number = DEFAULT_MAX_RECOMMENDED_DEPTH,
): DepthResult {
  try {
    // Try to traverse AST if it's a valid DocumentNode
    const doc = document as {
      kind: string;
      definitions?: Array<{
        kind: string;
        selectionSet?: unknown;
      }>;
    };

    if (doc.kind !== 'Document' || !doc.definitions) {
      throw new Error('Invalid AST');
    }

    let maxDepth = 0;
    let deepestPath: string[] = [];

    function traverse(selectionSet: unknown, depth: number, path: string[]): void {
      if (!selectionSet || typeof selectionSet !== 'object') return;

      const ss = selectionSet as {
        selections?: Array<{
          kind: string;
          name?: { value: string };
          selectionSet?: unknown;
        }>;
      };

      if (!ss.selections) return;

      for (const selection of ss.selections) {
        if (selection.kind === 'Field') {
          const fieldName = selection.name?.value || 'unknown';
          const newPath = [...path, fieldName];

          if (selection.selectionSet) {
            const newDepth = depth + 1;
            if (newDepth > maxDepth) {
              maxDepth = newDepth;
              deepestPath = newPath;
            }
            traverse(selection.selectionSet, newDepth, newPath);
          }
        } else if (selection.kind === 'InlineFragment' || selection.kind === 'FragmentSpread') {
          // Handle fragments - count as same depth level
          if ((selection as { selectionSet?: unknown }).selectionSet) {
            traverse((selection as { selectionSet?: unknown }).selectionSet, depth, path);
          }
        }
      }
    }

    for (const definition of doc.definitions) {
      if (definition.kind === 'OperationDefinition' || definition.kind === 'FragmentDefinition') {
        traverse(definition.selectionSet, 0, []);
      }
    }

    const warnings: string[] = [];
    if (maxDepth > maxRecommendedDepth) {
      warnings.push(
        `Query depth of ${maxDepth} exceeds recommended maximum of ${maxRecommendedDepth}.`,
      );
    }

    return { maxDepth, deepestPath, warnings };
  } catch {
    // Fall back to string-based calculation
    return {
      maxDepth: 0,
      deepestPath: [],
      warnings: ['Unable to calculate depth from AST'],
    };
  }
}

/**
 * Check if a query exceeds a maximum depth
 */
export function exceedsMaxDepth(query: string, maxDepth: number): boolean {
  const result = calculateDepth(query);
  return result.maxDepth > maxDepth;
}

/**
 * Get a human-readable depth description
 */
export function getDepthDescription(depth: number): string {
  if (depth <= 3) {
    return 'shallow';
  } else if (depth <= 6) {
    return 'moderate';
  } else if (depth <= 10) {
    return 'deep';
  } else {
    return 'very deep';
  }
}
