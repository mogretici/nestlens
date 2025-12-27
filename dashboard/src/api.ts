import {
  ApiResponse,
  Entry,
  EntryType,
  Stats,
  CursorPaginatedResponse,
  PruningStatus,
  StorageStats,
  CheckNewResponse,
  TagWithCount,
  MonitoredTag,
  GroupedEntry,
} from './types';

const getApiBase = () => {
  // API is served at /__nestlens__/api to avoid route conflicts with dashboard
  const origin = window.location.origin;
  return `${origin}/__nestlens__/api`;
};

const API_BASE = getApiBase();

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, options);
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}

export async function getEntries(params: {
  type?: EntryType;
  limit?: number;
  offset?: number;
  requestId?: string;
}): Promise<ApiResponse<Entry[]>> {
  const searchParams = new URLSearchParams();
  if (params.type) searchParams.set('type', params.type);
  if (params.limit) searchParams.set('limit', params.limit.toString());
  if (params.offset) searchParams.set('offset', params.offset.toString());
  if (params.requestId) searchParams.set('requestId', params.requestId);

  return fetchApi(`/entries?${searchParams.toString()}`);
}

export async function getEntry(id: number): Promise<ApiResponse<Entry>> {
  return fetchApi(`/entries/${id}`);
}

export async function getStats(): Promise<ApiResponse<Stats>> {
  return fetchApi('/stats');
}

export async function getRequests(limit = 50, offset = 0): Promise<ApiResponse<Entry[]>> {
  return fetchApi(`/requests?limit=${limit}&offset=${offset}`);
}

export async function getQueries(limit = 50, offset = 0, slow = false): Promise<ApiResponse<Entry[]>> {
  return fetchApi(`/queries?limit=${limit}&offset=${offset}${slow ? '&slow=true' : ''}`);
}

export async function getExceptions(limit = 50, offset = 0): Promise<ApiResponse<Entry[]>> {
  return fetchApi(`/exceptions?limit=${limit}&offset=${offset}`);
}

export async function getLogs(limit = 50, offset = 0, level?: string): Promise<ApiResponse<Entry[]>> {
  return fetchApi(`/logs?limit=${limit}&offset=${offset}${level ? `&level=${level}` : ''}`);
}

