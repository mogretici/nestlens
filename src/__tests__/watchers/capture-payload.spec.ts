/**
 * What a watcher records for a value it cannot serialise.
 *
 * Every watcher measured a payload's size with `JSON.stringify` and threw the
 * payload away when it threw — which is exactly what an ORM hands to an event,
 * a job or a cache:
 *
 * ```text
 * emit('order.created', order)   ->  {"_error":"Unable to serialize payload"}
 * ```
 *
 * where `order.items[0].order === order`. The payload was lost at the watcher,
 * before masking — which resolves a reference back into the payload, bounds the
 * depth and bounds how much it walks — ever saw it. So on the page where the
 * event mattered, the entry said nothing.
 */
import { capturePayload } from '../../watchers/capture-payload';

const circular = (): Record<string, unknown> => {
  const order: Record<string, unknown> = { id: 1, items: [] as unknown[] };
  (order.items as unknown[]).push({ id: 10, order });
  return order;
};

describe('capturing a payload', () => {
  it('keeps a small value whole', () => {
    const value = { id: 1, name: 'Ada' };

    expect(capturePayload(value, 1024)).toBe(value);
  });

  it('replaces a large value with its size', () => {
    const value = { blob: 'x'.repeat(2_000) };

    expect(capturePayload(value, 1024)).toEqual({ _truncated: true, _size: expect.any(Number) });
  });

  it('keeps a value that points back at itself', () => {
    const value = circular();

    expect(capturePayload(value, 64 * 1024)).toBe(value);
  });

  it('keeps a value holding a bigint', () => {
    const value = { total: 10n };

    expect(capturePayload(value, 1024)).toBe(value);
  });

  it('keeps a value whose toJSON throws', () => {
    const value = {
      id: 1,
      toJSON(): never {
        throw new Error('no');
      },
    };

    expect(capturePayload(value, 1024)).toBe(value);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
  ])('records nothing for %s', (_name, value) => {
    expect(capturePayload(value, 1024)).toBeUndefined();
  });

  it('captures nothing when the limit is zero', () => {
    // The documented way to keep bodies out of storage entirely.
    expect(capturePayload({ a: 1 }, 0)).toEqual({ _truncated: true, _size: expect.any(Number) });
  });
});
