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
 * What to keep of a list that does not fit, and how to ask for the rest.
 *
 * Every list endpoint answers newest first. A forward page (`afterSequence`)
 * holds the oldest entries after the cursor, so it is cut from the newest end:
 * cutting the other end would leave a gap between the cursor and what is shown.
 */
const plan = (
  tool: NestLensToolDescriptor,
  args: Record<string, unknown>,
  data: readonly unknown[],
  shown: number,
): {
  entries: unknown[];
  resume?: Record<string, number>;
  cursor?: Record<string, unknown>;
} => {
  const forward = takes(tool, 'afterSequence') && typeof args.afterSequence === 'number';
  const entries = forward ? data.slice(data.length - shown) : data.slice(0, shown);
  const newest = idOf(entries[0]);
  const oldest = idOf(entries[entries.length - 1]);

  if (takes(tool, 'beforeSequence') || takes(tool, 'afterSequence')) {
    const at = forward ? newest : oldest;
    return {
      entries,
      ...(at === undefined
        ? {}
        : { resume: forward ? { afterSequence: at } : { beforeSequence: at } }),
      cursor: { hasMore: true, oldestSequence: oldest ?? null, newestSequence: newest ?? null },
    };
  }

  if (takes(tool, 'offset')) {
    const offset = typeof args.offset === 'number' ? args.offset : 0;
    return { entries, resume: { offset: offset + shown } };
  }

  return { entries };
};

const noteFor = (
  shown: number,
  of: number,
  resume: Record<string, number> | undefined,
  first: number | undefined,
): string => {
  const head = `Only ${shown} of ${of} entries fit in this answer; the rest were left out.`;
  if (shown === 0 && first !== undefined) {
    return `${head} The first entry alone is too large; open it with get_entry, id ${first}.`;
  }
  if (!resume) return `${head} Ask for fewer with \`limit\`, or narrow with filters.`;
  const [name, value] = Object.entries(resume)[0] as [string, number];
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
    const { entries, resume, cursor } = plan(tool, args, data, shown);
    const truncated: Truncation = {
      shown,
      of: data.length,
      note: noteFor(shown, data.length, resume, idOf(plan(tool, args, data, 1).entries[0])),
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