export async function clearEntries(): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE}/entries`, { method: 'DELETE' });
  return response.json();
}

/**
 * Filter parameters for cursor-based pagination
 */
export interface CursorFilters {
  // Logs
  levels?: string[];
  contexts?: string[];
  // Queries
  queryTypes?: string[];
  sources?: string[];
  slow?: boolean;
  // Exceptions & Events
  names?: string[];
  methods?: string[];
  paths?: string[];
  resolved?: boolean;
  // Requests & HTTP Client (ERR = no status code)
  statuses?: (number | 'ERR')[];
  hostnames?: string[];
  controllers?: string[];
  ips?: string[];
  // Events
  eventNames?: string[];
  // Schedule
  scheduleStatuses?: string[];
  scheduleNames?: string[];
  // Jobs
  jobStatuses?: string[];
  jobNames?: string[];
  queues?: string[];
  // Cache
  cacheOperations?: string[];
  // Mail
  mailStatuses?: string[];
  // Redis
  redisStatuses?: string[];
  redisCommands?: string[];
  // Model
  modelActions?: string[];
  entities?: string[];
  modelSources?: string[];
  // Notification
  notificationTypes?: string[];
  notificationStatuses?: string[];
  // View
  viewFormats?: string[];
  viewStatuses?: string[];
  // Command
  commandStatuses?: string[];
  commandNames?: string[];
  // Gate
  gateNames?: string[];
  gateResults?: string[];
  // Batch
  batchStatuses?: string[];
  batchOperations?: string[];
  // Dump
  dumpStatuses?: string[];
  dumpOperations?: string[];
  dumpFormats?: string[];
  // GraphQL
  operationTypes?: string[];
  operationNames?: string[];
  hasErrors?: boolean;
  hasN1?: boolean;
  // Common
  tags?: string[];
  search?: string;
}

/**
 * Cursor-based pagination API functions
 */
export async function getEntriesWithCursor(params: {
  type?: EntryType;
  limit?: number;
  beforeSequence?: number;
  afterSequence?: number;
  filters?: CursorFilters;
}): Promise<CursorPaginatedResponse<Entry>> {
  const searchParams = new URLSearchParams();
  if (params.type) searchParams.set('type', params.type);
  if (params.limit) searchParams.set('limit', params.limit.toString());
  if (params.beforeSequence !== undefined) {
    searchParams.set('beforeSequence', params.beforeSequence.toString());
  }
  if (params.afterSequence !== undefined) {
    searchParams.set('afterSequence', params.afterSequence.toString());
  }

  // Add filter parameters
  if (params.filters) {
    const f = params.filters;
    if (f.levels && f.levels.length > 0) searchParams.set('levels', f.levels.join(','));
    if (f.contexts && f.contexts.length > 0) searchParams.set('contexts', f.contexts.join(','));
    if (f.queryTypes && f.queryTypes.length > 0) searchParams.set('queryTypes', f.queryTypes.join(','));
    if (f.sources && f.sources.length > 0) searchParams.set('sources', f.sources.join(','));
    if (f.slow !== undefined) searchParams.set('slow', f.slow.toString());
    if (f.names && f.names.length > 0) searchParams.set('names', f.names.join(','));
    if (f.methods && f.methods.length > 0) searchParams.set('methods', f.methods.join(','));
    if (f.paths && f.paths.length > 0) searchParams.set('paths', f.paths.join(','));
    if (f.resolved !== undefined) searchParams.set('resolved', f.resolved.toString());
    if (f.statuses && f.statuses.length > 0) searchParams.set('statuses', f.statuses.join(','));
    if (f.hostnames && f.hostnames.length > 0) searchParams.set('hostnames', f.hostnames.join(','));
    if (f.controllers && f.controllers.length > 0) searchParams.set('controllers', f.controllers.join(','));
    if (f.ips && f.ips.length > 0) searchParams.set('ips', f.ips.join(','));
    if (f.eventNames && f.eventNames.length > 0) searchParams.set('eventNames', f.eventNames.join(','));
    if (f.scheduleStatuses && f.scheduleStatuses.length > 0) searchParams.set('scheduleStatuses', f.scheduleStatuses.join(','));
    if (f.scheduleNames && f.scheduleNames.length > 0) searchParams.set('scheduleNames', f.scheduleNames.join(','));
    if (f.jobStatuses && f.jobStatuses.length > 0) searchParams.set('jobStatuses', f.jobStatuses.join(','));
    if (f.jobNames && f.jobNames.length > 0) searchParams.set('jobNames', f.jobNames.join(','));
    if (f.queues && f.queues.length > 0) searchParams.set('queues', f.queues.join(','));
    if (f.cacheOperations && f.cacheOperations.length > 0) searchParams.set('cacheOperations', f.cacheOperations.join(','));
    if (f.mailStatuses && f.mailStatuses.length > 0) searchParams.set('mailStatuses', f.mailStatuses.join(','));
    // Redis filters
    if (f.redisStatuses && f.redisStatuses.length > 0) searchParams.set('redisStatuses', f.redisStatuses.join(','));
    if (f.redisCommands && f.redisCommands.length > 0) searchParams.set('redisCommands', f.redisCommands.join(','));
    // Model filters
    if (f.modelActions && f.modelActions.length > 0) searchParams.set('modelActions', f.modelActions.join(','));
    if (f.entities && f.entities.length > 0) searchParams.set('entities', f.entities.join(','));
    if (f.modelSources && f.modelSources.length > 0) searchParams.set('modelSources', f.modelSources.join(','));
    // Notification filters
    if (f.notificationTypes && f.notificationTypes.length > 0) searchParams.set('notificationTypes', f.notificationTypes.join(','));
    if (f.notificationStatuses && f.notificationStatuses.length > 0) searchParams.set('notificationStatuses', f.notificationStatuses.join(','));
    // View filters
    if (f.viewFormats && f.viewFormats.length > 0) searchParams.set('viewFormats', f.viewFormats.join(','));
    if (f.viewStatuses && f.viewStatuses.length > 0) searchParams.set('viewStatuses', f.viewStatuses.join(','));
    // Command filters
    if (f.commandStatuses && f.commandStatuses.length > 0) searchParams.set('commandStatuses', f.commandStatuses.join(','));
    if (f.commandNames && f.commandNames.length > 0) searchParams.set('commandNames', f.commandNames.join(','));
    // Gate filters
    if (f.gateNames && f.gateNames.length > 0) searchParams.set('gateNames', f.gateNames.join(','));
    if (f.gateResults && f.gateResults.length > 0) searchParams.set('gateResults', f.gateResults.join(','));
    // Batch filters
    if (f.batchStatuses && f.batchStatuses.length > 0) searchParams.set('batchStatuses', f.batchStatuses.join(','));
    if (f.batchOperations && f.batchOperations.length > 0) searchParams.set('batchOperations', f.batchOperations.join(','));
    // Dump filters
    if (f.dumpStatuses && f.dumpStatuses.length > 0) searchParams.set('dumpStatuses', f.dumpStatuses.join(','));
    if (f.dumpOperations && f.dumpOperations.length > 0) searchParams.set('dumpOperations', f.dumpOperations.join(','));
    if (f.dumpFormats && f.dumpFormats.length > 0) searchParams.set('dumpFormats', f.dumpFormats.join(','));
    // GraphQL filters
    if (f.operationTypes && f.operationTypes.length > 0) searchParams.set('operationTypes', f.operationTypes.join(','));
    if (f.operationNames && f.operationNames.length > 0) searchParams.set('operationNames', f.operationNames.join(','));
    if (f.hasErrors !== undefined) searchParams.set('hasErrors', f.hasErrors.toString());
    if (f.hasN1 !== undefined) searchParams.set('hasN1', f.hasN1.toString());
    // Common filters
    if (f.tags && f.tags.length > 0) searchParams.set('tags', f.tags.join(','));
    if (f.search) searchParams.set('search', f.search);
  }

  return fetchApi(`/entries/cursor?${searchParams.toString()}`);
}

export async function getLatestSequence(
  type?: EntryType,
): Promise<ApiResponse<number | null>> {
  const searchParams = new URLSearchParams();
  if (type) searchParams.set('type', type);
  return fetchApi(`/entries/latest-sequence?${searchParams.toString()}`);
}

export async function checkNewEntries(
  afterSequence: number,
  type?: EntryType,
): Promise<ApiResponse<CheckNewResponse>> {
  const searchParams = new URLSearchParams();
  searchParams.set('afterSequence', afterSequence.toString());
  if (type) searchParams.set('type', type);
  return fetchApi(`/entries/check-new?${searchParams.toString()}`);
}

/**
 * Storage and pruning API functions
 */
export async function getStorageStats(): Promise<ApiResponse<StorageStats>> {
  return fetchApi('/storage/stats');
}

export async function getPruningStatus(): Promise<ApiResponse<PruningStatus>> {
  return fetchApi('/pruning/status');
}

export async function runPruning(): Promise<{
  success: boolean;
  data: { deleted: number; lastRun: string; nextRun: string };
}> {
  return fetchApi('/pruning/run', { method: 'POST' });
}

// ==================== Tag API Functions ====================

/**
 * Get all tags with their counts
 */
export async function getAllTags(): Promise<ApiResponse<TagWithCount[]>> {
  return fetchApi('/tags');
}

/**
 * Get entries by tags
 */
export async function getEntriesByTags(
  tags: string[],
  logic: 'AND' | 'OR' = 'OR',
  limit = 50,
): Promise<ApiResponse<Entry[]>> {
  const searchParams = new URLSearchParams();
  searchParams.set('tags', tags.join(','));
  searchParams.set('logic', logic);
  searchParams.set('limit', limit.toString());
  return fetchApi(`/tags/entries?${searchParams.toString()}`);
}

/**
 * Get tags for a specific entry
 */
export async function getEntryTags(entryId: number): Promise<ApiResponse<string[]>> {
  return fetchApi(`/tags/entry/${entryId}`);
}

/**
 * Add tags to an entry
 */
export async function addTagsToEntry(
  entryId: number,
  tags: string[],
): Promise<{ success: boolean; data: string[] }> {
  return fetchApi(`/tags/entry/${entryId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags }),
  });
}

