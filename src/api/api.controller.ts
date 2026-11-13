import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UseFilters,
  UseGuards,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { NestLensValidationPipe } from './pipes';
import { STORAGE, StorageInterface } from '@/core';
import { PruningService } from '@/core';
import { CollectorService } from '@/core';
import { NestLensConfig, NESTLENS_API_PREFIX, NESTLENS_CONFIG } from '@/nestlens.config';
import { EntryType, CursorPaginatedResponse, CursorPaginationParams, Entry } from '@/types';
import { NestLensGuard } from './api.guard';
import {
  CheckNewQueryDto,
  CursorQueryDto,
  DEFAULT_LIMIT,
  EntriesQueryDto,
  LatestSequenceQueryDto,
  ClearEntriesQueryDto,
  LogsQueryDto,
  PauseRecordingDto,
  QueriesQueryDto,
} from './dto';
import { NestLensApiExceptionFilter } from '@/api/filters';
import { NestLensApiResponseInterceptor } from '@/api/interceptors';
import { NestLensApiException } from '@/api/exceptions';
import { NestLensTool, buildToolManifest } from './tools';
import { TagController } from './tag.controller';

/**
 * Every handler here takes an unused `@Res() _res` parameter. It is not a
 * mistake and the value is never touched: its presence is how a handler tells
 * Nest "the response is written for you", which stops the framework from
 * writing a second time after `NestLensApiResponseInterceptor` has already
 * replied. Without it, Nest 9/10 on Express throws
 * `Cannot set headers after they are sent to the client` on every request.
 *
 * Handlers still return their data, so they stay directly unit-testable and the
 * envelope shape lives in one place — the interceptor.
 */
@Controller(`${NESTLENS_API_PREFIX}/api`)
@UseGuards(NestLensGuard)
@UseFilters(NestLensApiExceptionFilter)
@UseInterceptors(NestLensApiResponseInterceptor)
@UsePipes(new NestLensValidationPipe())
export class NestLensApiController {
  constructor(
    @Inject(STORAGE)
    private readonly storage: StorageInterface,
    @Inject(NESTLENS_CONFIG)
    private readonly config: NestLensConfig,
    private readonly pruningService: PruningService,
    private readonly collectorService: CollectorService,
  ) {}

  /**
   * What this API offers as tools, read from the controllers' own metadata.
   *
   * This is what the MCP server lists, so a handler becomes a tool by carrying
   * `@NestLensTool` and nothing else needs to change. It is not itself a tool:
   * the manifest describes the API, and an agent that has this has no use for it.
   */
  @Get('tools')
  async getTools(@Res() _res?: unknown) {
    return { data: buildToolManifest([NestLensApiController, TagController]) };
  }

  @NestLensTool({
    description:
      'List recorded entries, newest first, with offset paging. Filter by type, time window (from/to), duration, or requestId. Use this for a quick look; prefer get_entries_with_cursor when you need the type-specific filters (log level, HTTP status, slow queries, exception names, and so on) or a full search.',
  })
  @Get('entries')
  async getEntries(@Query() query: EntriesQueryDto, @Res() _res?: unknown) {
    return this.filteredPage(query.type, query);
  }

  /**
   * A page of one type, narrowed by a filter the storage applies.
   *
   * `logs` and `queries` used to read a page and then filter what came back,
   * which chooses the matches out of the newest fifty rather than the newest
   * fifty matches. On 5,005 logs whose five errors were the oldest,
   * `?level=error` returned nothing at all and reported a total of 5,005 —
   * a hundred pages to click through to reach the first match.
   *
   * `findWithCursor` applies filters before it chooses a page, in every
   * backend, and counts what matches. Offset paging on top of it asks for
   * `offset + limit` matches and drops the ones already shown, which is what
   * an offset costs anywhere.
   *
   * Every list endpoint goes through here now. `entries`, `requests` and
   * `exceptions` used `find`, which takes no filters at all, so they accepted
   * `minDuration` and ignored it — the same silence, one path over. Two ways
   * to answer the same question is how the two came to disagree.
   */
  private async filteredPage(
    type: EntryType | undefined,
    query: EntriesQueryDto,
    filters?: CursorPaginationParams['filters'],
  ) {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const offset = query.offset ?? 0;

    const result = await this.storage.findWithCursor(type, {
      limit: offset + limit,
      filters: {
        // The window and the duration bounds these endpoints accept. The
        // window reached the storage on the `entries` path and not on this
        // one, so `logs` and `queries` took a `from` and ignored it.
        from: query.from?.toISOString(),
        to: query.to?.toISOString(),
        minDuration: query.minDuration,
        maxDuration: query.maxDuration,
        requestId: query.requestId,
        ...filters,
      },
    });

    return {
      data: result.data.slice(offset),
      meta: { total: result.meta.total, limit, offset },
    };
  }

