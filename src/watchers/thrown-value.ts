/**
 * Describes whatever was thrown, without assuming it was an `Error`.
 *
 * JavaScript lets you throw anything, and applications do:
 *
 *     throw 'not found'          // a string
 *     throw { code: 'E_LIMIT' }  // a bare object
 *     throw null                 // a rejected promise with no reason
 *
 * NestJS hands all of those to an exception filter and an interceptor's error
 * handler as-is. Reading `.status`, `.message` or `.name` off them is fine for
 * the first two and fatal for the last: `null.status` throws a `TypeError`
 * inside an RxJS error handler, where nothing is left to catch it, and the
 * process goes down.
 *
 * That is the worst thing a monitoring tool can do — the application was
 * handling its own failure correctly, and NestLens turned it into a crash.
 * Measured before this existed: `throw null` from a controller killed the
 * process, and the request never got a response.
 */
export interface ThrownValue {
  /** Constructor name, or a description of what was thrown instead. */
  name: string;
  /** The message if there was one, otherwise the value rendered readably. */
  message: string;
  /** An HTTP status carried by the value, when it carries one. */
  status?: number;
  /** The stack, when the value had one. */
  stack?: string;
}

/** Whether the value can carry properties at all. */
const canCarryProperties = (value: unknown): value is Record<string, unknown> =>
  (typeof value === 'object' && value !== null) || typeof value === 'function';

/** Renders a non-object throw in a way that says what it was. */
function describeValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (typeof value === 'symbol') return value.toString();

  try {
    return String(value);
  } catch {
    // A symbol-keyed `toString` that throws, a Proxy that refuses — the point
    // is to describe the failure, not to add one.
    return `[unrenderable ${typeof value}]`;
  }
}

/** A bare object rendered as its contents rather than as `[object Object]`. */
function describeObject(value: Record<string, unknown>): string {
  try {
    const json = JSON.stringify(value);
    if (json && json !== '{}') {
      return json.length > 500 ? `${json.slice(0, 500)}…` : json;
    }
  } catch {
    // Cyclic, or a `toJSON` that throws. Fall back to what `String` makes of it.
  }

  return describeValue(value);
}

export function describeThrown(value: unknown): ThrownValue {
  if (value instanceof Error) {
    return {
      name: value.name || 'Error',
      message: value.message || '',
      status: readStatus(value),
      stack: value.stack,
    };
  }

  if (canCarryProperties(value)) {
    // An object that is not an `Error` but looks like one — an HttpException
    // from another copy of `@nestjs/common`, a plain `{ message, status }`.
    const name = typeof value.name === 'string' ? value.name : value.constructor?.name;
    // `String({})` is `[object Object]`, which tells the reader nothing about
    // what the application threw. The shape is the only clue there is.
    const message = typeof value.message === 'string' ? value.message : describeObject(value);

    return {
      name: name && name !== 'Object' ? name : 'UnknownError',
      message,
      status: readStatus(value),
      stack: typeof value.stack === 'string' ? value.stack : undefined,
    };
  }

  return {
    // Named after what it is, so the dashboard can group these and the reader
    // can see at a glance that the application threw a value rather than an
    // error.
    name: value === null || value === undefined ? 'NonErrorThrow' : `NonErrorThrow:${typeof value}`,
    message: describeValue(value),
  };
}

/** An HTTP status carried on the value, if it is a plausible one. */
function readStatus(value: Record<string, unknown> | Error): number | undefined {
  const candidate = (value as Record<string, unknown>).status;

  if (typeof candidate === 'number' && candidate >= 100 && candidate <= 599) {
    return candidate;
  }

  // `HttpException` exposes it through a method rather than a field.
  const getStatus = (value as { getStatus?: unknown }).getStatus;
  if (typeof getStatus === 'function') {
    try {
      const status = (getStatus as () => unknown).call(value);
      if (typeof status === 'number' && status >= 100 && status <= 599) {
        return status;
      }
    } catch {
      // A `getStatus` that throws tells us nothing; fall through.
    }
  }

  return undefined;
}
