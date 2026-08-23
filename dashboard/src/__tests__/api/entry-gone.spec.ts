/**
 * A 404 from the API is a different thing from a failure.
 *
 * Pruning deletes by age and every store evicts by size, so an entry can go
 * while the page listing it is open. Told apart here, once, so a caller can do
 * the sensible thing — say it is gone, stop showing it — instead of offering a
 * retry that will never work.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { EntryGoneError, resolveEntry, getEntry } from '../../api';

const answering = (status: number): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => ({ success: true, data: null }),
    }),
  );
};

describe('what the API layer makes of a status', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('turns 404 into an entry that is gone', async () => {
    answering(404);

    await expect(resolveEntry(7)).rejects.toBeInstanceOf(EntryGoneError);
  });

  it('says what it means in words a reader can act on', async () => {
    answering(404);

    await expect(resolveEntry(7)).rejects.toThrow('This entry is no longer stored');
  });

  it('leaves every other failure as it was', async () => {
    answering(500);

    await expect(getEntry(7)).rejects.toThrow('API error: 500');
    await expect(getEntry(7)).rejects.not.toBeInstanceOf(EntryGoneError);
  });

  it('still returns the body when the call succeeds', async () => {
    answering(200);

    await expect(resolveEntry(7)).resolves.toEqual({ success: true, data: null });
  });
});
