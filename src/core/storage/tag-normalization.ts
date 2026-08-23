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

/**
 * How long a tag may be.
 *
 * A reader's own tags have been bounded at this since they were given a
 * validator. The tags NestLens writes itself were not, and they are built from
 * application data — an event's name, a queue, an entity, a user id:
 *
 * ```text
 * emit('x'.repeat(5000), …)   ->  a 5,000-character tag, on every such entry
 * ```
 *
 * stored per entry, indexed by tag in all three backends, and listed in the
 * dashboard's tag filter.
 */
export const MAX_TAG_LENGTH = 100;

/** A tag no longer than {@link MAX_TAG_LENGTH}. */
export const boundTag = (tag: string): string =>
  tag.length <= MAX_TAG_LENGTH ? tag : `${tag.slice(0, MAX_TAG_LENGTH - 1)}…`;

/**
 * How many tags one entry may carry.
 *
 * The same hundred the API allows a reader to write, and the same hundred that
 * bounds a filter's values. A `tags` callback is the application's own code —
 * a loop that builds one tag per item would put a row per item in the tag
 * index, on every request:
 *
 * ```text
 * tags: () => items.map(…)   ->  5,002 tags on one entry
 * ```
 */
export const MAX_TAGS_PER_ENTRY = 100;
