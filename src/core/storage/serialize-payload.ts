/**
 * A payload as text, whatever the payload is.
 *
 * The file and Redis drivers store `JSON.stringify(entry.payload)`, and a
 * payload it refuses — a bigint, an own `toJSON` that throws — made `save`
 * throw. The collector reads a throwing save as storage being down: the batch
 * goes back into the buffer and fails every flush after it, so one value from
 * the application stopped recording altogether. Measured: one such payload
 * followed by twenty ordinary entries left **nothing** in the store, with
 * `Failed to flush entries, will keep retrying` in the log and a database that
 * was answering perfectly.
 *
 * Masking removes the shapes that are known to do this before an entry ever
 * gets here. This is the second line: the cost of one the masker has not heard
 * of is that entry's payload, not the pipeline.
 */
export const serializePayload = (payload: unknown): string => {
  try {
    return JSON.stringify(payload) ?? 'null';
  } catch (error) {
    return JSON.stringify({
      nestlensError: `payload could not be recorded: ${
        error instanceof Error ? error.message : String(error)
      }`,
    });
  }
};
