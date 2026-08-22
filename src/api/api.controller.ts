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
  private lastPruneRun: Date | null = null;
  private nextPruneRun: Date | null = null;

  constructor(
    @Inject(STORAGE)
    private readonly storage: StorageInterface,
    @Inject(NESTLENS_CONFIG)
    private readonly config: NestLensConfig,
    private readonly pruningService: PruningService,
    private readonly collectorService: CollectorService,
  ) {
    // Calculate next prune run
    const intervalMinutes = this.config.pruning?.interval ?? 60;
    this.nextPruneRun = new Date(Date.now() + intervalMinutes * 60 * 1000);
  }

  @Get('entries')
  async getEntries(@Query() query: EntriesQueryDto, @Res() _res?: unknown) {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const offset = query.offset ?? 0;

    const entries = await this.storage.find({
      type: query.type,
      requestId: query.requestId,
      limit,
      offset,
      from: query.from,
      to: query.to,
    });

    return {
      data: entries,
      meta: { total: await this.storage.count(query.type), limit, offset },
    };
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
   */
  private async filteredPage(
    type: EntryType,
    query: EntriesQueryDto,
    filters: CursorPaginationParams['filters'],
  ) {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const offset = query.offset ?? 0;

    const result = await this.storage.findWithCursor(type, {
      limit: offset + limit,
      filters,
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
    const config = this.config.pruning;
    const storageStats = await this.storage.getStorageStats();

    return {
      data: {
        enabled: config?.enabled !== false,
        maxAge: config?.maxAge ?? 24,
        interval: config?.interval ?? 60,
        lastRun: this.lastPruneRun?.toISOString() ?? null,
        nextRun: this.nextPruneRun?.toISOString() ?? null,
        totalEntries: storageStats.total,
        oldestEntry: storageStats.oldestEntry,
        newestEntry: storageStats.newestEntry,
        databaseSize: storageStats.databaseSize,
      },
    };
  }

  @Post('pruning/run')
  async runPruning(@Res() _res?: unknown) {
    const maxAgeHours = this.config.pruning?.maxAge ?? 24;
    const before = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

    const deleted = await this.storage.prune(before);
    this.lastPruneRun = new Date();

    const intervalMinutes = this.config.pruning?.interval ?? 60;
    this.nextPruneRun = new Date(Date.now() + intervalMinutes * 60 * 1000);

    return {
      success: true,
      data: {
        deleted,
        lastRun: this.lastPruneRun.toISOString(),
        nextRun: this.nextPruneRun.toISOString(),
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
   * Mark an entry (exception) as resolved
   */
  @Patch('entries/:id/resolve')
  async resolveEntry(@Param('id', ParseIntPipe) id: number, @Res() _res?: unknown) {
    await this.storage.resolveEntry(id);
    const entry = await this.storage.findById(id);
    return { success: true, data: entry };
  }

  /**
   * Mark an entry as unresolved
   */
  @Patch('entries/:id/unresolve')
  async unresolveEntry(@Param('id', ParseIntPipe) id: number, @Res() _res?: unknown) {
    await this.storage.unresolveEntry(id);
    const entry = await this.storage.findById(id);
    return { success: true, data: entry };
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
   * Get recording status
   */
  @Get('recording/status')
  async getRecordingStatus(@Res() _res?: unknown) {
    const status = this.collectorService.getRecordingStatus();
    return { data: status };
  }
}
