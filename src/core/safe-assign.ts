/**
 * Writing a key onto an object that is being rebuilt.
 *
 * Masking, sanitising and header capture all walk a payload and copy it into a
 * fresh object key by key. `__proto__` is not a key like the others: assigning
 * it with `target[key] = value` reaches the accessor every object inherits from
 * `Object.prototype` and sets the prototype instead of adding a member. A body
 * a client is free to send —
 *
 * ```text
 * {"__proto__": {"isAdmin": true}, "orderId": 7}
 * ```
 *
 * — therefore came out of the masker as `{"orderId": 7}`, with the part a
 * reader most wanted to see gone from the entry, and with the payload object
 * answering `payload.isAdmin` with `true` from a prototype the client chose.
 *
 * Measured before this existed, on `maskBody`:
 *
 *     keys           [ 'safe', 'password' ]      (`__proto__` dropped)
 *     prototype      replaced
 *     out.isAdmin    true
 *
 * `Object.prototype` itself is never touched — this is not global pollution —
 * but a debugging tool that quietly omits the interesting half of a request is
 * failing at the only thing it does.
 *
 * `defineProperty` writes an own data property under that name without going
 * near the accessor, so the key survives into the entry and the prototype stays
 * where it was. Every other key takes the plain assignment, which is the path
 * every payload takes.
 */
export function assignKey(target: Record<string, unknown>, key: string, value: unknown): void {
  if (key === '__proto__') {
    Object.defineProperty(target, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
    return;
  }

  target[key] = value;
}
