/**
 * How a configured list of sensitive names relates to the built-in one.
 *
 * An array *adds*: the built-in list stays and these join it. That is what
 * every masking option here has always effectively done — the collector masks
 * every payload on its way to storage with its own defaults, so a shorter list
 * configured on a watcher never actually narrowed anything.
 *
 * `{ replace: [...] }` is the way to say the other thing, and it has to be said
 * out loud. It drops the built-in list entirely and masks exactly what is
 * named, which is the right answer when the defaults redact a field this
 * application needs to read — and the wrong answer by accident, which is why
 * it is not what a bare array means.
 *
 *     sensitiveParams: ['iban']                 // the defaults, plus iban
 *     sensitiveParams: { replace: ['iban'] }    // iban, and nothing else
 */
export type MaskingTerms = string[] | { replace: string[] };

/** Whether this list was written to stand in for the built-in one. */
export function replacesDefaults(terms: MaskingTerms | undefined): boolean {
  return terms !== undefined && !Array.isArray(terms);
}

/**
 * The terms a masking list resolves to, defaults included unless replaced.
 *
 * Deduplicated, and one array per resolution: the GraphQL sanitiser caches its
 * compiled matcher on the array's identity, so handing out a fresh array per
 * call would quietly turn a cache hit into a rebuild.
 */
export function resolveMaskingTerms(
  defaults: readonly string[],
  configured?: MaskingTerms,
): string[] {
  if (replacesDefaults(configured)) {
    return [...new Set((configured as { replace: string[] }).replace)];
  }

  return [...new Set([...defaults, ...((configured as string[] | undefined) ?? [])])];
}
