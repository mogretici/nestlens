/**
 * What a Redis that is not there costs the application.
 *
 * NestLens tolerates an unreachable server on the way up — a debugging tool
 * does not get to stop an application from starting — and two things then went
 * wrong on the way down and in between.
 *
 * **Closing ended the process.** `close()` called `quit()`, which sends a
 * command and waits for the answer. Against a server that never accepted the
 * connection it waited out the command timeout and then rejected, from
 * `onModuleDestroy`, where nothing catches it:
 *
 *     Error: Command timed out
 *         at Timeout._onTimeout (ioredis/built/Command.js:192:33)
 *
 * **And it filled the host's logs.** With no `error` listener, ioredis prints
 * `[ioredis] Unhandled error event: Error: connect ECONNREFUSED …` on every
 * reconnection attempt, for as long as the process lives — into the logs of
 * the application NestLens exists to help somebody read.
 */
import { Logger } from '@nestjs/common';
import { RedisStorage } from '../../../core/storage/redis.storage';

/** A port nothing is listening on. */
const DEAD_PORT = 6399;

const unreachable = (): RedisStorage =>
  new RedisStorage({ host: '127.0.0.1', port: DEAD_PORT, commandTimeout: 300 });

describe('a Redis that cannot be reached', () => {
  jest.setTimeout(30_000);

  let warnings: string[];
  let spies: jest.SpyInstance[];

  beforeEach(() => {
    warnings = [];
    spies = [
      jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation((message: unknown) => void warnings.push(String(message))),
      jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined),
    ];
  });

  afterEach(() => {
    spies.forEach((spy) => spy.mockRestore());
  });

  it('still lets the storage start', async () => {
    const storage = unreachable();

    await expect(storage.initialize()).resolves.toBeUndefined();

    await storage.close();
  });

  it('closes without rejecting', async () => {
    // The failure: this rejected out of `onModuleDestroy` and ended the
    // process on an unhandled rejection.
    const storage = unreachable();
    await storage.initialize();

    await expect(storage.close()).resolves.toBeUndefined();
  });

  it('closes promptly rather than waiting out the command timeout', async () => {
    const storage = unreachable();
    await storage.initialize();

    const started = Date.now();
    await storage.close();

    // Asking a client that is not ready costs the whole timeout for an answer
    // that cannot come.
    expect(Date.now() - started).toBeLessThan(250);
  });

  it('is safe to close twice', async () => {
    const storage = unreachable();
    await storage.initialize();

    await storage.close();
    await expect(storage.close()).resolves.toBeUndefined();
  });

  it('says the connection failed, once', async () => {
    const storage = unreachable();
    await storage.initialize();

    const connectionWarnings = warnings.filter((line) => line.includes('Redis connection error'));

    expect(connectionWarnings).toHaveLength(1);
    expect(connectionWarnings[0]).toContain('ECONNREFUSED');

    await storage.close();
  });

  it('says entries are not being stored, so the silence is explained', async () => {
    const storage = unreachable();
    await storage.initialize();

    expect(warnings.join('\n')).toContain('not being stored');

    await storage.close();
  });

  it('does not repeat itself while the server stays down', async () => {
    // ioredis retries for as long as it is allowed to, and the hundredth
    // failure is the same news as the first.
    const storage = unreachable();
    await storage.initialize();

    await new Promise((resolve) => setTimeout(resolve, 1_500));

    expect(warnings.filter((line) => line.includes('Redis connection error'))).toHaveLength(1);

    await storage.close();
  });
});
