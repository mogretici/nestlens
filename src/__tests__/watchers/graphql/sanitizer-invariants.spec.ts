/**
 * What the GraphQL sanitizer must hold, for any response or variables.
 *
 * It has its own walk — separate from the collector's masker, because a
 * GraphQL payload is marked as already sanitised and is not walked twice — so
 * the rules the masker was given this session have to be checked here on their
 * own:
 *
 *   1. sanitising never throws
 *   2. what it returns can be written to storage
 *   3. what it returns is bounded
 *   4. no value under a sensitive name survives it
 */
import {
  sanitizeResponse,
  sanitizeVariables,
} from '../../../watchers/graphql/utils/variable-sanitizer';
import { serializePayload } from '../../../core/storage/serialize-payload';

const SENSITIVE = ['password', 'token', 'secret', 'apiKey'];
const SECRET = 'hunter2';

const random = (seed: number): (() => number) => {
  let state = seed >>> 0;

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
};

const shape = (next: () => number, depth: number, root: object): unknown => {
  switch (Math.floor(next() * 12)) {
    case 0:
      return 'a string';
    case 1:
      return Math.floor(next() * 1000);
    case 2:
      return null;
    case 3:
      return new Date(Math.floor(next() * 1e12));
    case 4:
      return 10n;
    case 5:
      return Buffer.alloc(8);
    case 6:
      return root;
    case 7:
      return {
        toJSON(): never {
          throw new Error('refuses');
        },
      };
    case 8:
      return () => 'a function';
    case 9:
      return depth > 5 ? 'deep' : [shape(next, depth + 1, root)];
    default:
      return depth > 5
        ? 'deep'
        : { password: SECRET, token: SECRET, nested: shape(next, depth + 1, root) };
  }
};

const payloadFor = (seed: number): Record<string, unknown> => {
  const next = random(seed);
  const root: Record<string, unknown> = { apiKey: SECRET };

  root.data = shape(next, 0, root);
  root.list = [shape(next, 0, root), shape(next, 0, root)];

  return root;
};

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);

const run = (payload: Record<string, unknown>): unknown[] => [
  sanitizeVariables(payload, SENSITIVE),
  sanitizeResponse(payload, SENSITIVE, 64 * 1024),
];

describe('sanitising any GraphQL payload', () => {
  it('never throws', () => {
    const thrown = SEEDS.filter((seed) => {
      try {
        run(payloadFor(seed));
        return false;
      } catch {
        return true;
      }
    });

    expect(thrown).toEqual([]);
  });

  it('returns something the storage can write', () => {
    const unwritable = SEEDS.filter((seed) =>
      run(payloadFor(seed)).some((value) => {
        try {
          JSON.stringify(value);
          return false;
        } catch {
          return true;
        }
      }),
    );

    expect(unwritable).toEqual([]);
  });

  it('returns something bounded', () => {
    const oversized = SEEDS.filter((seed) =>
      run(payloadFor(seed)).some((value) => serializePayload(value).length > 1_000_000),
    );

    expect(oversized).toEqual([]);
  });

  it('keeps no value that was under a sensitive name', () => {
    const leaked = SEEDS.filter((seed) =>
      run(payloadFor(seed)).some((value) => serializePayload(value).includes(SECRET)),
    );

    expect(leaked).toEqual([]);
  });

  it('finishes quickly', () => {
    const started = Date.now();

    for (const seed of SEEDS) {
      run(payloadFor(seed));
    }

    expect(Date.now() - started).toBeLessThan(5_000);
  });
});
