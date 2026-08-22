/**
 * What masking does to the objects an application actually hands it.
 *
 * `maskObject` walked with `Object.entries` and no bound, which decided the
 * fate of four ordinary payloads. Measured before:
 *
 * ```text
 * order.items[0].order === order  ->  RangeError, entry dropped entirely
 * a body nested 20,000 deep       ->  RangeError, entry dropped entirely
 * new Date()                      ->  {}
 * Buffer.from(upload)             ->  {"0":104,"1":105, …} a key per byte
 * [[1,2],[3,4]]                   ->  [{"0":1,"1":2}, …] arrays became objects
 * ```
 *
 * A bidirectional relation is what an ORM gives an event, a job or a cache, so
 * the first line is not an exotic input — those entries simply never appeared
 * in the dashboard, with a warning line as the only evidence.
 *
 * The string branch had its own version of it: a body that parsed as JSON was
 * walked as an object whatever it was, so `123` was recorded as `{}` and
 * `"hello"` as a map of character positions.
 */
import { CollectorService } from '../../core/collector.service';
import { DataMaskerService } from '../../core/data-masker.service';
import { MemoryStorage } from '../../core/storage/memory.storage';
import { NestLensConfig } from '../../nestlens.config';
import { Entry } from '../../types';

const masker = new DataMaskerService({});
const mask = (body: unknown): unknown => masker.maskBody(body);

describe('masking a payload that refers back to itself', () => {
  it('records the reference instead of following it', () => {
    const order: Record<string, unknown> = { id: 1, items: [] as unknown[] };
    (order.items as unknown[]).push({ id: 10, order });

    expect(mask(order)).toEqual({ id: 1, items: [{ id: 10, order: '[Circular]' }] });
  });

  it('still masks the rest of the payload', () => {
    const user: Record<string, unknown> = { password: 'hunter2' };
    user.self = user;

    expect(mask(user)).toEqual({ password: '***REDACTED***', self: '[Circular]' });
  });

  it('does not mistake the same object twice for a cycle', () => {
    // Siblings, not a loop: both have to survive.
    const shared = { a: 1 };

    expect(mask({ x: shared, y: shared })).toEqual({ x: { a: 1 }, y: { a: 1 } });
  });

  it('handles a cycle through an array', () => {
    const list: unknown[] = [];
    list.push(list);

    expect(mask({ list })).toEqual({ list: ['[Circular]'] });
  });
});

describe('masking a payload deeper than the limit', () => {
  const nest = (levels: number): Record<string, unknown> => {
    const root: Record<string, unknown> = {};
    let node = root;
    for (let i = 0; i < levels; i += 1) {
      const next: Record<string, unknown> = {};
      node.next = next;
      node = next;
    }
    return root;
  };

  it('returns rather than overflowing the stack', () => {
    expect(() => mask(nest(20_000))).not.toThrow();
  });

  it('says where it stopped', () => {
    expect(JSON.stringify(mask(nest(100)))).toContain('[Max depth exceeded]');
  });

  it('keeps a payload of ordinary depth whole', () => {
    const ordinary = { a: { b: { c: { d: { e: 'value' } } } } };

    expect(mask(ordinary)).toEqual(ordinary);
  });
});

describe('masking objects that do not keep their contents in properties', () => {
  it('records a date as its timestamp', () => {
    expect(mask({ createdAt: new Date('2020-01-01T00:00:00Z') })).toEqual({
      createdAt: '2020-01-01T00:00:00.000Z',
    });
  });

  it('records an invalid date as one', () => {
    expect(mask({ when: new Date('nonsense') })).toEqual({ when: '[Invalid Date]' });
  });

  it('records a buffer by its size rather than byte by byte', () => {
    expect(mask({ upload: Buffer.alloc(1_048_576) })).toEqual({
      upload: '[Buffer 1048576 bytes]',
    });
  });

  it('records a typed array the same way', () => {
    expect(mask({ pixels: new Uint16Array(4) })).toEqual({ pixels: '[Uint16Array 8 bytes]' });
  });

  it.each([
    ['a map', { m: new Map([['a', 1]]) }, { m: '[Map 1 entries]' }],
    ['a set', { s: new Set([1, 2]) }, { s: '[Set 2 items]' }],
    ['a pattern', { r: /ab+c/gi }, { r: '/ab+c/gi' }],
  ])('records %s readably', (_name, input, expected) => {
    expect(mask(input)).toEqual(expected);
  });

  it('keeps an error’s name, message and stack', () => {
    const error = new Error('job failed');
    error.stack = 'Error: job failed\n    at handler (node:internal/x:1:1)';

    expect(mask({ error })).toEqual({
      error: {
        name: 'Error',
        message: 'job failed',
        stack: 'Error: job failed\n    at handler (node:internal/x:1:1)',
      },
    });
  });

  it('keeps nested arrays as arrays', () => {
    expect(
      mask({
        matrix: [
          [1, 2],
          [3, 4],
        ],
      }),
    ).toEqual({
      matrix: [
        [1, 2],
        [3, 4],
      ],
    });
  });

  it('still masks fields inside an array of objects', () => {
    expect(mask({ users: [{ name: 'ada', password: 'x' }] })).toEqual({
      users: [{ name: 'ada', password: '***REDACTED***' }],
    });
  });
});