  /**
   * Cursor-based pagination with comprehensive filtering
   * Uses CursorQueryDto to validate and transform all query parameters
   * NOTE: Must come BEFORE @Get('entries/:id') to avoid route conflicts
   */
  @NestLensTool({
    description:
      "List recorded entries with every filter NestLens has, paged by sequence number. Set `type` first, then use that type's filters: logs (levels, contexts), queries (slow, queryTypes, sources), requests (methods, paths, statuses, controllers, hostnames, ips), exceptions (names, resolved), jobs (jobStatuses, jobNames, queues), graphql (operationTypes, operationNames, hasErrors, hasN1), and so on. `search` matches the entry's text. To get the next page pass the last entry's sequence as `beforeSequence` (older) or `afterSequence` (newer).",
  })
  @Get('entries/cursor')
  async getEntriesWithCursor(
    @Query() query: CursorQueryDto,
    @Res() _res?: unknown,
  ): Promise<CursorPaginatedResponse<Entry>> {
    return this.storage.findWithCursor(query.type, {
      limit: query.limit ?? DEFAULT_LIMIT,
      beforeSequence: query.beforeSequence,
      afterSequence: query.afterSequence,
      filters: query.toFilters(),
    });
  }

  @NestLensTool({
    description:
      'The sequence number of the newest entry, optionally of one type. Use it as a bookmark, then call check_new_entries later to see whether anything happened since.',
  })
  @Get('entries/latest-sequence')
  async getLatestSequence(@Query() query: LatestSequenceQueryDto, @Res() _res?: unknown) {
    const sequence = await this.storage.getLatestSequence(query.type);
    return { data: sequence };
  }

  @NestLensTool({
    description:
      "Count the entries recorded after a sequence number. Cheap way to ask 'did anything new happen since I last looked?'.",
  })
  @Get('entries/check-new')
  async checkNewEntries(@Query() query: CheckNewQueryDto, @Res() _res?: unknown) {
    // `parseInt` of a missing or unreadable parameter is NaN, and NaN reached
    // the storage: Redis was asked for `zcount (NaN +inf` and answered with an
    // error. The live tail calls this on a timer, so it would have been a 500
    // every few seconds rather than once.
    const count = await this.storage.hasEntriesAfter(query.afterSequence, query.type);
    return { data: { count, hasNew: count > 0 } };
  }

  /**
   * Get entries grouped by family hash
   * NOTE: Must come BEFORE @Get('entries/:id') to avoid route conflict
   */
  @NestLensTool({
    description:
      'Group entries by family hash: identical queries, repeated exceptions and similar requests collapse into one row with a count. Use it to find the noisy ones — the same exception thrown 400 times, the same query run on every request.',
  })
  @Get('entries/grouped')
  async getGroupedEntries(@Query() query: EntriesQueryDto, @Res() _res?: unknown) {
    const groups = await this.storage.getGroupedByFamilyHash(
      query.type,
      query.limit ?? DEFAULT_LIMIT,
    );
    return { data: groups };
  }

  /**
   * Get all entries with the same family hash
   * NOTE: Must come BEFORE @Get('entries/:id') to avoid route conflict
   */
  @NestLensTool({
    description:
      'Every entry that shares one family hash, as listed by get_grouped_entries. Use it to inspect all occurrences of one repeated query or exception.',
  })
  @Get('entries/family/:hash')
  async getEntriesByFamilyHash(
    // A family hash is a fixed-width digest; the parameter is a path segment a
    // caller writes, and it becomes part of a Redis key.
    @Param('hash') hash: string,
    @Query() query: EntriesQueryDto,
    @Res() _res?: unknown,
  ) {
    const entries = await this.storage.findByFamilyHash(hash, query.limit ?? DEFAULT_LIMIT);
    return { data: entries };
  }

