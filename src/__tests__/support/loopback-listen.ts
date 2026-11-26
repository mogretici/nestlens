/**
 * Refuses a TCP listen on the wildcard address anywhere in the test suite.
 *
 * A server listening on `::` with port 0 gets whatever ephemeral port the
 * kernel picks. On macOS that can be a port another process already holds on
 * `127.0.0.1` — a Gradle daemon, JetBrains Toolbox — because the two bindings
 * do not conflict. The tests then connect to the literal `127.0.0.1`, the more
 * specific listener wins, and the request reaches the other process: "socket
 * hang up", "fetch failed", an SSE stream that never opens. It failed about one
 * full run in thirty. Binding `127.0.0.1` itself makes the kernel skip ports
 * held there, so it cannot happen.
 *
 * supertest's `request(server)` listens on its own, without a host, whenever
 * the server is not already listening, so every suite has to listen first.
 */
import { Server } from 'net';

const installed = Symbol.for('nestlens.test.loopbackListenGuard');
const wildcards = new Set(['', '::', '0.0.0.0']);

type Listen = (this: Server, ...args: unknown[]) => Server;

const isPipeName = (value: unknown): boolean =>
  typeof value === 'string' && !/^\s*\d+\s*$/.test(value);

/** The host a TCP listen would bind, or `null` when the call is not a TCP listen. */
const tcpHostOf = (args: unknown[]): string | undefined | null => {
  const [first, second] = args;

  if (first !== null && typeof first === 'object') {
    const options = first as Record<string, unknown>;

    if (options._handle || options.handle || typeof options.fd === 'number') return null;
    if (options.path !== undefined) return null;

    return typeof options.host === 'string' ? options.host : undefined;
  }

  if (isPipeName(first)) return null;

  return typeof second === 'string' ? second : undefined;
};

export const installLoopbackListenGuard = (): void => {
  const prototype = Server.prototype as Server & { [installed]?: true };

  if (prototype[installed]) return;
  prototype[installed] = true;

  const listen = prototype.listen as Listen;

  prototype.listen = function guardedListen(this: Server, ...args: unknown[]): Server {
    const host = tcpHostOf(args);

    if (host !== null && (host === undefined || wildcards.has(host))) {
      throw new Error(
        `Test server tried to listen on ${host ? `'${host}'` : 'the wildcard address'}: ` +
          "listen on 127.0.0.1 — a wildcard port can be shadowed by another process's " +
          'loopback listener; see src/__tests__/support/loopback-listen.ts',
      );
    }

    return listen.apply(this, args);
  } as Server['listen'];
};