describe('masking a value the storage cannot serialise', () => {
  /**
   * The file and Redis drivers write `JSON.stringify(payload)`, which refuses
   * a bigint rather than skipping it. A bigint column read through Prisma, a
   * job id, a balance — anywhere in a payload — made `save` throw, and the
   * collector reads a throwing save as storage being down: the entry goes back
   * in the buffer and fails every flush after it, taking the entries behind it
   * with it until the buffer's ceiling drops it a thousand entries later.
   */
  it('records a bigint as it is printed', () => {
    expect(mask({ orderId: 10n })).toEqual({ orderId: '10n' });
  });

  it('records one past what a number can hold', () => {
    expect(mask({ id: 9007199254740993n })).toEqual({ id: '9007199254740993n' });
  });

  it('records one nested in an array', () => {
    expect(mask({ ids: [1n, 2n] })).toEqual({ ids: ['1n', '2n'] });
  });

  it.each([
    ['a bigint', { id: 1n }],
    [
      'a cycle',
      (() => {
        const node: Record<string, unknown> = { id: 1 };
        node.self = node;
        return node;
      })(),
    ],
    ['a buffer', { file: Buffer.alloc(8) }],
    ['a date', { at: new Date() }],
    ['a map', { m: new Map([['a', 1n]]) }],
    [
      'a deep payload',
      (() => {
        const root: Record<string, unknown> = {};
        let node = root;
        for (let i = 0; i < 200; i += 1) {
          const next: Record<string, unknown> = {};
          node.next = next;
          node = next;
        }
        return root;
      })(),
    ],
  ])('leaves %s in a shape the storage can write', (_name, payload) => {
    // The invariant the file and Redis drivers depend on.
    expect(() => JSON.stringify(mask(payload))).not.toThrow();
  });
});

describe('masking a body that arrived as text', () => {
  it.each([
    ['a number', '123'],
    ['a boolean', 'true'],
    ['a quoted string', '"hello"'],
    ['text that is not JSON', 'plain text'],
    // Written back through JSON these lose what the application wrote: the
    // trailing zero, the padding, the exponent.
    ['a number as it was written', '1.50'],
    ['an exponent', '1e3'],
    ['a padded value', ' "hello" '],
  ])('leaves %s as it was', (_name, body) => {
    expect(mask(body)).toBe(body);
  });

  it('keeps a JSON array an array', () => {
    expect(mask('[1,2]')).toBe('[1,2]');
  });

  it('still masks a JSON object', () => {
    expect(mask('{"a":1,"password":"p"}')).toBe('{"a":1,"password":"***REDACTED***"}');
  });

  it('still masks inside a JSON array', () => {
    expect(mask('[{"token":"t"}]')).toBe('[{"token":"***REDACTED***"}]');
  });
});

describe('collecting an entry whose payload is an ORM relation', () => {
  it('reaches storage', async () => {
    const storage = new MemoryStorage({} as never);
    const collector = new CollectorService(
      storage,
      {} as NestLensConfig,
      new DataMaskerService({}),
    );

    const order: Record<string, unknown> = { id: 1, items: [] as unknown[] };
    (order.items as unknown[]).push({ id: 10, order });

    await collector.collect('event', { name: 'order.created', payload: order } as never);
    await collector.flush();

    const stored = (await storage.find({})) as Entry[];
    expect(stored).toHaveLength(1);

    await collector.onModuleDestroy();
    await storage.close();
  });
});
