/**
 * A storage that cannot be opened must not stop the application.
 *
 * `SqliteStorage` opens its file in the constructor, and anything that went
 * wrong there propagated out of dependency injection. Nest's default is to end
 * the process on a bootstrap failure, so:
 *
 *     read-only directory   ->  application does not start
 *     file is not a database ->  application does not start
 *
 * The default path is `.cache/nestlens.db`, inside the project directory, and a
 * read-only container filesystem is the ordinary case rather than an exotic
 * one. A debugging tool taking the deployment down with it is the worst
 * available outcome, and Redis already behaved the other way — an unreachable
 * server never stopped anything — so SQLite was the one out of step.
 *
 * It falls back to memory now, and says so at error level: falling back quietly
 * would leave a reader wondering why nothing survives a restart.
 */
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Logger } from '@nestjs/common';
import { createStorage } from '../../../core/storage/storage.factory';
import { MemoryStorage } from '../../../core/storage/memory.storage';
import { SqliteStorage } from '../../../core/storage/sqlite.storage';
import { Entry } from '../../../types';

const entry = (): Entry =>
  ({
    type: 'request',
    payload: { method: 'GET', url: '/x', path: '/x', statusCode: 200, duration: 1 },
  }) as unknown as Entry;

describe('opening a storage that cannot be opened', () => {
  let workspace: string;
  let errors: string[];
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'nestlens-open-'));
    errors = [];
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation((message: unknown) => void errors.push(String(message)));
  });

  afterEach(() => {
    errorSpy.mockRestore();
    rmSync(workspace, { recursive: true, force: true });
  });

  describe('a directory that cannot be written', () => {
    let locked: string;

    beforeEach(() => {
      locked = join(workspace, 'locked');
      mkdirSync(locked);
      chmodSync(locked, 0o500);
    });

    afterEach(() => {
      chmodSync(locked, 0o700);
    });

    it('returns a working storage rather than throwing', async () => {
      const storage = await createStorage({
        driver: 'sqlite',
        sqlite: { filename: join(locked, 'x.db') },
      });

      expect(storage).toBeInstanceOf(MemoryStorage);

      const saved = await storage.save(entry());
      expect(saved.id).toBeDefined();

      await storage.close();
    });

    it('says which file, why, and what it did instead', async () => {
      const storage = await createStorage({
        driver: 'sqlite',
        sqlite: { filename: join(locked, 'x.db') },
      });

      const reported = errors.join('\n');
      expect(reported).toContain('x.db');
      expect(reported).toContain('in-memory');
      // The reader has to be able to act on it.
      expect(reported).toContain('storage.sqlite.filename');

      await storage.close();
    });
  });

  it('falls back when the file is not a database', async () => {
    const corrupt = join(workspace, 'corrupt.db');
    writeFileSync(corrupt, 'this is not a database at all');

    const storage = await createStorage({ driver: 'sqlite', sqlite: { filename: corrupt } });

    expect(storage).toBeInstanceOf(MemoryStorage);
    expect(errors.join('\n')).toContain('corrupt.db');

    await storage.close();
  });

  it('still uses SQLite when the file opens', async () => {
    // The fallback must not swallow the working case.
    const storage = await createStorage({
      driver: 'sqlite',
      sqlite: { filename: join(workspace, 'fine.db') },
    });

    expect(storage).toBeInstanceOf(SqliteStorage);
    expect(errors).toHaveLength(0);

    await storage.close();
  });

  it('still explains a missing native module rather than falling back', async () => {
    // A missing dependency is a different problem: the answer is to install it
    // or to choose another driver, and quietly using a third would hide that.
    jest.resetModules();
    jest.doMock('../../../core/storage/sqlite.storage', () => {
      throw Object.assign(new Error("Cannot find module 'better-sqlite3'"), {
        code: 'MODULE_NOT_FOUND',
      });
    });

    const { createStorage: freshCreate } = await import('../../../core/storage/storage.factory');

    await expect(
      freshCreate({ driver: 'sqlite', sqlite: { filename: join(workspace, 'y.db') } }),
    ).rejects.toThrow(/better-sqlite3/);

    jest.dontMock('../../../core/storage/sqlite.storage');
    jest.resetModules();
  });
});
