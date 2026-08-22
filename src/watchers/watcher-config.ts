/**
 * Turns `true | false | { ...options }` into the shape a watcher can read.
 *
 * Every watcher option in NestLens is written either as a switch or as a block
 * of settings, and each watcher used to unpack that itself:
 *
 * ```text
 * this.config = typeof configured === 'object'
 *   ? configured
 *   : { enabled: configured !== false };
 * ```
 *
 * Which reads correctly and is wrong. A block of settings has no `enabled` in
 * it — nobody writes `{ enabled: true, maxBodySize: 0 }`, they write
 * `{ maxBodySize: 0 }` — so `enabled` came out `undefined`, and every watcher
 * then opens with `if (!this.config.enabled) return`. Configuring a watcher
 * switched it off. Sixteen watchers did this, including the four that are on
 * by default, so `watchers: { request: { ignorePaths: ['/health'] } }` recorded
 * nothing at all and said nothing about it.
 *
 * Passing a block means "and also these settings", never "instead of running".
 * Only `enabled: false` and `false` turn a watcher off, which is what both of
 * them look like.
 */
export function resolveWatcherConfig<T extends { enabled?: boolean }>(
  configured: boolean | T | undefined,
  defaults?: Partial<Omit<T, 'enabled'>>,
): T & { enabled: boolean } {
  if (typeof configured === 'object' && configured !== null) {
    return { ...defaults, ...configured, enabled: configured.enabled !== false } as T & {
      enabled: boolean;
    };
  }

  return { ...defaults, enabled: configured !== false } as T & { enabled: boolean };
}
