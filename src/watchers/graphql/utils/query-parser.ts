/**
 * GraphQL Query Parser Utilities
 *
 * Provides query parsing, hashing, and truncation utilities for GraphQL operations.
 */

/**
 * Hash a GraphQL query string for deduplication and grouping
 * Uses a simple but effective hash algorithm (djb2)
 */
/**
 * How much of a query is read to identify it.
 *
 * Hashing normalises first, which is four passes over the text with a regular
 * expression each, and it runs on every operation — on the event loop of the
 * application being watched:
 *
 * ```text
 * 100 KB query  ->    5 ms
 *   1 MB query  ->   47 ms
 *   5 MB query  ->  226 ms
 * ```
 *
 * What is stored is truncated at `maxQuerySize` (8KB by default), so reading
 * further only refines the grouping of queries nobody can see in full. The
 * length goes into the hash as well, so two long operations sharing a prefix
 * are still told apart unless they are the same size too.
 */
const MAX_HASHED_QUERY = 8192;

export function hashQuery(query: string): string {
  // Normalize the query before hashing
  const normalized = normalizeQuery(
    query.length > MAX_HASHED_QUERY ? query.slice(0, MAX_HASHED_QUERY) : query,
  );

  let hash = 5381;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash * 33) ^ normalized.charCodeAt(i);
  }

  if (query.length > MAX_HASHED_QUERY) {
    hash = (hash * 33) ^ query.length;
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

/** How far back a nicer cutting point is worth looking for. */
const BOUNDARY_REACH = 50;

/**
 * Truncate a query to a maximum size.
 *
 * The cut lands on a brace or a comma when one is close to the limit, and at
 * the limit otherwise. It used to be `Math.max(lastBrace, lastComma, maxSize -
 * 50)`, which is negative for any limit below fifty with no brace before it —
 * `substring(0, -1)` is the empty string, so a small `maxQuerySize` recorded
 * the marker and none of the query:
 *
 * ```text
 * truncateQuery('{ hello world abc }', 10) -> '\n... [truncated]'
 * ```
 */
export function truncateQuery(query: string, maxSize: number): string {
  if (query.length <= maxSize) {
    return query;
  }

  if (maxSize <= 0) {
    return '... [truncated]';
  }

  const truncated = query.substring(0, maxSize);
  const boundary = Math.max(truncated.lastIndexOf('}'), truncated.lastIndexOf(','));
  const cutPoint = boundary > 0 && boundary >= maxSize - BOUNDARY_REACH ? boundary : maxSize;

  return truncated.substring(0, cutPoint) + '\n... [truncated]';
}

/** One operation declared in a document. */
export interface DeclaredOperation {
  type: 'query' | 'mutation' | 'subscription';
  name?: string;
}

const NAME_START = /[a-zA-Z_]/;
const NAME_PART = /[a-zA-Z0-9_]/;

/**
 * The operations a document declares, in the order they appear.
 *
 * Comments and string literals are skipped, and a keyword only counts outside
 * a selection set — which is what the two regular expressions this replaced
 * could not do. Measured on the old ones:
 *
 * ```text
 * '# a note\nmutation AddOrder { … }'      -> type query
 * 'fragment F on Order { id } mutation M …' -> type query
 * '# mutation Ghost { x }\n{ hello }'       -> name Ghost
 * '{ user { query name } }'                 -> name name
 * ```
 *
 * A mutation recorded as a query is the one operation a reader is most often
 * looking for, filed under the wrong type.
 */
export function declaredOperations(query: string): DeclaredOperation[] {
  const operations: DeclaredOperation[] = [];
  const length = query.length;
  let depth = 0;
  let index = 0;

  const skipName = (from: number): number => {
    let end = from;
    while (end < length && NAME_PART.test(query[end])) end += 1;
    return end;
  };

  while (index < length) {
    const character = query[index];

    if (character === '#') {
      while (index < length && query[index] !== '\n') index += 1;
      continue;
    }

    if (character === '"') {
      if (query.startsWith('"""', index)) {
        const end = query.indexOf('"""', index + 3);
        index = end === -1 ? length : end + 3;
        continue;
      }
      index += 1;
      while (index < length) {
        if (query[index] === '\\') {
          index += 2;
          continue;
        }
        if (query[index] === '"') {
          index += 1;
          break;
        }
        index += 1;
      }
      continue;
    }

    if (character === '{') {
      depth += 1;
      index += 1;
      continue;
    }

    if (character === '}') {
      depth = Math.max(0, depth - 1);
      index += 1;
      continue;
    }

    if (depth === 0 && NAME_START.test(character)) {
      const end = skipName(index);
      const word = query.slice(index, end);

      if (word === 'query' || word === 'mutation' || word === 'subscription') {
        let after = end;
        while (after < length && /\s/.test(query[after])) after += 1;

        operations.push({
          type: word,
          name:
            after < length && NAME_START.test(query[after])
              ? query.slice(after, skipName(after))
              : undefined,
        });
      }

      index = end;
      continue;
    }

    index += 1;
  }

  return operations;
}

/**
 * Whether the document asks the server about itself.
 *
 * Introspection selects `__schema` or `__type`. This used to be
 * `query.toLowerCase().includes('__schema')` with two regular expressions
 * beside it and a check for the word `introspectionquery` anywhere in the
 * text — a substring test where a field was meant. Measured on the old one:
 *
 * ```text
 * mutation { saveDoc(text: "__schema is a field") { id } }   dropped
 * query NotAnIntrospectionQuery { orders { id } }            dropped
 * { user { my__schema } }                                    dropped
 * ```
 *
 * Every one of those is an operation somebody wanted to see, absent from the
 * dashboard with nothing to say it had been skipped — which reads as "it never
 * ran". Reading whole names also settles `__typename` by construction: it is a
 * different name, so it is not introspection, which the regular expressions
 * had to be told separately.
 */
export function selectsIntrospection(query: string): boolean {
  const length = query.length;
  let index = 0;

  while (index < length) {
    const character = query[index];

    if (character === '#') {
      while (index < length && query[index] !== '\n') index += 1;
      continue;
    }

    if (character === '"') {
      if (query.startsWith('"""', index)) {
        const end = query.indexOf('"""', index + 3);
        index = end === -1 ? length : end + 3;
        continue;
      }
      index += 1;
      while (index < length) {
        if (query[index] === '\\') {
          index += 2;
          continue;
        }
        if (query[index] === '"') {
          index += 1;
          break;
        }
        index += 1;
      }
      continue;
    }

    if (NAME_START.test(character)) {
      let end = index;
      while (end < length && NAME_PART.test(query[end])) end += 1;

      const word = query.slice(index, end);
      if (word === '__schema' || word === '__type') {
        return true;
      }

      index = end;
      continue;
    }

    index += 1;
  }

  return false;
}

/**
 * Extract operation name from a GraphQL query.
 *
 * `requested` is what the client named in its request, which is the only
 * answer when a document declares more than one operation.
 */
export function extractOperationName(query: string, requested?: string): string | undefined {
  if (requested) {
    return requested;
  }

  return declaredOperations(query)[0]?.name;
}

/**
 * Extract operation type from a GraphQL query.
 *
 * `requested` names which operation ran, for a document that declares several.
 */
export function extractOperationType(
  query: string,
  requested?: string,
): 'query' | 'mutation' | 'subscription' {
  const operations = declaredOperations(query);
  const chosen = requested
    ? (operations.find((operation) => operation.name === requested) ?? operations[0])
    : operations[0];

  // A shorthand document — `{ user { name } }` — declares no operation and is
  // a query.
  return chosen?.type ?? 'query';
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
