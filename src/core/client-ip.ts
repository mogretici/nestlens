/**
 * Who made a request, answered the same way everywhere.
 *
 * `X-Forwarded-For` is written by whoever sends the request, and nothing
 * strips it unless something in front does. The guard learned that when
 * reading it unconditionally turned the IP whitelist into a formality — a
 * header claiming an allowed address was enough to reach the dashboard — and
 * was changed to read it only once the application says it is behind a proxy.
 *
 * The request watcher was not, and kept its own copy of the old rule. So with
 * the default settings the two disagreed about the same request:
 *
 *     socket 203.0.113.7, header claims 10.0.0.1
 *       guard authorizes with   203.0.113.7
 *       dashboard records       10.0.0.1
 *
 * Which makes the recorded address, the `ips` filter and the IP column
 * whatever the caller typed. An operator reading them during an incident is
 * reading a field the subject of the investigation wrote.
 *
 * One function now, so the answer cannot drift again.
 */

/** The parts of a request this needs, on either HTTP adapter. */
export interface AddressableRequest {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
}

/**
 * The client's address.
 *
 * `trustProxy` is the application saying a proxy it controls sets the
 * forwarding header. Without it the socket address is the only thing the
 * caller cannot choose — except that Express fills `request.ip` from the
 * header itself when the host enables its own `trust proxy`, which is the
 * host's decision to make and is honoured either way.
 */
export const resolveClientIp = (
  request: AddressableRequest,
  trustProxy: boolean | undefined,
): string | undefined => {
  if (trustProxy) {
    const forwarded = forwardedClient(request.headers['x-forwarded-for']);
    if (forwarded) return forwarded;
  }

  return request.ip || request.socket?.remoteAddress || undefined;
};

/**
 * The first address in a forwarding header.
 *
 * The header can arrive as a list or as several headers, and both forms hold a
 * comma-separated chain whose first entry is the original client. One branch
 * used to split and the other did not, so two `X-Forwarded-For` headers
 * recorded `10.0.0.1, 9.9.9.9` as if that were an address.
 */
const forwardedClient = (header: string | string[] | undefined): string | undefined => {
  if (!header) return undefined;

  const first = Array.isArray(header) ? header[0] : header;
  const client = first?.split(',')[0]?.trim();

  return client || undefined;
};