/**
 * Remove tags from an entry
 */
export async function removeTagsFromEntry(
  entryId: number,
  tags: string[],
): Promise<{ success: boolean; data: string[] }> {
  return fetchApi(`/tags/entry/${entryId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags }),
  });
}

// ==================== Monitored Tags ====================

/**
 * Get monitored tags with counts
 */
export async function getMonitoredTags(): Promise<ApiResponse<MonitoredTag[]>> {
  return fetchApi('/tags/monitored');
}

/**
 * Add a monitored tag
 */
export async function addMonitoredTag(
  tag: string,
): Promise<{ success: boolean; data: MonitoredTag }> {
  return fetchApi('/tags/monitored', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag }),
  });
}

/**
 * Remove a monitored tag
 */
export async function removeMonitoredTag(tag: string): Promise<{ success: boolean }> {
  return fetchApi(`/tags/monitored/${encodeURIComponent(tag)}`, {
    method: 'DELETE',
  });
}

// ==================== Resolution ====================

/**
 * Mark an entry as resolved
 */
export async function resolveEntry(id: number): Promise<{ success: boolean; data: Entry }> {
  return fetchApi(`/entries/${id}/resolve`, { method: 'PATCH' });
}

/**
 * Mark an entry as unresolved
 */
export async function unresolveEntry(id: number): Promise<{ success: boolean; data: Entry }> {
  return fetchApi(`/entries/${id}/unresolve`, { method: 'PATCH' });
}

// ==================== Family Hash (Grouping) ====================

/**
 * Get entries grouped by family hash
 */
export async function getGroupedEntries(
  type?: EntryType,
  limit = 50,
): Promise<ApiResponse<GroupedEntry[]>> {
  const searchParams = new URLSearchParams();
  if (type) searchParams.set('type', type);
  searchParams.set('limit', limit.toString());
  return fetchApi(`/entries/grouped?${searchParams.toString()}`);
}

/**
 * Get entries with the same family hash
 */
export async function getEntriesByFamilyHash(
  hash: string,
  limit = 50,
): Promise<ApiResponse<Entry[]>> {
  return fetchApi(`/entries/family/${hash}?limit=${limit}`);
}

// ==================== Recording Control ====================

export interface RecordingStatus {
  isPaused: boolean;
  pausedAt?: string;
  pauseReason?: string;
}

/**
 * Pause recording
 */
export async function pauseRecording(
  reason?: string,
): Promise<{ success: boolean; data: RecordingStatus }> {
  return fetchApi('/recording/pause', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
}

/**
 * Resume recording
 */
export async function resumeRecording(): Promise<{ success: boolean; data: RecordingStatus }> {
  return fetchApi('/recording/resume', { method: 'POST' });
}

/**
 * Get recording status
 */
export async function getRecordingStatus(): Promise<ApiResponse<RecordingStatus>> {
  return fetchApi('/recording/status');
}
