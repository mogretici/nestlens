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
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
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
  let errorSpy: MockInstance;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'nestlens-open-'));
    errors = [];
    errorSpy = vi
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
    //
    // The error is raised by the mocked constructor, not by the factory:
    // Vitest wraps a factory's error in its own, without the `code`. Both the
    // import and the construction sit inside the one `try` this exercises.
    vi.resetModules();
    vi.doMock('../../../core/storage/sqlite.storage', () => ({
      SqliteStorage: class {
        constructor() {
          throw Object.assign(new Error("Cannot find module 'better-sqlite3'"), {
            code: 'MODULE_NOT_FOUND',
          });
        }
      },
    }));

    const { createStorage: freshCreate } = await import('../../../core/storage/storage.factory');

    await expect(
      freshCreate({ driver: 'sqlite', sqlite: { filename: join(workspace, 'y.db') } }),
    ).rejects.toThrow(/better-sqlite3/);

    vi.doUnmock('../../../core/storage/sqlite.storage');
    vi.resetModules();
  });

  describe('a native addon that does not load', () => {
    // npm 12 runs a dependency's install script only when the application's
    // `allowScripts` approves it, and better-sqlite3's is what fetches its
    // addon: the package is installed, the addon is not. A Node upgrade
    // without a rebuild leaves one that `dlopen` refuses. Neither is about
    // the file, and the fallback's advice — move `storage.sqlite.filename` —
    // would send the reader the wrong way.
    //
    // Both errors are the real ones, raised by the loaders better-sqlite3
    // uses, and thrown from the mocked constructor as the earlier test does.
    const neverBuilt = (): Error => {
      const bindings = createRequire(__filename)('bindings') as (options: object) => unknown;
      try {
        bindings({ bindings: 'better_sqlite3.node', module_root: workspace });
      } catch (error) {
        return error as Error;
      }
      throw new Error('bindings found an addon in an empty directory');
    };

    const refusedByDlopen = (): Error => {
      const addon = join(workspace, 'better_sqlite3.node');
      writeFileSync(addon, 'not a shared library');
      try {
        process.dlopen({ exports: {} }, addon);
      } catch (error) {
        return error as Error;
      }
      throw new Error('a text file loaded as an addon');
    };

    const createWith = async (failure: Error): Promise<unknown> => {
      vi.resetModules();
      vi.doMock('../../../core/storage/sqlite.storage', () => ({
        SqliteStorage: class {
          constructor() {
            throw failure;
          }
        },
      }));
      const { createStorage: freshCreate } = await import('../../../core/storage/storage.factory');
      try {
        return await freshCreate({
          driver: 'sqlite',
          sqlite: { filename: join(workspace, 'z.db') },
        });
      } finally {
        vi.doUnmock('../../../core/storage/sqlite.storage');
        vi.resetModules();
      }
    };

    it.each([
      ['was never built', neverBuilt],
      ['will not load', refusedByDlopen],
    ])('fails at startup and says how to build it when it %s', async (_, failure) => {
      const attempt = createWith(failure());

      await expect(attempt).rejects.toThrow(/npm install-scripts approve better-sqlite3/);
      await expect(attempt).rejects.toThrow(/npm rebuild better-sqlite3/);
      expect(errors.join('\n')).not.toContain('storage.sqlite.filename');
    });
  });
});
