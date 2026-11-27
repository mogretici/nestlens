import { Logger } from '@nestjs/common';
import { DiscoveryService, ModuleRef, ModulesContainer } from '@nestjs/core';

/*
 * The application's own client or service, found wherever it was provided.
 *
 * A watcher that records a host object takes it under a token. Injected into
 * the watcher's constructor, the token resolves only inside `NestLensModule`,
 * its imports and the global modules — and every page showed it provided in
 * `AppModule`, from where it never arrived. The watcher logged at debug level
 * that it had nothing to watch, and recorded nothing.
 *
 * So the whole container is asked, in `onModuleInit`, by which point Nest has
 * created every provider of every module, async factories included.
 *
 * A request- or transient-scoped provider has no single instance to wrap: each
 * request gets a new one, and `get()` cannot hand any of them out. That is
 * refused, and said, rather than left for the reader to discover as silence.
 */

/**
 * Every instance provided under `token`, the injected one among them.
 *
 * `CacheModule.register()` in two feature modules is two `CACHE_MANAGER`s, and
 * `get(token, { strict: false })` hands back one of them, so the other went
 * unrecorded without a word. Every provider of the token is listed instead,
 * through `DiscoveryService`.
 *
 * The container is asked even when the constructor was handed a host. A host
 * it could reach — `CacheModule.register({ isGlobal: true })` in AppModule —
 * stopped the lookup there, so a second `CacheModule.register()` in a feature
 * module was never recorded. What the constructor received is one answer, not
 * the only one. Without a `ModuleRef` — a watcher built by hand, or one built
 * for a further host — the injected value is all there is.
 */
export const resolveHosts = <T>(
  injected: T | undefined,
  moduleRef: ModuleRef | undefined,
  token: string | symbol,
  logger: Logger,
): T[] => {
  const given = injected !== undefined && injected !== null ? [injected] : [];
  if (!moduleRef) return given;

  let discovery: DiscoveryService;
  try {
    discovery = moduleRef.get(DiscoveryService, { strict: false });
  } catch {
    return given;
  }

  const name = typeof token === 'symbol' ? (token.description ?? String(token)) : token;
  const found: T[] = [];

  // Each provider of the token on its own. `introspect` reads the scope of
  // whichever was registered last, and `get({ each: true })` throws if any one
  // of them is scoped — so a default-scoped host beside a request-scoped one
  // was dropped, with a warning that said nothing was recorded, or with none.
  for (const wrapper of discovery.getProviders()) {
    if (wrapper.token !== token) continue;

    if (wrapper.isTransient || !wrapper.isDependencyTreeStatic()) {
      const where = wrapper.host?.name ? ` in ${wrapper.host.name}` : '';
      logger.warn(
        `${name}${where} is ${wrapper.isTransient ? 'transient' : 'request'}-scoped, so there is ` +
          'no single instance to record and that provider is not recorded. Provide it as a ' +
          'singleton — the default scope — for this watcher to see it.',
      );
      continue;
    }

    if (wrapper.instance !== undefined && wrapper.instance !== null) {
      found.push(wrapper.instance as T);
    }
  }

  return [...new Set([...given, ...found])];
};

/** Which application holds a host for each watcher, on the host itself. */
const WATCHED_BY = Symbol.for('nestlens:watched-by');

type Watched = { [WATCHED_BY]?: Map<string, object> };

/**
 * What identifies one application: its module container, which every module
 * of it shares and no other application does.
 */
const applicationOf = (moduleRef: ModuleRef): object => {
  try {
    return moduleRef.get(ModulesContainer, { strict: false });
  } catch {
    return moduleRef;
  }
};

/**
 * Takes a host for one watcher in one application, unless that application has
 * it already.
 *
 * Two `NestLensModule.forRoot()` imports are two sets of watchers looking up
 * the same token, and both wrapped what they found: every call was recorded
 * twice. The mark lives on the host — a symbol from the global registry, like
 * the Prisma watcher's — so it holds across module instances and package
 * copies alike, and it is not enumerable, so the host's own shape is unchanged.
 *
 * It is kept per application. A mark that only said "taken" outlived a boot
 * that failed — Nest does not call `onModuleDestroy` when `init` rejects — and
 * the next application on the same host found it taken and recorded nothing.
 */
const claimHost = (host: unknown, watcher: string, application: object): boolean => {
  if (!host || (typeof host !== 'object' && typeof host !== 'function')) return true;

  const marked = host as Watched;
  if (!marked[WATCHED_BY]) {
    Object.defineProperty(marked, WATCHED_BY, { value: new Map(), configurable: true });
  }

  const holders = marked[WATCHED_BY] as Map<string, object>;
  if (holders.get(watcher) === application) return false;

  holders.set(watcher, application);
  return true;
};

/** Gives the host back, if this application is the one holding it. */
const releaseHost = (host: unknown, watcher: string, application: object): void => {
  const holders = (host as Watched | undefined)?.[WATCHED_BY];
  if (!holders || holders.get(watcher) !== application) return;

  holders.delete(watcher);
  if (holders.size === 0) delete (host as Watched)[WATCHED_BY];
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
 * `identify` names the object the watcher actually installs on — an
 * `HttpService` is recorded through its `axiosRef` — so two ways of reaching
 * one object are one host. `release` gives back exactly what was taken, and is
 * a no-op for a watcher that took nothing.
 */
export const attachHosts = <T, W extends HostWatcherLifecycle>(options: {
  injected: T | undefined;
  moduleRef: ModuleRef | undefined;
  token: string | symbol;
  logger: Logger;
  watcher: string;
  sibling: (host: T) => W;
  identify?: (host: T) => unknown;
}): { host: T | undefined; siblings: W[]; release: () => void } => {
  const hosts = resolveHosts(options.injected, options.moduleRef, options.token, options.logger);

  // Built by hand, or for a further host: nothing to share with, nothing to claim.
  if (!options.moduleRef) {
    return { host: hosts[0], siblings: [], release: () => undefined };
  }

  const application = applicationOf(options.moduleRef);
  const identify = options.identify ?? ((host: T): unknown => host);
  const seen = new Set<unknown>();
  const claimed: unknown[] = [];
  const taken: T[] = [];

  let refused = 0;

  for (const host of hosts) {
    const id = identify(host);
    if (seen.has(id)) continue;
    seen.add(id);

    if (claimHost(id, options.watcher, application)) {
      claimed.push(id);
      taken.push(host);
    } else {
      refused += 1;
    }
  }

  // Once, however many hosts were refused: it is one mistake, not one per host.
  if (refused > 0) {
    options.logger.warn(
      `${options.watcher}: NestLensModule.forRoot() is imported more than once in this ` +
        `application; ${refused} host(s) are recorded by the first import, not wrapped twice.`,
    );
  }

  const siblings = taken.slice(1).map((host) => {
    const sibling = options.sibling(host);
    sibling.onModuleInit();
    return sibling;
  });

  const release = (): void => {
    for (const id of claimed) releaseHost(id, options.watcher, application);
  };

  return { host: taken[0], siblings, release };
};
