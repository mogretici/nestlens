/**
 * One spelling for a tag, whichever way it was typed.
 *
 * Entry tags have always been stored upper-cased, so that `slow` and `SLOW`
 * count as one tag rather than two. Monitored tags were stored verbatim, and
 * the two are compared: `getMonitoredTagsWithCounts` looks a monitored tag up
 * in the counts keyed by entry tag. Monitoring `checkout` therefore reported
 * zero entries no matter how many carried it, on every backend.
 */
export const normalizeTag = (tag: string): string => tag.toUpperCase();
