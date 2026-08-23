/**
 * Resolving an entry that is no longer stored.
 *
 * The endpoint marked it, read it back and answered `success: true` with
 * `data: null` — a success for something that did not happen. Both ways an
 * entry can vanish are ordinary while a page is open: pruning deletes by age,
 * and every store evicts by size once it is full.
 *
 * The dashboard applied what came back to the row it had clicked, so `null`
 * reached a list update and failed there instead, telling the reader about a
 * property of null.
 */
import { NestLensApiController } from '../../api/api.controller';
import { StorageInterface } from '../../core/storage/storage.interface';
import { CollectorService, PruningService } from '../../core';
import { NestLensConfig } from '../../nestlens.config';
import { Entry } from '../../types';

const controllerOver = (entry: Entry | null): NestLensApiController => {
  const storage = {
    resolveEntry: jest.fn(async () => undefined),
    unresolveEntry: jest.fn(async () => undefined),
    findById: jest.fn(async () => entry),
  } as unknown as StorageInterface;

  return new NestLensApiController(
    storage,
    {} as NestLensConfig,
    {} as PruningService,
    {} as CollectorService,
  );
};

const exception = (): Entry =>
  ({ id: 7, type: 'exception', payload: { name: 'Error', message: 'boom' } }) as unknown as Entry;

describe('resolving an entry that is not there', () => {
  it('says so rather than reporting success', async () => {
    await expect(controllerOver(null).resolveEntry(999)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('says so when unresolving too', async () => {
    await expect(controllerOver(null).unresolveEntry(999)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('names the entry it could not find', async () => {
    await expect(controllerOver(null).resolveEntry(999)).rejects.toThrow(/999/);
  });

  it('still answers with the entry when it is there', async () => {
    const answer = await controllerOver(exception()).resolveEntry(7);

    expect(answer).toEqual({ success: true, data: exception() });
  });

  it('still answers with the entry when unresolving one that is there', async () => {
    const answer = await controllerOver(exception()).unresolveEntry(7);

    expect(answer).toEqual({ success: true, data: exception() });
  });
});
