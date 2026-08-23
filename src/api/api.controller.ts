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
  LogsQueryDto,
  PauseRecordingDto,
  QueriesQueryDto,
} from './dto';
import { NestLensApiExceptionFilter } from '@/api/filters';
import { NestLensApiResponseInterceptor } from '@/api/interceptors';
import { NestLensApiException } from '@/api/exceptions';

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

  @Get('entries/latest-sequence')
  async getLatestSequence(@Query() query: LatestSequenceQueryDto, @Res() _res?: unknown) {
    const sequence = await this.storage.getLatestSequence(query.type);
    return { data: sequence };
  }

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

  @Get('stats')
  async getStats(@Res() _res?: unknown) {
    const stats = await this.storage.getStats();
    return { data: stats };
  }

  @Get('requests')
  async getRequests(@Query() query: EntriesQueryDto, @Res() _res?: unknown) {
    return this.getEntries({ ...query, type: 'request' });
  }

  @Get('queries')
  async getQueries(@Query() query: QueriesQueryDto, @Res() _res?: unknown) {
    return this.filteredPage('query', query, query.slow === 'true' ? { slow: true } : undefined);
  }

  @Get('exceptions')
  async getExceptions(@Query() query: EntriesQueryDto, @Res() _res?: unknown) {
    return this.getEntries({ ...query, type: 'exception' });
  }

  @Get('logs')
  async getLogs(@Query() query: LogsQueryDto, @Res() _res?: unknown) {
    return this.filteredPage('log', query, query.level ? { levels: [query.level] } : undefined);
  }

  /**
   * Storage stats endpoint
   */
  @Get('storage/stats')
  async getStorageStats(@Res() _res?: unknown) {
    const stats = await this.storage.getStorageStats();
    return { data: stats };
  }

  /**
   * Pruning endpoints
   */
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

  @Delete('entries')
  async clearEntries(@Res() _res?: unknown) {
    await this.storage.clear();
    return { success: true, message: 'All entries cleared' };
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
  @Patch('entries/:id/resolve')
  async resolveEntry(@Param('id', ParseIntPipe) id: number, @Res() _res?: unknown) {
    await this.storage.resolveEntry(id);

    return { success: true, data: this.entryOr404(await this.storage.findById(id), id) };
  }

  /**
   * Mark an entry as unresolved. See {@link resolveEntry} for the 404.
   */
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
  @Post('recording/pause')
  async pauseRecording(@Body() body: PauseRecordingDto, @Res() _res?: unknown) {
    this.collectorService.pause(body.reason);
    const status = this.collectorService.getRecordingStatus();
    return { success: true, data: status };
  }

  /**
   * Resume recording
   */
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