  @NestLensTool({
    description:
      'One entry in full by id. For a request entry it also returns what that request produced — its queries, exceptions, logs and outgoing calls — which is the quickest way to see why a request was slow or failed.',
  })
  @Get('entries/:id')
  async getEntry(@Param('id', ParseIntPipe) id: number, @Res() _res?: unknown) {
    const entry = await this.storage.findById(id);

    if (!entry) {
      throw NestLensApiException.entryNotFound(id);
    }

    // If it's a request entry, also get related queries, exceptions, logs
    if (entry.type === 'request' && entry.requestId) {
      const related = await this.storage.find({
        requestId: entry.requestId,
        limit: 100,
      });

      return {
        data: entry,
        related: related.filter((e) => e.id !== entry.id),
      };
    }

    return { data: entry };
  }

  @NestLensTool({
    description:
      'Headline figures: total entries, a count per type, average response time, slow query count and how many exceptions are unresolved. The first call to make when asking what is going on in the application.',
  })
  @Get('stats')
  async getStats(@Res() _res?: unknown) {
    const stats = await this.storage.getStats();
    return { data: stats };
  }

  @NestLensTool({
    description:
      'List recorded HTTP requests, newest first. Same filters as get_entries; for filtering by method, path or status use get_entries_with_cursor with type=request.',
  })
  @Get('requests')
  async getRequests(@Query() query: EntriesQueryDto, @Res() _res?: unknown) {
    return this.getEntries({ ...query, type: 'request' });
  }

  @NestLensTool({
    description:
      'List recorded database queries, newest first. Pass slow=true for only the queries over the slow threshold.',
  })
  @Get('queries')
  async getQueries(@Query() query: QueriesQueryDto, @Res() _res?: unknown) {
    return this.filteredPage('query', query, query.slow === 'true' ? { slow: true } : undefined);
  }

  @NestLensTool({
    description: 'List recorded exceptions, newest first, with their stack traces.',
  })
  @Get('exceptions')
  async getExceptions(@Query() query: EntriesQueryDto, @Res() _res?: unknown) {
    return this.getEntries({ ...query, type: 'exception' });
  }

  @NestLensTool({
    description:
      'List recorded log lines, newest first. Pass level (log, error, warn, debug, verbose) to narrow to one level.',
  })
  @Get('logs')
  async getLogs(@Query() query: LogsQueryDto, @Res() _res?: unknown) {
    return this.filteredPage('log', query, query.level ? { levels: [query.level] } : undefined);
  }

  /**
   * Storage stats endpoint
   */
  @NestLensTool({
    description:
      'How much NestLens has stored and where: entry totals, oldest and newest entry, storage size.',
  })
  @Get('storage/stats')
  async getStorageStats(@Res() _res?: unknown) {
    const stats = await this.storage.getStorageStats();
    return { data: stats };
  }

  /**
   * Pruning endpoints
   */
  @NestLensTool({
    description:
      'Whether automatic pruning is on, how old an entry may get, when it last ran and when it runs next.',
  })
  @Get('pruning/status')
  async getPruningStatus(@Res() _res?: unknown) {
    const storageStats = await this.storage.getStorageStats();
    // Read from the service rather than from the configuration: a setting it
    // refused or clamped is not the one in effect, and reporting the written
    // value would describe pruning that is not happening.
    const { lastRun, nextRun } = this.pruningService.schedule;

    return {
      data: {
        enabled: this.config.pruning?.enabled !== false,
        maxAge: this.pruningService.maxAgeHours,
        interval: this.pruningService.intervalMinutes,
        lastRun: lastRun?.toISOString() ?? null,
        nextRun: nextRun?.toISOString() ?? null,
        totalEntries: storageStats.total,
        oldestEntry: storageStats.oldestEntry,
        newestEntry: storageStats.newestEntry,
        databaseSize: storageStats.databaseSize,
      },
    };
  }

  /**
   * Prunes now, by the same rules as the timer.
   *
   * This used to compute its own window from `config.pruning.maxAge`, which
   * the service refuses to take at face value: `maxAge: 0` is ignored there
   * and was honoured here, so pressing *Run pruning* with it set deleted every
   * entry the application had recorded.
   */
  @NestLensTool({
    description:
      'Run pruning now, by the same rules as the timer. Deletes entries older than the retention window and leaves monitored tags alone.',
    destructive: true,
  })
  @Post('pruning/run')
  async runPruning(@Res() _res?: unknown) {
    const deleted = await this.pruningService.pruneNow();
    const { lastRun, nextRun } = this.pruningService.schedule;

    return {
      success: true,
      data: {
        deleted,
        lastRun: lastRun?.toISOString() ?? null,
        nextRun: nextRun?.toISOString() ?? null,
      },
    };
  }

