import type { NestLensToolDescriptor } from '../api/tools';

interface Truncation {
  shown: number;
  of: number;
  note: string;
  resume?: Record<string, number>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const idOf = (entry: unknown): number | undefined =>
  isRecord(entry) && typeof entry.id === 'number' ? entry.id : undefined;

const takes = (tool: NestLensToolDescriptor, name: string): boolean =>
  tool.parameters.some((parameter) => parameter.name === name);

const isHighSurrogate = (code: number): boolean => code >= 0xd800 && code <= 0xdbff;

/** A string cut to `limit` UTF-16 units, one shorter where the cut would halve a character. */
const cutAt = (value: string, limit: number): string => {
  const end = isHighSurrogate(value.charCodeAt(limit - 1)) ? limit - 1 : limit;
  return value.slice(0, end);
};

const cutByCharacters = (serialized: string, maxChars: number): string => {
  const kept = cutAt(serialized, maxChars);
  return (
    `${kept}\n\n[Cut off: ${kept.length} of ${serialized.length} characters shown, so the text ` +
    'above is not valid JSON. Ask for less with `limit`, or narrow with filters.]'
  );
};

/**
 * The entries to keep of a cursor page: the `shown` nearest its cursor.
 *
 * Chosen by id, not by position. The storages order a page newest first, but
 * one asked for with both cursors is read below `beforeSequence` and then
 * reversed by SQLite and Redis, so it arrives oldest first; keeping the first
 * few by position would keep the ones furthest from the cursor and leave a gap.
 */
const nearestToCursor = (
  data: readonly unknown[],
  shown: number,
  forward: boolean,
): { entries: unknown[]; nearest?: number } => {
  const ids = data.map(idOf);
  if (ids.some((id) => id === undefined)) {
    const entries = forward ? data.slice(data.length - shown) : data.slice(0, shown);
    return { entries, nearest: idOf(forward ? data[data.length - 1] : data[0]) };
  }

  const order = (ids as number[]).slice().sort((x, y) => (forward ? x - y : y - x));
  const kept = new Set(order.slice(0, shown));
  return { entries: data.filter((_, i) => kept.has(ids[i] as number)), nearest: order[0] };
};

/**
 * What to keep of a list that does not fit, and how to ask for the rest.
 *
 * A forward page (`afterSequence` alone; with `beforeSequence` beside it every
 * storage but the in-memory one reads backward) keeps the entries just after
 * its cursor, a backward page the ones just before it. With nothing shown, the
 * next page starts past the entry that did not fit, which the note names so it
 * can be opened on its own.
 */
const plan = (
  tool: NestLensToolDescriptor,
  args: Record<string, unknown>,
  data: readonly unknown[],
  shown: number,
): {
  entries: unknown[];
  nearest?: number;
  resume?: Record<string, number>;
  cursor?: Record<string, unknown>;
} => {
  if (takes(tool, 'beforeSequence') || takes(tool, 'afterSequence')) {
    const forward = typeof args.afterSequence === 'number' && args.beforeSequence === undefined;
    const { entries, nearest } = nearestToCursor(data, shown, forward);
    const ids = entries.map(idOf).filter((id): id is number => id !== undefined);
    const newest = ids.length > 0 ? Math.max(...ids) : undefined;
    const oldest = ids.length > 0 ? Math.min(...ids) : undefined;
    const at = shown === 0 ? nearest : forward ? newest : oldest;
    return {
      entries,
      nearest,
      ...(at === undefined
        ? {}
        : { resume: forward ? { afterSequence: at } : { beforeSequence: at } }),
      cursor: { hasMore: true, oldestSequence: oldest ?? null, newestSequence: newest ?? null },
    };
  }

  const entries = data.slice(0, shown);
  const nearest = idOf(data[0]);
  if (takes(tool, 'offset')) {
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    return { entries, nearest, resume: { offset: offset + Math.max(shown, 1) } };
  }

  return { entries, nearest };
};

const noteFor = (
  shown: number,
  of: number,
  resume: Record<string, number> | undefined,
  first: number | undefined,
): string => {
  const head = `Only ${shown} of ${of} entries fit in this answer; the rest were left out.`;
  const [name, value] = Object.entries(resume ?? {})[0] ?? [];
  if (shown === 0 && first !== undefined) {
    const skip =
      name === undefined
        ? ''
        : ` To step past it, call again with the same arguments and ${name}: ${value}.`;
    return (
      `${head} The next entry alone is larger than an answer may be; open it with ` +
      `get_entry, id ${first}.${skip}`
    );
  }
  if (name === undefined) return `${head} Ask for fewer with \`limit\`, or narrow with filters.`;
  return (
    `${head} To continue from the last one shown, call again with the same arguments and ` +
    `${name}: ${value}. This note, not the API's paging, says where the next page starts.`
  );
};

/**
 * The API's answer as text no longer than `maxChars`.
 *
 * A list is cut by whole entries, so what arrives is still JSON and its `meta`
 * survives: cutting the text instead drops `meta`, which the envelope puts last,
 * and with it the cursor an agent needs to ask for the next page. Anything else
 * is cut by characters, and says so.
 */
export const fitResponse = (
  value: unknown,
  maxChars: number,
  tool?: NestLensToolDescriptor,
  args: Record<string, unknown> = {},
): string => {
  const serialized = JSON.stringify(value) ?? 'null';
  if (serialized.length <= maxChars) return serialized;

  if (!tool || !isRecord(value) || !Array.isArray(value.data)) {
    return cutByCharacters(serialized, maxChars);
  }

  const data = value.data;
  const build = (shown: number): string => {
    const { entries, nearest, resume, cursor } = plan(tool, args, data, shown);
    const truncated: Truncation = {
      shown,
      of: data.length,
      note: noteFor(shown, data.length, resume, nearest),
      ...(resume ? { resume } : {}),
    };
    const meta = isRecord(value.meta) && cursor ? { ...value.meta, ...cursor } : value.meta;
    return JSON.stringify({
      truncated,
      ...value,
      data: entries,
      ...(meta === undefined ? {} : { meta }),
    });
  };

  let low = 0;
  let high = data.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (build(middle).length <= maxChars) low = middle;
    else high = middle - 1;
  }

  const fitted = build(low);
  return fitted.length <= maxChars ? fitted : cutByCharacters(serialized, maxChars);
};
