import { CursorPaginationParams, StoredEntry } from '../../types';

/**
 * Whether a stored entry satisfies a set of dashboard filters.
 *
 * One implementation on purpose. MemoryStorage and RedisStorage each filter in
 * JavaScript over hydrated entries, and each used to carry its own copy of
 * these rules — the Redis copy said "apply the same filter logic as
 * MemoryStorage" while implementing nine of the forty-four. Filtering by
 * method, path, status, IP or tag on Redis did nothing at all: the badge click
 * changed the URL and the list came back untouched, with no error to notice.
 *
 * Tags are read from the entry rather than from a storage's own index, so both
 * callers hydrate before filtering and the rules stay independent of where the
 * entries came from.
 */
export const matchesEntryFilters = (
  entry: StoredEntry,
  filters: CursorPaginationParams['filters'],
): boolean => {
  if (!filters) return true;

  const payload = entry.payload as Record<string, unknown>;

  // Log filters
  if (filters.levels?.length && entry.type === 'log') {
    if (!filters.levels.includes(payload.level as string)) return false;
  }
  if (filters.contexts?.length && entry.type === 'log') {
    if (!filters.contexts.includes(payload.context as string)) return false;
  }

  // Query filters
  if (filters.queryTypes?.length && entry.type === 'query') {
    const query = (payload.query as string) || '';
    if (!filters.queryTypes.some((qt) => query.toUpperCase().startsWith(qt))) return false;
  }
  if (filters.sources?.length) {
    if (!filters.sources.includes(payload.source as string)) return false;
  }
  if (filters.slow !== undefined && entry.type === 'query') {
    if (payload.slow !== filters.slow) return false;
  }

  // Exception filters
  if (filters.names?.length && entry.type === 'exception') {
    const name = payload.name as string;
    if (!filters.names.some((n) => name?.includes(n))) return false;
  }
  if (filters.resolved !== undefined) {
    const isResolved = !!entry.resolvedAt;
    if (isResolved !== filters.resolved) return false;
  }

  // Request filters
  if (filters.methods?.length) {
    const method = (payload.method as string) || (payload.request as { method?: string })?.method;
    if (!method || !filters.methods.includes(method)) return false;
  }
  if (filters.paths?.length) {
    const path = (payload.path as string) || (payload.request as { url?: string })?.url || '';
    if (
      !filters.paths.some((p) => {
        const pattern = p.replace(/\*/g, '.*');
        return new RegExp(pattern).test(path);
      })
    )
      return false;
  }
  if (filters.statuses?.length) {
    const status = payload.statusCode as number | undefined;
    const hasErr = filters.statuses.includes('ERR');
    const numericStatuses = filters.statuses.filter((s): s is number => s !== 'ERR');

    if (status === undefined || status === null) {
      if (!hasErr) return false;
    } else {
      if (!numericStatuses.includes(status)) return false;
    }
  }
  if (filters.hostnames?.length) {
    const host =
      (payload.headers as { host?: string; Host?: string })?.host ||
      (payload.headers as { host?: string; Host?: string })?.Host ||
      (payload.hostname as string);
    if (!host || !filters.hostnames.some((h) => host.includes(h))) return false;
  }
  if (filters.controllers?.length) {
    if (!filters.controllers.includes(payload.controllerAction as string)) return false;
  }
  if (filters.ips?.length) {
    if (!filters.ips.includes(payload.ip as string)) return false;
  }

  // Event filters
  if (filters.eventNames?.length && entry.type === 'event') {
    const name = payload.name as string;
    if (!filters.eventNames.some((n) => name?.includes(n))) return false;
  }

  // Schedule filters
  if (filters.scheduleStatuses?.length && entry.type === 'schedule') {
    if (!filters.scheduleStatuses.includes(payload.status as string)) return false;
  }
  if (filters.scheduleNames?.length && entry.type === 'schedule') {
    const name = payload.name as string;
    if (!filters.scheduleNames.some((n) => name?.includes(n))) return false;
  }

  // Job filters
  if (filters.jobStatuses?.length && entry.type === 'job') {
    if (!filters.jobStatuses.includes(payload.status as string)) return false;
  }
  if (filters.jobNames?.length && entry.type === 'job') {
    const name = payload.name as string;
    if (!filters.jobNames.some((n) => name?.includes(n))) return false;
  }
  if (filters.queues?.length && entry.type === 'job') {
    if (!filters.queues.includes(payload.queue as string)) return false;
  }

  // Cache filters
  if (filters.cacheOperations?.length && entry.type === 'cache') {
    if (!filters.cacheOperations.includes(payload.operation as string)) return false;
  }

  // Mail filters
  if (filters.mailStatuses?.length && entry.type === 'mail') {
    if (!filters.mailStatuses.includes(payload.status as string)) return false;
  }

  // Redis filters
  if (filters.redisStatuses?.length && entry.type === 'redis') {
    if (!filters.redisStatuses.includes(payload.status as string)) return false;
  }
  if (filters.redisCommands?.length && entry.type === 'redis') {
    if (!filters.redisCommands.includes(payload.command as string)) return false;
  }

  // Model filters
  if (filters.modelActions?.length && entry.type === 'model') {
    if (!filters.modelActions.includes(payload.action as string)) return false;
  }
  if (filters.entities?.length && entry.type === 'model') {
    if (!filters.entities.includes(payload.entity as string)) return false;
  }
  if (filters.modelSources?.length && entry.type === 'model') {
    if (!filters.modelSources.includes(payload.source as string)) return false;
  }

  // Notification filters
  if (filters.notificationTypes?.length && entry.type === 'notification') {
    if (!filters.notificationTypes.includes(payload.type as string)) return false;
  }
  if (filters.notificationStatuses?.length && entry.type === 'notification') {
    if (!filters.notificationStatuses.includes(payload.status as string)) return false;
  }

  // View filters
  if (filters.viewFormats?.length && entry.type === 'view') {
    if (!filters.viewFormats.includes(payload.format as string)) return false;
  }
  if (filters.viewStatuses?.length && entry.type === 'view') {
    if (!filters.viewStatuses.includes(payload.status as string)) return false;
  }

  // Command filters
  if (filters.commandStatuses?.length && entry.type === 'command') {
    if (!filters.commandStatuses.includes(payload.status as string)) return false;
  }
  if (filters.commandNames?.length && entry.type === 'command') {
    const name = payload.name as string;
    if (!filters.commandNames.some((n) => name?.includes(n))) return false;
  }

  // Gate filters
  if (filters.gateNames?.length && entry.type === 'gate') {
    const gate = payload.gate as string;
    if (!filters.gateNames.some((n) => gate?.includes(n))) return false;
  }
  if (filters.gateResults?.length && entry.type === 'gate') {
    const allowed = payload.allowed as boolean;
    const result = allowed ? 'allowed' : 'denied';
    if (!filters.gateResults.includes(result)) return false;
  }

  // Batch filters
  if (filters.batchStatuses?.length && entry.type === 'batch') {
    if (!filters.batchStatuses.includes(payload.status as string)) return false;
  }
  if (filters.batchOperations?.length && entry.type === 'batch') {
    if (!filters.batchOperations.includes(payload.operation as string)) return false;
  }

  // Dump filters
  if (filters.dumpStatuses?.length && entry.type === 'dump') {
    if (!filters.dumpStatuses.includes(payload.status as string)) return false;
  }
  if (filters.dumpOperations?.length && entry.type === 'dump') {
    if (!filters.dumpOperations.includes(payload.operation as string)) return false;
  }
  if (filters.dumpFormats?.length && entry.type === 'dump') {
    if (!filters.dumpFormats.includes(payload.format as string)) return false;
  }

  // GraphQL filters
  if (filters.operationTypes?.length && entry.type === 'graphql') {
    if (!filters.operationTypes.includes(payload.operationType as string)) return false;
  }
  if (filters.operationNames?.length && entry.type === 'graphql') {
    const opName = payload.operationName as string;
    if (!filters.operationNames.some((n) => opName?.includes(n))) return false;
  }
  if (filters.hasErrors !== undefined && entry.type === 'graphql') {
    if (payload.hasErrors !== filters.hasErrors) return false;
  }
  if (filters.hasN1 !== undefined && entry.type === 'graphql') {
    const n1Array = payload.potentialN1 as unknown[] | undefined;
    const hasN1 = n1Array && n1Array.length > 0;
    if (hasN1 !== filters.hasN1) return false;
  }

  // Tag filter (case-insensitive)
  if (filters.tags?.length) {
    // Normalize both sides to uppercase for case-insensitive matching
    const entryTags = (entry.tags ?? []).map((t) => t.toUpperCase());
    const normalizedFilterTags = filters.tags.map((t) => t.toUpperCase());
    if (!normalizedFilterTags.some((t) => entryTags.includes(t))) return false;
  }

  // Search filter (matches payload content or entry tags)
  if (filters.search) {
    const term = filters.search.toLowerCase();
    const payloadStr = JSON.stringify(payload).toLowerCase();
    const tagMatch = (entry.tags ?? []).some((t) => t.toLowerCase().includes(term));
    if (!payloadStr.includes(term) && !tagMatch) return false;
  }

  return true;
};
