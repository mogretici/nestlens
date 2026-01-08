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
  UseFilters,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam } from '@nestjs/swagger';
import { STORAGE, StorageInterface } from '../core/storage/storage.interface';
import { PruningService } from '../core/pruning.service';
import { CollectorService } from '../core/collector.service';
import { NestLensConfig, NESTLENS_API_PREFIX, NESTLENS_CONFIG } from '../nestlens.config';
import { EntryType, CursorPaginatedResponse, Entry } from '../types';
import { NestLensGuard } from './api.guard';
import { CursorQueryDto, DEFAULT_LIMIT, MAX_LIMIT } from './dto';
import { NestLensApiExceptionFilter } from './filters/api-exception.filter';
import { NestLensApiResponseInterceptor } from './interceptors/api-response.interceptor';
import { NestLensApiException } from './exceptions/nestlens-api.exception';

@ApiTags('NestLens')
@Controller(`${NESTLENS_API_PREFIX}/api`)
@UseGuards(NestLensGuard)
@UseFilters(NestLensApiExceptionFilter)
@UseInterceptors(NestLensApiResponseInterceptor)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class NestLensApiController {
  private lastPruneRun: Date | null = null;
  private nextPruneRun: Date | null = null;

  /**
   * Safely parse and bound pagination limit
   */
  private parseLimit(limit?: string): number {
    if (!limit) return DEFAULT_LIMIT;
    const parsed = parseInt(limit, 10);
    if (isNaN(parsed) || parsed < 1) return DEFAULT_LIMIT;
    return Math.min(parsed, MAX_LIMIT);
  }

  /**
   * Safely parse pagination offset
   */
  private parseOffset(offset?: string): number {
    if (!offset) return 0;
    const parsed = parseInt(offset, 10);
    return isNaN(parsed) || parsed < 0 ? 0 : parsed;
  }

  constructor(
    @Inject(STORAGE)
    private readonly storage: StorageInterface,
    @Inject(NESTLENS_CONFIG)
    private readonly config: NestLensConfig,
    private readonly pruningService: PruningService,
    private readonly collectorService: CollectorService,
  ) {
    // Calculate next prune run
    const intervalMinutes = this.config.pruning?.interval || 60;
    this.nextPruneRun = new Date(Date.now() + intervalMinutes * 60 * 1000);
  }

  @Get('entries')
  @ApiOperation({ summary: 'Get paginated entries with offset pagination' })
  @ApiQuery({ name: 'type', required: false, description: 'Filter by entry type' })
  @ApiQuery({ name: 'requestId', required: false, description: 'Filter by request ID' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of entries per page (max 100)' })
  @ApiQuery({ name: 'offset', required: false, description: 'Offset for pagination' })
  @ApiQuery({
    name: 'from',
    required: false,
    description: 'Filter entries from this date (ISO 8601)',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    description: 'Filter entries until this date (ISO 8601)',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of entries' })
  async getEntries(
    @Query('type') type?: EntryType,
    @Query('requestId') requestId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const parsedLimit = this.parseLimit(limit);
    const parsedOffset = this.parseOffset(offset);

    const entries = await this.storage.find({
      type,
      requestId,
      limit: parsedLimit,
      offset: parsedOffset,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });

    const total = await this.storage.count(type);

    return {
      data: entries,
      meta: {
        total,
        limit: parsedLimit,
        offset: parsedOffset,
      },
    };
  }

  /**
   * Cursor-based pagination with comprehensive filtering
   * Uses CursorQueryDto to validate and transform all query parameters
   * NOTE: Must come BEFORE @Get('entries/:id') to avoid route conflicts
   */
  @Get('entries/cursor')
  @ApiOperation({ summary: 'Get entries with cursor-based pagination and filtering' })
  @ApiResponse({ status: 200, description: 'Cursor-paginated list of entries with filters' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  async getEntriesWithCursor(
    @Query() query: CursorQueryDto,
  ): Promise<CursorPaginatedResponse<Entry>> {
    return this.storage.findWithCursor(query.type, {
      limit: query.limit ?? DEFAULT_LIMIT,
      beforeSequence: query.beforeSequence,
      afterSequence: query.afterSequence,
      filters: query.toFilters(),
    });
  }

  @Get('entries/latest-sequence')
  async getLatestSequence(@Query('type') type?: EntryType) {
    const sequence = await this.storage.getLatestSequence(type);
    return { data: sequence };
  }

  @Get('entries/check-new')
  async checkNewEntries(
    @Query('afterSequence') afterSequence: string,
    @Query('type') type?: EntryType,
  ) {
    const seq = parseInt(afterSequence, 10);
    const count = await this.storage.hasEntriesAfter(seq, type);
    return { data: { count, hasNew: count > 0 } };
  }

  /**
   * Get entries grouped by family hash
   * NOTE: Must come BEFORE @Get('entries/:id') to avoid route conflict
   */
  @Get('entries/grouped')
  async getGroupedEntries(@Query('type') type?: EntryType, @Query('limit') limit?: string) {
    const groups = await this.storage.getGroupedByFamilyHash(type, this.parseLimit(limit));
    return { data: groups };
  }

  /**
   * Get all entries with the same family hash
   * NOTE: Must come BEFORE @Get('entries/:id') to avoid route conflict
   */
  @Get('entries/family/:hash')
  async getEntriesByFamilyHash(@Param('hash') hash: string, @Query('limit') limit?: string) {
    const entries = await this.storage.findByFamilyHash(hash, this.parseLimit(limit));
    return { data: entries };
  }

  @Get('entries/:id')
  @ApiOperation({ summary: 'Get a single entry by ID' })
  @ApiParam({ name: 'id', type: 'number', description: 'Entry ID' })
  @ApiResponse({ status: 200, description: 'Entry with related entries if applicable' })
  @ApiResponse({ status: 404, description: 'Entry not found' })
  async getEntry(@Param('id', ParseIntPipe) id: number) {
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
  @ApiOperation({ summary: 'Get entry statistics by type' })
  @ApiResponse({ status: 200, description: 'Statistics object with counts by entry type' })
  async getStats() {
    const stats = await this.storage.getStats();
    return { data: stats };
  }

  @Get('requests')
  async getRequests(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.getEntries('request', undefined, limit, offset);
  }

  @Get('queries')
  async getQueries(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('slow') slow?: string,
  ) {
    const parsedLimit = this.parseLimit(limit);
    const parsedOffset = this.parseOffset(offset);

    const entries = await this.storage.find({
      type: 'query',
      limit: parsedLimit,
      offset: parsedOffset,
    });

    // Filter slow queries if requested
    const filtered =
      slow === 'true' ? entries.filter((e) => e.type === 'query' && e.payload.slow) : entries;

    const total = await this.storage.count('query');

    return {
      data: filtered,
      meta: {
        total,
        limit: parsedLimit,
        offset: parsedOffset,
      },
    };
  }

  @Get('exceptions')
  async getExceptions(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.getEntries('exception', undefined, limit, offset);
  }

  @Get('logs')
  async getLogs(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('level') level?: string,
  ) {
    const parsedLimit = this.parseLimit(limit);
    const parsedOffset = this.parseOffset(offset);

    const entries = await this.storage.find({
      type: 'log',
      limit: parsedLimit,
      offset: parsedOffset,
    });

    // Filter by level if requested
    const filtered = level
      ? entries.filter((e) => e.type === 'log' && e.payload.level === level)
      : entries;

    const total = await this.storage.count('log');

    return {
      data: filtered,
      meta: {
        total,
        limit: parsedLimit,
        offset: parsedOffset,
      },
    };
  }

  /**
   * Storage stats endpoint
   */
  @Get('storage/stats')
  async getStorageStats() {
    const stats = await this.storage.getStorageStats();
    return { data: stats };
  }

  /**
   * Pruning endpoints
   */
  @Get('pruning/status')
  async getPruningStatus() {
    const config = this.config.pruning;
    const storageStats = await this.storage.getStorageStats();

    return {
      data: {
        enabled: config?.enabled !== false,
        maxAge: config?.maxAge || 24,
        interval: config?.interval || 60,
        lastRun: this.lastPruneRun?.toISOString() || null,
        nextRun: this.nextPruneRun?.toISOString() || null,
        totalEntries: storageStats.total,
        oldestEntry: storageStats.oldestEntry,
        newestEntry: storageStats.newestEntry,
        databaseSize: storageStats.databaseSize,
      },
    };
  }

  @Post('pruning/run')
  async runPruning() {
    const maxAgeHours = this.config.pruning?.maxAge || 24;
    const before = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

    const deleted = await this.storage.prune(before);
    this.lastPruneRun = new Date();

    const intervalMinutes = this.config.pruning?.interval || 60;
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
  async clearEntries() {
    await this.storage.clear();
    return { success: true, message: 'All entries cleared' };
  }

  // ==================== Resolution Endpoints ====================

  /**
   * Mark an entry (exception) as resolved
   */
  @Patch('entries/:id/resolve')
  async resolveEntry(@Param('id', ParseIntPipe) id: number) {
    await this.storage.resolveEntry(id);
    const entry = await this.storage.findById(id);
    return { success: true, data: entry };
  }

  /**
   * Mark an entry as unresolved
   */
  @Patch('entries/:id/unresolve')
  async unresolveEntry(@Param('id', ParseIntPipe) id: number) {
    await this.storage.unresolveEntry(id);
    const entry = await this.storage.findById(id);
    return { success: true, data: entry };
  }

  // ==================== Recording Control Endpoints ====================

  /**
   * Pause recording
   */
  @Post('recording/pause')
  async pauseRecording(@Body() body: { reason?: string }) {
    this.collectorService.pause(body.reason);
    const status = this.collectorService.getRecordingStatus();
    return { success: true, data: status };
  }

  /**
   * Resume recording
   */
  @Post('recording/resume')
  async resumeRecording() {
    this.collectorService.resume();
    const status = this.collectorService.getRecordingStatus();
    return { success: true, data: status };
  }

  /**
   * Get recording status
   */
  @Get('recording/status')
  async getRecordingStatus() {
    const status = this.collectorService.getRecordingStatus();
    return { data: status };
  }
}
