import { serializePayload } from '../core/storage/serialize-payload';

/**
 * A value as a watcher records it: whole if it is small, described if not.
 *
 * The size is measured on a serialisation that cannot fail. Every watcher used
 * `JSON.stringify` for this and discarded the payload when it threw, which is
 * what an ORM hands to an event, a job or a cache:
 *
 * ```text
 * emit('order.created', order)   ->  {"_error":"Unable to serialize payload"}
 * ```
 *
 * where `order.items[0].order === order`. The payload was lost at the watcher,
 * before masking — which resolves a reference back into the payload, bounds the
 * depth and bounds how much it walks — ever saw it. So the entry that mattered
 * most on the page was the one that said nothing.
 *
 * A value whose size cannot be measured is passed through for masking to make
 * storable; a value that is simply too large is replaced by its size, which is
 * the number a reader needs to know that something was left out.
 */
export const capturePayload = (value: unknown, maxBytes: number): unknown => {
  // Nothing to record, and `null` is recorded as nothing rather than as null:
  // that is what every watcher did before this was one function.
  if (value === undefined || value === null) {
    return undefined;
  }

  const serialized = serializePayload(value);

  return serialized.length > maxBytes ? { _truncated: true, _size: serialized.length } : value;
};
