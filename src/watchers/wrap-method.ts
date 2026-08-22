/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Replacing a method on an object the application owns.
 *
 * Several watchers record by putting their own function in place of one the
 * host wrote. Two things about that are easy to get wrong, and both were:
 *
 * **The replacement has to keep the original's shape.** The wrappers were
 * written `async`, which turns a synchronous method into one that returns a
 * promise. For most of them that costs nothing, because what they wrap is
 * asynchronous by contract — a cache manager, a mailer, a Redis client. For an
 * authorization service it is a hole: `can`, `allows` and `denies` are usually
 * synchronous, callers write `if (ability.can('read', post))`, and a promise is
 * always truthy.
 *
 *     ability.can('Post', 'delete')      false      ->  Promise  ->  if() runs
 *     ability.denies('Post', 'delete')   true       ->  Promise  ->  if() runs
 *
 * Enabling a watcher granted every permission the watched application checked
 * synchronously. So the wrapper calls the original, looks at what came back,
 * and only awaits something that is already a promise.
 *
 * **Recording must not reach the caller.** Whatever the watcher does with the
 * outcome happens inside a `try`: an entry that cannot be built is an entry
 * lost, never an exception raised inside a method the application called for
 * its own reasons.
 */
import { Logger } from '@nestjs/common';

const logger = new Logger('NestLensWatcher');

/** What happened when the wrapped method ran. */
export interface MethodOutcome<C = undefined> {
  args: unknown[];
  result?: unknown;
  error?: unknown;
  durationMs: number;
  /** Whatever `before` returned for this call, if one was given. */
  context: C;
}

type AnyMethod = (...args: any[]) => unknown;

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof (value as { then?: unknown })?.then === 'function';

/**
 * Wraps `original` so `record` sees every call, without changing what a caller
 * gets back or when.
 */
export const wrapMethodPreservingShape = <T extends AnyMethod, C = undefined>(
  original: T,
  record: (outcome: MethodOutcome<C>) => void,
  /** Reads whatever has to be measured before the call, such as memory. */
  before?: () => C,
): T => {
  const report = (outcome: MethodOutcome<C>): void => {
    try {
      record(outcome);
    } catch (error) {
      logger.debug(`Failed to record a wrapped call: ${error}`);
    }
  };

  return function wrapped(this: unknown, ...args: unknown[]): unknown {
    const started = Date.now();
    // A `before` that throws must not stop the call it was measuring.
    let context: C;
    try {
      context = before?.() as C;
    } catch {
      context = undefined as C;
    }

    let result: unknown;
    try {
      result = original.apply(this, args);
    } catch (error) {
      report({ args, error, durationMs: Date.now() - started, context });
      throw error;
    }

    if (!isThenable(result)) {
      report({ args, result, durationMs: Date.now() - started, context });
      return result;
    }

    // Watched, not replaced.
    //
    // This used to return `Promise.resolve(result).then(…)`, which is a native
    // promise — so a method answering with a thenable that carries an API of
    // its own handed the caller something else entirely:
    //
    //     repo.find()          a QueryBuilder: thenable, and `.tap`, `.where`…
    //     wrapped repo.find()  a Promise: thenable, and nothing else
    //
    // The outcome is read by attaching to it and giving back what the method
    // returned, so a caller keeps whatever it was written to receive. The
    // handlers here are attached first, so recording still happens before the
    // caller's own continuation, and the derived promise this creates is
    // settled by both of them — the caller's rejection is still the caller's
    // to handle.
    try {
      (result as PromiseLike<unknown>).then(
        (value) => {
          report({ args, result: value, durationMs: Date.now() - started, context });
        },
        (error: unknown) => {
          report({ args, error, durationMs: Date.now() - started, context });
        },
      );
    } catch (error) {
      logger.debug(`Failed to watch a wrapped call: ${error}`);
    }

    return result;
  } as unknown as T;
};

/**
 * Remembers what a method was so it can be put back.
 *
 * The wrappers live on an object the application owns and keeps, so closing the
 * module has to give it back. Otherwise the host goes on calling through a
 * watcher whose collector is gone — and where a process builds the module more
 * than once against the same object, as tests and `nest start --hmr` do, each
 * round wraps the last: one call, one entry per layer.
 */
export class WrappedMethods {
  private readonly originals = new Map<string, unknown>();

  constructor(private readonly target: Record<string, unknown> | undefined) {}

  /** Replaces `name` if the target has it as a function. Says whether it did. */
  replace(name: string, build: (original: AnyMethod) => AnyMethod): boolean {
    if (!this.target) return false;

    const existing = this.target[name];
    if (typeof existing !== 'function') return false;

    this.originals.set(name, existing);
    this.target[name] = build((existing as AnyMethod).bind(this.target) as AnyMethod);
    return true;
  }

  /** Puts every replaced method back. */
  restore(): void {
    if (!this.target) return;

    for (const [name, original] of this.originals) {
      this.target[name] = original;
    }
    this.originals.clear();
  }
}
