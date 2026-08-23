/**
 * What the validation pipe must do with anything a caller sends.
 *
 * The dashboard's API takes a query string and a body from whoever can reach
 * it. A parameter it does not anticipate has one correct answer — a 400 that
 * names it — and this repository has found the other answers twice: an
 * unreadable `limit` that returned an empty list as though nothing matched,
 * and a JSON array body that arrived at the storage as `undefined` and became
 * a 500 with a stack trace.
 *
 * The rules, against inputs assembled at random:
 *
 *   1. the pipe either returns a value or refuses with 400
 *   2. what it returns carries only what the DTO declares
 *   3. a number it returns is a number, within the documented bounds
 */
import 'reflect-metadata';
import { ArgumentMetadata, BadRequestException } from '@nestjs/common';
import {
  CursorQueryDto,
  EntriesQueryDto,
  EntryTagsDto,
  MAX_OFFSET,
  PauseRecordingDto,
  TagEntriesQueryDto,
} from '../../api/dto';
import { MAX_LIMIT } from '../../api/dto/transformers';
import { NestLensValidationPipe } from '../../api/pipes/nestlens-validation.pipe';

const random = (seed: number): (() => number) => {
  let state = seed >>> 0;

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
};

const NAMES = [
  'type',
  'limit',
  'offset',
  'from',
  'to',
  'minDuration',
  'maxDuration',
  'search',
  'tags',
  'logic',
  'statuses',
  'levels',
  'paths',
  'methods',
  'resolved',
  'slow',
  'requestId',
  'beforeSequence',
  'afterSequence',
  '__proto__',
  'constructor',
  'nonsense',
];

const VALUES: unknown[] = [
  '',
  'abc',
  '-1',
  '0',
  '1e308',
  'NaN',
  'null',
  'undefined',
  'true',
  'false',
  '2020-01-01',
  'yesterday',
  'a,b,c',
  'x'.repeat(600),
  Array.from({ length: 300 }, () => 't'),
  ['a', 'b'],
  { nested: true },
  null,
  undefined,
  12,
  -12,
  0.5,
  true,
  '%00',
  '../../etc/passwd',
];

const inputFor = (seed: number): Record<string, unknown> => {
  const next = random(seed);
  const input: Record<string, unknown> = {};

  for (let i = 0; i < 1 + Math.floor(next() * 4); i += 1) {
    input[NAMES[Math.floor(next() * NAMES.length)]] = VALUES[Math.floor(next() * VALUES.length)];
  }

  return input;
};

const SEEDS = Array.from({ length: 400 }, (_, i) => i + 1);

const DTOS = [
  ['the cursor query', CursorQueryDto, 'query'],
  ['the entries query', EntriesQueryDto, 'query'],
  ['the tag query', TagEntriesQueryDto, 'query'],
  ['the tags body', EntryTagsDto, 'body'],
  ['the pause body', PauseRecordingDto, 'body'],
] as const;

const run = async (
  metatype: unknown,
  type: 'query' | 'body',
  value: unknown,
): Promise<{ ok: true; value: unknown } | { ok: false; refusal: unknown }> => {
  try {
    return {
      ok: true,
      value: await new NestLensValidationPipe().transform(value, {
        type,
        metatype,
        data: '',
      } as ArgumentMetadata),
    };
  } catch (error) {
    return { ok: false, refusal: error };
  }
};

describe.each(DTOS)('%s, given anything', (_name, metatype, type) => {
  it('either answers or refuses with 400', async () => {
    const wrong: number[] = [];

    for (const seed of SEEDS) {
      const result = await run(metatype, type, inputFor(seed));
      if (!result.ok && !(result.refusal instanceof BadRequestException)) {
        wrong.push(seed);
      }
    }

    expect(wrong).toEqual([]);
  });

  it('refuses a value that is not an object', async () => {
    for (const value of [[], 'x', 12, true]) {
      const result = await run(metatype, type, value);

      expect(result.ok).toBe(false);
    }
  });

  it('never returns a limit outside its bounds', async () => {
    const wrong: number[] = [];

    for (const seed of SEEDS) {
      const result = await run(metatype, type, inputFor(seed));
      if (!result.ok) continue;

      const { limit } = result.value as { limit?: unknown };
      if (limit !== undefined && (typeof limit !== 'number' || limit < 1 || limit > MAX_LIMIT)) {
        wrong.push(seed);
      }
    }

    expect(wrong).toEqual([]);
  });

  it('never returns an offset outside its bounds', async () => {
    const wrong: number[] = [];

    for (const seed of SEEDS) {
      const result = await run(metatype, type, inputFor(seed));
      if (!result.ok) continue;

      const { offset } = result.value as { offset?: unknown };
      if (
        offset !== undefined &&
        (typeof offset !== 'number' || offset < 0 || offset > MAX_OFFSET)
      ) {
        wrong.push(seed);
      }
    }

    expect(wrong).toEqual([]);
  });

  it('never returns a prototype-polluting key as its own', async () => {
    const polluted: number[] = [];

    for (const seed of SEEDS) {
      const result = await run(metatype, type, inputFor(seed));
      if (!result.ok) continue;

      if (Object.prototype.hasOwnProperty.call(result.value as object, '__proto__')) {
        polluted.push(seed);
      }
      if (({} as Record<string, unknown>).nonsense !== undefined) {
        polluted.push(seed);
      }
    }

    expect(polluted).toEqual([]);
  });
});
