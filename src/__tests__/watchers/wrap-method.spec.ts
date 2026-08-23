import { wrapMethodPreservingShape } from '../../watchers/wrap-method';

/**
 * A method that answers with a thenable of its own keeps answering with it.
 *
 * The wrapper used to return `Promise.resolve(result).then(…)`, which is a
 * native promise — so a method handing back something that is thenable *and*
 * carries an API handed the caller something else:
 *
 *     repo.find()          a QueryBuilder: thenable, plus `.where`, `.tap`, …
 *     wrapped repo.find()  a Promise: thenable, and nothing else
 *
 * TypeORM's QueryBuilder and Mongoose's Query are both that shape, and a
 * service method returning one is ordinary. Enabling a watcher must not change
 * what a caller receives.
 */
describe('wrapping a method that returns a thenable of its own', () => {
  class Rows {
    constructor(private readonly value: string) {}
    tap(fn: (value: string) => void): this {
      fn(this.value);
      return this;
    }
    then<T>(onOk: (value: string) => T): Promise<T> {
      return Promise.resolve(onOk(this.value));
    }
  }

  it('gives the caller back what the method returned', async () => {
    const wrapped = wrapMethodPreservingShape(
      () => new Rows('rows'),
      () => undefined,
    );

    const result = wrapped();

    expect(result).toBeInstanceOf(Rows);
    expect(typeof (result as Rows).tap).toBe('function');
    expect(await result).toBe('rows');
  });

  it('records the value it settled with', async () => {
    const outcomes: unknown[] = [];
    const wrapped = wrapMethodPreservingShape(
      () => new Rows('rows'),
      (outcome) => outcomes.push(outcome.result),
    );

    await wrapped();

    expect(outcomes).toEqual(['rows']);
  });

  it('records a rejection without swallowing it', async () => {
    const errors: unknown[] = [];
    const wrapped = wrapMethodPreservingShape(
      () => Promise.reject(new Error('no')),
      (outcome) => errors.push(outcome.error),
    );

    await expect(wrapped()).rejects.toThrow('no');
    expect((errors[0] as Error).message).toBe('no');
  });

  it('records before the caller continues', async () => {
    const order: string[] = [];
    const wrapped = wrapMethodPreservingShape(
      async () => 'v',
      () => order.push('recorded'),
    );

    await (wrapped() as Promise<string>).then(() => order.push('caller'));

    expect(order).toEqual(['recorded', 'caller']);
  });

  it('does not fail the call when the thenable refuses to be watched', () => {
    const hostile = {
      then() {
        throw new Error('cannot attach');
      },
    };
    const wrapped = wrapMethodPreservingShape(
      () => hostile,
      () => undefined,
    );

    expect(wrapped()).toBe(hostile);
  });
});
