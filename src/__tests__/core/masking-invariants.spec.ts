/**
 * What must hold for every payload, not only the ones somebody thought of.
 *
 * Masking is the one function every recorded byte passes through, and this
 * session found five ways it could fail on payloads an application produces
 * without trying: a bidirectional relation, a bigint, a Buffer, a `toJSON`
 * that throws, a value shared at every level. Each was fixed with a test for
 * that shape.
 *
 * These are the rules those fixes are instances of, checked against payloads
 * assembled at random from the shapes an application actually holds:
 *
 *   1. masking never throws
 *   2. what it returns can be written to storage
 *   3. what it returns is bounded, whatever came in
 *   4. what it returns carries no value a sensitive name was attached to
 */
import { DataMaskerService } from '../../core/data-masker.service';
import { serializePayload } from '../../core/storage/serialize-payload';

const masker = new DataMaskerService({});

/** Deterministic, so a failure can be reproduced from its seed. */
const random = (seed: number): (() => number) => {
  let state = seed >>> 0;

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
};

const SECRET = 'hunter2';

/** One value, from the shapes an application puts in a payload. */
const shape = (next: () => number, depth: number, root: object): unknown => {
  const pick = Math.floor(next() * 16);

  switch (pick) {
    case 0:
      return 'a string';
    case 1:
      return Math.floor(next() * 1_000);
    case 2:
      return next() > 0.5;
    case 3:
      return null;
    case 4:
      return undefined;
    case 5:
      return new Date(Math.floor(next() * 1e12));
    case 6:
      return 10n ** BigInt(Math.floor(next() * 20));
    case 7:
      return Buffer.alloc(Math.floor(next() * 100));
    case 8:
      return new Map([['a', 1]]);
    case 9:
      return new Set([1, 2]);
    case 10:
      return /ab+c/gi;
    case 11:
      return new Error('boom');
    case 12:
      // A reference back into the payload: what an ORM relation is.
      return root;
    case 13:
      return {
        toJSON(): never {
          throw new Error('this object refuses to be serialised');
        },
      };
    case 14:
      return depth > 6 ? 'deep enough' : [shape(next, depth + 1, root)];
    default:
      return depth > 6
        ? 'deep enough'
        : {
            password: SECRET,
            nested: shape(next, depth + 1, root),
            [`key${Math.floor(next() * 5)}`]: shape(next, depth + 1, root),
          };
  }
};

const payloadFor = (seed: number): Record<string, unknown> => {
  const next = random(seed);
  const root: Record<string, unknown> = {};

  root.token = SECRET;
  root.items = Array.from({ length: 1 + Math.floor(next() * 4) }, () => shape(next, 0, root));
  root.detail = shape(next, 0, root);

  return root;
};

const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);

describe('masking any payload an application might hold', () => {
  it('never throws', () => {
    const thrown = SEEDS.filter((seed) => {
      try {
        masker.maskBody(payloadFor(seed));
        return false;
      } catch {
        return true;
      }
    });

    expect(thrown).toEqual([]);
  });

  it('returns something the storage can write', () => {
    const unwritable = SEEDS.filter((seed) => {
      const masked = masker.maskBody(payloadFor(seed));

      try {
        JSON.stringify(masked);
        return false;
      } catch {
        return true;
      }
    });

    expect(unwritable).toEqual([]);
  });

  it('returns something bounded', () => {
    const oversized = SEEDS.filter(
      (seed) => serializePayload(masker.maskBody(payloadFor(seed))).length > 2_000_000,
    );

    expect(oversized).toEqual([]);
  });

  it('keeps no value that was under a sensitive name', () => {
    const leaked = SEEDS.filter((seed) =>
      serializePayload(masker.maskBody(payloadFor(seed))).includes(SECRET),
    );

    expect(leaked).toEqual([]);
  });

  it('finishes quickly', () => {
    const started = Date.now();

    for (const seed of SEEDS) {
      masker.maskBody(payloadFor(seed));
    }

    expect(Date.now() - started).toBeLessThan(5_000);
  });
});
