import { mkdtempSync, rmSync } from 'fs';
import { createServer, Server } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';

const listening = (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

const close = (server: Server): Promise<void> =>
  new Promise((resolve) => {
    if (!server.listening) return resolve();
    server.close(() => resolve());
  });

describe('the loopback listen guard in setup.ts', () => {
  let server: Server;

  beforeEach(() => {
    server = createServer();
  });

  afterEach(async () => {
    await close(server);
  });

  it.each([
    ['no arguments', []],
    ['a port alone', [0]],
    ['a port and a callback', [0, (): void => undefined]],
    ['a port and a backlog', [0, 511]],
    ['a numeric string port', ['0']],
    ['the IPv6 wildcard', [0, '::']],
    ['the IPv4 wildcard', [0, '0.0.0.0']],
    ['an empty host', [0, '']],
    ['an options object without a host', [{ port: 0 }]],
    ['an options object with the IPv6 wildcard', [{ port: 0, host: '::' }]],
    ['an options object with the IPv4 wildcard', [{ port: 0, host: '0.0.0.0' }]],
    ['an empty options object', [{}]],
  ])('refuses %s', (_label, args) => {
    expect(() => (server.listen as (...a: unknown[]) => Server)(...args)).toThrow(
      /listen on 127\.0\.0\.1 — a wildcard port can be shadowed by another process's loopback listener/,
    );
    expect(server.listening).toBe(false);
  });

  it.each([
    ['a port and 127.0.0.1', [0, '127.0.0.1']],
    ['a port and ::1', [0, '::1']],
    ['a port and localhost', [0, 'localhost']],
    ['an options object with 127.0.0.1', [{ port: 0, host: '127.0.0.1' }]],
  ])('allows %s', async (_label, args) => {
    const ready = listening(server);
    (server.listen as (...a: unknown[]) => Server)(...args);
    await ready;

    expect(server.listening).toBe(true);
  });

  it('allows a Unix socket path, as a string and as an option', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nestlens-listen-'));
    const other = createServer();

    try {
      const first = listening(server);
      server.listen(join(dir, 'a.sock'));
      await first;

      const second = listening(other);
      other.listen({ path: join(dir, 'b.sock') });
      await second;

      expect(server.listening && other.listening).toBe(true);
    } finally {
      await close(other);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('allows an already-bound handle', async () => {
    const bound = createServer();
    const ready = listening(bound);
    bound.listen(0, '127.0.0.1');
    await ready;

    const adopted = listening(server);
    server.listen(bound);
    await adopted;

    expect(server.listening).toBe(true);
    await close(bound);
  });
});
