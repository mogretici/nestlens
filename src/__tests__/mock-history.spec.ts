import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Vitest 5 clears every mock's call history before each test (`clearMocks`
// defaults to true), ahead of the test's `beforeEach` hooks. A call made in
// `beforeAll` or at module scope is gone by the time a test reads it: assert
// on it inside the hook, or make it in `beforeEach`.
describe('mock call history', () => {
  const fn = vi.fn();

  beforeAll(() => {
    fn('from beforeAll');
  });

  beforeEach(() => {
    fn('from beforeEach');
  });

  it('holds what the beforeEach recorded, not what the beforeAll did', () => {
    expect(fn.mock.calls).toEqual([['from beforeEach']]);
  });

  it('does not carry calls from one test into the next', () => {
    fn('from the test');
    expect(fn.mock.calls).toEqual([['from beforeEach'], ['from the test']]);
  });
});
