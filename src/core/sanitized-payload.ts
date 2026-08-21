/**
 * Marks payload subtrees a watcher has already cleaned.
 *
 * `CollectorService.mask()` masks every payload on its way in, which is what
 * makes a watcher that forgets to mask harmless. The GraphQL watcher does not
 * forget — it builds a clean copy of the variables and of the response before
 * the collector ever sees them — so masking those two again is a second deep
 * clone of the largest thing in the entry, measured at about a third of the
 * cost of capturing a response at all.
 *
 * Marked by value identity rather than by a flag on the entry, because only
 * part of a GraphQL payload is sanitised: `errors[].extensions` carries
 * whatever a resolver put there and still has to be masked. An entry-level
 * flag would take that with it, and the failure would be silent — an unmasked
 * secret in storage costs more than the traversal ever saves. Anything not
 * marked is masked, so a watcher that grows a new field gets masking for it
 * without anyone remembering to ask.
 *
 * A `WeakSet` holds no strong reference, so a mark lives exactly as long as the
 * payload it describes and nothing here can grow.
 */
const sanitizedValues = new WeakSet<object>();

/**
 * Records that `value` is already free of sensitive data.
 *
 * Returns its argument so it can wrap a `return`. Primitives are returned
 * untouched: they carry no keys, so there is nothing to skip.
 */
export function markSanitized<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    sanitizedValues.add(value as object);
  }

  return value;
}

/** Whether a watcher has already sanitised this exact value. */
export function isSanitized(value: unknown): boolean {
  return value !== null && typeof value === 'object' && sanitizedValues.has(value as object);
}
