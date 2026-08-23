/**
 * What a wrapped method must hand back, whatever the original hands back.
 *
 * The watchers replace methods on objects the application owns, and the
 * replacement has to be indistinguishable from what it replaced. Four have
 * broken that rule here: the authorization service, whose synchronous `can`
 * became an always-truthy promise; the view engine, whose rendered string
 * became `[object Promise]` in a response; and the Redis and notification
 * wrappers alongside them.
 *
 * Each was fixed with a test for that method. This checks the rule itself,
 * across the return shapes a method can have — including the ones nobody has
 * written a watcher against yet.
 */
import { wrapMethodPreservingShape } from '../../watchers/wrap-method';

/** A thenable that is not a native promise: Bluebird, Prisma, another realm. */
const thenable = <T>(value: T): PromiseLike<T> => ({
  then: <R>(resolve?: ((value: T) => R | PromiseLike<R>) | null): PromiseLike<R> =>
    thenable(resolve ? (resolve(value) as R) : (undefined as R)),
});

const RETURNS: { name: string; make: () => unknown }[] = [
  { name: 'a string', make: () => 'value' },
  { name: 'a number', make: () => 42 },
  { name: 'false', make: () => false },
  { name: 'zero', make: () => 0 },
  { name: 'an empty string', make: () => '' },
  { name: 'null', make: () => null },
  { name: 'undefined', make: () => undefined },
  { name: 'an object', make: () => ({ id: 1 }) },
  { name: 'an array', make: () => [1, 2, 3] },
  { name: 'a bigint', make: () => 10n },
  { name: 'a symbol', make: () => Symbol.for('nestlens-test') },
  { name: 'a function', make: () => () => 'inner' },
  { name: 'a Buffer', make: () => Buffer.from('hi') },
  { name: 'a Date', make: () => new Date(0) },
  { name: 'a Map', make: () => new Map([['a', 1]]) },
  { name: 'a thenable', make: () => thenable('resolved') },
  { name: 'an iterator', make: () => [1, 2][Symbol.iterator]() },
];

describe('a wrapped method', () => {
  it.each(RETURNS)('gives back $name exactly', ({ make }) => {
    const expected = make();
    const wrapped = wrapMethodPreservingShape(
      () => expected,
      () => undefined,
    );

    const returned = wrapped();

    if (typeof expected === 'object' && expected !== null) {
      expect(returned).toBe(expected);
    } else {
      expect(returned).toEqual(expected);
    }
  });

  it('does not turn a synchronous return into a promise', () => {
    const wrapped = wrapMethodPreservingShape(
      () => false,
      () => undefined,
    );

    expect(wrapped()).toBe(false);
    expect(wrapped()).not.toBeInstanceOf(Promise);
  });

  it('keeps a promise a promise, and its value', async () => {
    const wrapped = wrapMethodPreservingShape(
      async () => 'value',
      () => undefined,
    );

    const returned = wrapped();

    expect(returned).toBeInstanceOf(Promise);
    await expect(returned).resolves.toBe('value');
  });

  it('lets a synchronous throw stay synchronous', () => {
    const wrapped = wrapMethodPreservingShape(
      () => {
        throw new Error('boom');
      },
      () => undefined,
    );

    expect(() => wrapped()).toThrow('boom');
  });

  it('lets a rejection stay a rejection', async () => {
    const wrapped = wrapMethodPreservingShape(
      async () => {
        throw new Error('boom');
      },
      () => undefined,
    );

    await expect(wrapped()).rejects.toThrow('boom');
  });

  it('passes every argument through, in order', () => {
    const seen: unknown[][] = [];
    const wrapped = wrapMethodPreservingShape(
      (...args: unknown[]) => {
        seen.push(args);
        return args.length;
      },
      () => undefined,
    );

    expect(wrapped('a', 2, null, undefined, { x: 1 })).toBe(5);
    expect(seen[0]).toEqual(['a', 2, null, undefined, { x: 1 }]);
  });

  it('calls the original with the receiver it was called on', () => {
    const host = {
      name: 'host',
      method(this: { name: string }): string {
        return this.name;
      },
    };
    host.method = wrapMethodPreservingShape(host.method, () => undefined);

    expect(host.method()).toBe('host');
  });

  it('records every call, whatever it returned', () => {
    let recorded = 0;

    for (const { make } of RETURNS) {
      const wrapped = wrapMethodPreservingShape(make, () => {
        recorded += 1;
      });
      wrapped();
    }

    expect(recorded).toBe(RETURNS.length);
  });

  it('does not let a recording failure reach the caller', () => {
    const wrapped = wrapMethodPreservingShape(
      () => 'value',
      () => {
        throw new Error('the watcher broke');
      },
    );

    expect(wrapped()).toBe('value');
  });

  it('does not let a recording failure reach a caller awaiting a promise', async () => {
    const wrapped = wrapMethodPreservingShape(
      async () => 'value',
      () => {
        throw new Error('the watcher broke');
      },
    );

    await expect(wrapped()).resolves.toBe('value');
  });
});
