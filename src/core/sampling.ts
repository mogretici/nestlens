import { Entry, EntryType } from '../types';
import { SamplingConfig } from '../nestlens.config';

/**
 * Decides which entries are kept when not everything can be.
 *
 * Off unless configured: NestLens records everything by default, and that is
 * the point of it. This exists for the application that has grown past what it
 * wants to pay for that, and would rather see one request in ten completely
 * than all of them not at all.
 *
 * ## Whole requests, not scattered entries
 *
 * The decision is made from the request id, not per entry. A request, its
 * queries, its cache reads, its logs and its outgoing HTTP calls share one id,
 * so they are kept together or dropped together. Sampling entry by entry would
 * fill the dashboard with queries whose request was never recorded and requests
 * whose queries were not — every detail page half empty, which is worse than a
 * smaller number of complete ones.
 *
 * ## Deterministic, so it needs no memory
 *
 * The id is hashed and compared against the rate. The same id always gets the
 * same answer, from any watcher, in any order, with nothing held between calls
 * — no set of sampled requests to grow, expire or synchronise, and no
 * difference between the entry that arrives first and the one that arrives
 * after the response has been sent.
 *
 * Entries with no request id — a scheduled task, a console command, a job
 * picked off a queue — are sampled on their own hash, since there is no request
 * for them to belong to.
 */
export interface Sampler {
  shouldRecord(entry: Entry): boolean;
}

/** Types that are recorded whatever the rate says, unless configured otherwise. */
const DEFAULT_ALWAYS: EntryType[] = ['exception'];

/**
 * FNV-1a, 32-bit.
 *
 * Chosen for being cheap and well-spread rather than for being unguessable:
 * this runs on every entry, and a cryptographic hash would cost more than the
 * sampling saves. Nothing here is a security decision.
 */
function hash(value: string): number {
  let h = 0x811c9dc5;

  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }

  return h >>> 0;
}

const MAX_HASH = 0xffffffff;

/**
 * A sampler for the configured rate, or `undefined` when everything is kept.
 *
 * Returning `undefined` rather than a sampler that always says yes keeps the
 * default path free of a call per entry.
 */
export function createSampler(config?: SamplingConfig): Sampler | undefined {
  if (!config) {
    return undefined;
  }

  const rate = config.rate ?? 1;

  if (rate >= 1) {
    return undefined;
  }

  // A rate of 0 keeps only what `always` names, which is a coherent thing to
  // ask for: exceptions and nothing else.
  const threshold = Math.max(0, rate) * MAX_HASH;
  const always = new Set<EntryType>(config.always ?? DEFAULT_ALWAYS);

  return {
    shouldRecord(entry: Entry): boolean {
      if (always.has(entry.type)) {
        return true;
      }

      // No request id means nothing to correlate with, so the entry is sampled
      // on its own — a coin flip rather than a hash, since there is no key that
      // has to give the same answer twice.
      if (entry.requestId === undefined) {
        return Math.random() * MAX_HASH <= threshold;
      }

      return hash(entry.requestId) <= threshold;
    },
  };
}
