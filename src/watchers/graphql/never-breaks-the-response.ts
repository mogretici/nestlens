import { Logger } from '@nestjs/common';

/**
 * Recording work that runs inside the host's own GraphQL pipeline.
 *
 * The adapters' hooks are called by Apollo and Mercurius in the middle of
 * answering a request, and a throw from one of them is not a lost entry — it is
 * the application's answer. Measured against Apollo Server 4, a hook that throws
 * in `willSendResponse` replaces a successful result with an errors array
 * carrying `Internal server error` and no data at all.
 *
 * `willResolveField` is worse still: it runs per field, so a single failure
 * there fails the field it was watching.
 *
 * Every other recording path in NestLens already refuses to do this — the
 * collector resolves rather than rejects, the exception filter re-throws what it
 * was given, watchers hand back the host's own return value. This is the same
 * rule for the two hooks that had no containment at all.
 *
 * Reported once per kind of failure. A payload shape that breaks the sanitizer
 * breaks it on every request, and a debugging tool that floods the log it is
 * meant to help read has replaced one problem with another.
 */
const logger = new Logger('NestLens');
const reported = new Set<string>();

function report(what: string, error: unknown): void {
  if (reported.has(what)) return;

  reported.add(what);
  logger.warn(
    `GraphQL watcher: ${what} failed and the operation was left unrecorded — ` +
      `${error instanceof Error ? error.message : String(error)}. ` +
      'The response is unaffected; this is reported once.',
  );
}

/** Runs `work`, reporting anything it throws instead of letting it out. */
export async function recording(what: string, work: () => Promise<void> | void): Promise<void> {
  try {
    await work();
  } catch (error) {
    report(what, error);
  }
}

/**
 * The same, for a hook whose value the host keeps.
 *
 * `requestDidStart` and `executionDidStart` return the listener for the rest of
 * the operation; the fallback is no listener, which is what an application
 * without NestLens hands back.
 */
export async function recordingValue<T>(
  what: string,
  work: () => Promise<T> | T,
  fallback: T,
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    report(what, error);

    return fallback;
  }
}

/**
 * The synchronous form, for hooks whose return value the host uses.
 *
 * `willResolveField` returns an end-of-field callback, and returning the
 * fallback on failure means the field resolves exactly as it would without
 * NestLens.
 */
export function recordingSync<T>(what: string, work: () => T, fallback: T): T {
  try {
    return work();
  } catch (error) {
    report(what, error);

    return fallback;
  }
}

/** Test seam: the report is once per process, and each test is its own case. */
export function forgetReported(): void {
  reported.clear();
}
