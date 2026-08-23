/**
 * Whether a value has to be awaited before it means anything.
 *
 * `instanceof Promise` answers a narrower question than the one being asked. A
 * promise from Bluebird, from Prisma's fluent API, or from another realm is a
 * thenable that is not an instance of this realm's `Promise` — and TypeScript
 * accepts every one of them where `Promise<T>` is declared, because the type is
 * structural. So the declared contract permits exactly the values the check
 * misses.
 *
 * What that cost, measured:
 *
 * ```text
 * canAccess:   () => thenable(false)      ->  access granted
 * filterBatch: () => thenable([entry])    ->  TypeError, then nothing recorded
 * ```
 *
 * The first is an authorization hook answering the opposite of what it was
 * written to say. The second assigns the thenable itself and hands it to the
 * storage, which fails the flush — and the collector reads a failing flush as
 * storage being down, so recording stops.
 *
 * Where the value is *returned* from an `async` function the mistake is
 * invisible, because that resolves a thenable on the way out. `filter` and the
 * subscription source are of that kind and were never wrong; they are written
 * this way so the next reader does not have to work out which is which.
 */
export const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof (value as { then?: unknown })?.then === 'function';

/** `value`, awaited if it needs to be. */
export const settled = async <T>(value: T | PromiseLike<T>): Promise<T> =>
  isThenable(value) ? await value : value;
