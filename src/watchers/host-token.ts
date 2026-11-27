import { Logger, Scope } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

/**
 * The application's own client or service, found wherever it was provided.
 *
 * A watcher that records a host object takes it under a token. Injected into
 * the watcher's constructor, the token resolves only inside `NestLensModule`,
 * its imports and the global modules — and every page showed it provided in
 * `AppModule`, from where it never arrived. The watcher logged at debug level
 * that it had nothing to watch, and recorded nothing.
 *
 * So the injected value is used when there is one, and otherwise the whole
 * container is asked. This runs in `onModuleInit`, by which point Nest has
 * created every provider of every module, async factories included.
 *
 * A request- or transient-scoped provider has no single instance to wrap: each
 * request gets a new one, and `get()` cannot hand any of them out. That is
 * refused, and said, rather than left for the reader to discover as silence.
 */
export const resolveHost = <T>(
  injected: T | undefined,
  moduleRef: ModuleRef | undefined,
  token: string | symbol,
  logger: Logger,
): T | undefined => resolveHosts(injected, moduleRef, token, logger)[0];

/**
 * Every instance provided under `token`, or the injected one.
 *
 * `CacheModule.register()` in two feature modules is two `CACHE_MANAGER`s, and
 * `get(token, { strict: false })` hands back one of them, so the other went
 * unrecorded without a word. `{ each: true }` lists them all.
 */
export const resolveHosts = <T>(
  injected: T | undefined,
  moduleRef: ModuleRef | undefined,
  token: string | symbol,
  logger: Logger,
): T[] => {
  if (injected !== undefined && injected !== null) return [injected];
  if (!moduleRef) return [];

  const name = typeof token === 'symbol' ? (token.description ?? String(token)) : token;

  let scope: Scope | undefined;
  try {
    scope = moduleRef.introspect(token).scope;
  } catch {
    // Not provided anywhere.
    return [];
  }

  if (scope !== undefined && scope !== Scope.DEFAULT) {
    logger.warn(
      `${name} is ${scope === Scope.REQUEST ? 'request' : 'transient'}-scoped, so there is no ` +
        'single instance to record and nothing is being recorded for it. Provide it as a ' +
        'singleton — the default scope — for this watcher to see it.',
    );
    return [];
  }

  let found: T[];
  try {
    found = moduleRef.get<T, T>(token, { strict: false, each: true });
  } catch {
    return [];
  }

  return [...new Set(found.filter((instance) => instance !== undefined && instance !== null))];
};

/** Which watchers are recording a host, on the host itself. */
const WATCHED_BY = Symbol.for('nestlens:watched-by');

type Watched = { [WATCHED_BY]?: Set<string> };

/**
 * Takes a host for one watcher, unless another copy of that watcher has it.
 *
 * Two `NestLensModule.forRoot()` imports are two sets of watchers looking up
 * the same token, and both wrapped what they found: every call was recorded
 * twice. The mark lives on the host — a symbol from the global registry, like
 * the Prisma watcher's — so it holds across module instances and package
 * copies alike, and it is not enumerable, so the host's own shape is unchanged.
 */
export const claimHost = (host: unknown, watcher: string, logger: Logger): boolean => {
  if (!host || (typeof host !== 'object' && typeof host !== 'function')) return true;

  const marked = host as Watched;
  if (!marked[WATCHED_BY]) {
    Object.defineProperty(marked, WATCHED_BY, { value: new Set<string>(), configurable: true });
  }

  const watchers = marked[WATCHED_BY] as Set<string>;
  if (watchers.has(watcher)) {
    logger.debug(`${watcher}: already recorded by another NestLensModule; not wrapping it twice.`);
    return false;
  }

  watchers.add(watcher);
  return true;
};

/** Gives the host back: another module may take it after this one closes. */
export const releaseHost = (host: unknown, watcher: string): void => {
  const watchers = (host as Watched | undefined)?.[WATCHED_BY];
  if (!watchers) return;

  watchers.delete(watcher);
  if (watchers.size === 0) delete (host as Watched)[WATCHED_BY];
};

/** A lifecycle a watcher of a second host is driven through. */
export interface HostWatcherLifecycle {
  onModuleInit(): void;
  onModuleDestroy(): void;
}

/**
 * Resolves the hosts for a watcher and hands back the one it watches itself.
 *
 * The first host the watcher takes; each further one gets a watcher of its own,
 * built by `sibling` and driven through the same lifecycle, so every host is
 * recorded by the code that already records one, and given back by it.
 */
export const attachHosts = <T, W extends HostWatcherLifecycle>(options: {
  injected: T | undefined;
  moduleRef: ModuleRef | undefined;
  token: string | symbol;
  logger: Logger;
  watcher: string;
  sibling: (host: T) => W;
}): { host: T | undefined; siblings: W[] } => {
  const [first, ...others] = resolveHosts(
    options.injected,
    options.moduleRef,
    options.token,
    options.logger,
  );

  const siblings = others.map((host) => {
    const sibling = options.sibling(host);
    sibling.onModuleInit();
    return sibling;
  });

  const host =
    first !== undefined && claimHost(first, options.watcher, options.logger) ? first : undefined;
  return { host, siblings };
};
