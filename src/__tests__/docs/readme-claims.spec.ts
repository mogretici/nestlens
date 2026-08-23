/**
 * What the first page a reader sees promises has to be what happens.
 *
 * The README said NestLens *auto-detects TypeORM, Prisma, Bull, and more*
 * under a heading of *Zero Configuration*. One of the three is true: TypeORM's
 * DataSources are discovered through Nest's own container. Prisma needs
 * `setupPrismaClient()` and Bull needs `setupQueue()`, both of which the
 * watchers say out loud when they start:
 *
 * ```text
 * JobWatcher: To enable job tracking, call setupQueue() manually …
 * ModelWatcher: … For Prisma, use the setupPrismaClient() method manually.
 * ```
 *
 * A reader who believes the promise enables the watcher, sees nothing, and
 * concludes the library is broken.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { JobWatcher } from '../../watchers/job.watcher';
import { ModelWatcher } from '../../watchers/model.watcher';
import { QueryWatcher } from '../../watchers/query/query.watcher';

const readme = readFileSync(join(__dirname, '..', '..', '..', 'README.md'), 'utf8');

describe('the README on what is automatic', () => {
  it('does not claim Prisma is detected', () => {
    // `setupPrismaClient` is the only way in, and it is the reader's call.
    expect(ModelWatcher.prototype.setupPrismaClient).toBeInstanceOf(Function);
    expect(readme).not.toMatch(/auto-detects[^.]*Prisma/i);
  });

  it('does not claim Bull is detected', () => {
    expect(JobWatcher.prototype.setupQueue).toBeInstanceOf(Function);
    expect(readme).not.toMatch(/auto-detects[^.]*Bull/i);
  });

  it('still says TypeORM queries are found on their own, because they are', () => {
    // Discovered through Nest's container; nothing is asked of the reader.
    expect(
      (QueryWatcher.prototype as unknown as Record<string, unknown>).discoverTypeORMDataSources,
    ).toBeInstanceOf(Function);
    expect(readme).toMatch(/TypeORM/);
  });

  it('says the rest takes a line', () => {
    expect(readme).toMatch(/one line each/i);
  });
});
