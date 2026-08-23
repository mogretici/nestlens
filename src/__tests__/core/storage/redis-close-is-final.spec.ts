/**
 * Closing a Redis storage has to end it, even mid-connection.
 *
 * `close()` disconnected `this.client` — and an `initialize()` that was still
 * running had not assigned one yet, so there was nothing to disconnect and the
 * client it created a moment later stayed connected, retrying a server nobody
 * could reach for as long as the process lived. The process therefore never
 * ended.
 *
 * Measured on CI, where nine compatibility jobs pointed at a Redis that was
 * never started: the suite failed at 20:30:09, printed `Redis storage closed`,
 * and the job was still running when its fifteen-minute timeout cancelled it —
 * eleven minutes of a runner spent on a socket nobody was listening to.
 *
 * The same shape reaches an application: shutting down while Redis is
 * unreachable would hang on exit.
 */
import { RedisStorage } from '../../../core/storage/redis.storage';

/** A port nothing is listening on, so the client can never become ready. */
const UNREACHABLE = 'redis://127.0.0.1:6399';

const clientOf = (storage: RedisStorage): unknown =>
  (storage as unknown as { client: unknown }).client;

describe('closing a Redis storage that never connected', () => {
  jest.setTimeout(20_000);

  it('leaves no client behind when close arrives first', async () => {
    const storage = new RedisStorage({ url: UNREACHABLE, commandTimeout: 200 });

    // Not awaited, which is what a caller with a deadline does.
    const initializing = storage.initialize().catch(() => undefined);
    await storage.close();
    await initializing;

    expect(clientOf(storage)).toBeNull();
  });

  it('leaves no client behind when close arrives during the first command', async () => {
    const storage = new RedisStorage({ url: UNREACHABLE, commandTimeout: 200 });

    const initializing = storage.initialize().catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await storage.close();
    await initializing;

    expect(clientOf(storage)).toBeNull();
  });

  it('stays closed', async () => {
    // A storage that was closed does not quietly come back on the next call:
    // whatever asked for it is talking to something the application has shut
    // down.
    const storage = new RedisStorage({ url: UNREACHABLE, commandTimeout: 200 });

    await storage.close();
    await storage.initialize().catch(() => undefined);

    expect(clientOf(storage)).toBeNull();
  });

  it('closes twice without complaint', async () => {
    const storage = new RedisStorage({ url: UNREACHABLE, commandTimeout: 200 });

    await storage.close();

    await expect(storage.close()).resolves.toBeUndefined();
  });
});