  /**
   * Deletes entries — all of them, or all of one type.
   *
   * Different from pruning, which deletes by age and leaves a monitored tag's
   * entries alone. This is somebody pressing delete: age is not consulted and
   * a monitored tag does not stand in the way, because monitoring says *do not
   * let pruning take these*, which is a different sentence.
   *
   * Answers with how many went, so the page that asked can say so rather than
   * assume.
   */
  @NestLensTool({
    description:
      'Delete recorded entries: all of them, or all of one `type`. Age and monitored tags are ignored. Cannot be undone.',
    destructive: true,
  })
  @Delete('entries')
  async clearEntries(@Query() query: ClearEntriesQueryDto, @Res() _res?: unknown) {
    const deleted = await this.storage.clear(query.type);

    return {
      success: true,
      data: { deleted, type: query.type ?? null },
      message: query.type
        ? `Cleared ${deleted} ${query.type} ${deleted === 1 ? 'entry' : 'entries'}`
        : `Cleared ${deleted} ${deleted === 1 ? 'entry' : 'entries'}`,
    };
  }

  // ==================== Resolution Endpoints ====================

  /**
   * Mark an entry (exception) as resolved.
   *
   * An entry that is not there answers 404 rather than `success: true` with
   * nothing attached. Both are reachable while a page is open — pruning
   * deletes by age, the store evicts by size — and the dashboard applied what
   * came back to the row it clicked, so `null` reached a list update and
   * failed there instead, with a message about a property of null.
   */
  @NestLensTool({
    description: 'Mark an exception entry as resolved, so it drops out of the unresolved count.',
  })
  @Patch('entries/:id/resolve')
  async resolveEntry(@Param('id', ParseIntPipe) id: number, @Res() _res?: unknown) {
    await this.storage.resolveEntry(id);

    return { success: true, data: this.entryOr404(await this.storage.findById(id), id) };
  }

  /**
   * Mark an entry as unresolved. See {@link resolveEntry} for the 404.
   */
  @NestLensTool({
    description: 'Mark an exception entry as unresolved again.',
  })
  @Patch('entries/:id/unresolve')
  async unresolveEntry(@Param('id', ParseIntPipe) id: number, @Res() _res?: unknown) {
    await this.storage.unresolveEntry(id);

    return { success: true, data: this.entryOr404(await this.storage.findById(id), id) };
  }

  private entryOr404(entry: Entry | null, id: number): Entry {
    if (!entry) {
      throw NestLensApiException.entryNotFound(id);
    }

    return entry;
  }

  // ==================== Recording Control Endpoints ====================

  /**
   * Pause recording
   */
  @NestLensTool({
    description:
      'Stop recording new entries until resume_recording is called. Anything that happens while paused is not captured. Optional `reason` is kept and reported by get_recording_status.',
    destructive: true,
  })
  @Post('recording/pause')
  async pauseRecording(@Body() body: PauseRecordingDto, @Res() _res?: unknown) {
    this.collectorService.pause(body.reason);
    const status = this.collectorService.getRecordingStatus();
    return { success: true, data: status };
  }

  /**
   * Resume recording
   */
  @NestLensTool({
    description: 'Start recording again after pause_recording.',
  })
  @Post('recording/resume')
  async resumeRecording(@Res() _res?: unknown) {
    this.collectorService.resume();
    const status = this.collectorService.getRecordingStatus();
    return { success: true, data: status };
  }

  /**
   * Whether recording is on, and what it has been doing.
   *
   * The counts are here because "nothing was recorded" and "nothing happened"
   * look identical on a dashboard: an application spent two days deciding
   * which of the two it was looking at. Sampling and the filter each drop
   * entries deliberately, and this says how many.
   */
  @NestLensTool({
    description:
      'Whether recording is on, when and why it was paused, and how many entries sampling and the filter have dropped. Check this when the list is empty and you need to know whether nothing happened or nothing was recorded.',
  })
  @Get('recording/status')
  async getRecordingStatus(@Res() _res?: unknown) {
    return {
      data: {
        ...this.collectorService.getRecordingStatus(),
        counts: this.collectorService.getRecordingCounts(),
        buffer: this.collectorService.getBufferSize(),
      },
    };
  }
}
