/**
 * `release` gives back exactly what this application took, and nothing else.
 *
 * A host is marked per watcher with the application that holds it. Releasing
 * removes that application's mark and leaves another application's alone; a
 * host that was never marked — `identify` answered with a primitive, or with
 * nothing — has no mark to remove, and releasing it must not throw on the way
 * out of an application that is closing.
 *
 * Following AAA (Arrange-Act-Assert).
 */
import { describe, it, expect } from 'vitest';
import { Logger } from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';
import { attachHosts } from '../../watchers/host-token';

const WATCHED_BY = Symbol.for('nestlens:watched-by');

/** A ModuleRef with no container behind it: the application is the ref itself. */
const application = (): ModuleRef =>
  ({
    get: () => {
      throw new Error('not provided');
    },
  }) as unknown as ModuleRef;

const attach = (
  host: unknown,
  moduleRef: ModuleRef,
  identify?: (host: unknown) => unknown,
): ReturnType<typeof attachHosts<unknown, never>> =>
  attachHosts<unknown, never>({
    injected: host,
    moduleRef,
    token: 'HOST',
    logger: new Logger('host-release'),
    watcher: 'gate',
    sibling: () => {
      throw new Error('one host, no siblings');
    },
    identify,
  });

describe('releasing a host', () => {
  it('removes the mark of the application that took it', () => {
    const host = {};
    const { release } = attach(host, application());

    release();

    expect(Object.getOwnPropertySymbols(host)).not.toContain(WATCHED_BY);
  });

  it('leaves the mark of an application that took it afterwards', () => {
    const host = {} as Record<symbol, Map<string, object>>;
    const first = application();
    const second = application();
    const { release } = attach(host, first);
    attach(host, second);

    release();

    expect(host[WATCHED_BY]?.get('gate')).toBe(second);
  });

  it.each([undefined, null, 0, '', false, 'a string'])(
    'does nothing for a host identified as %j, which was never marked',
    (id) => {
      const { release } = attach({}, application(), () => id);

      expect(() => release()).not.toThrow();
    },
  );
});
