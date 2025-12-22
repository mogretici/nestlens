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
  UseGuards,
} from '@nestjs/common';
import { STORAGE, StorageInterface } from '../core/storage/storage.interface';
import { PruningService } from '../core/pruning.service';
import { CollectorService } from '../core/collector.service';
import { NestLensConfig, NESTLENS_API_PREFIX, NESTLENS_CONFIG } from '../nestlens.config';
import { EntryType, CursorPaginatedResponse, Entry } from '../types';
import { NestLensGuard } from './api.guard';

// Pagination limits to prevent DoS
const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 50;

@Controller(`${NESTLENS_API_PREFIX}/api`)
@UseGuards(NestLensGuard)
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
   * Cursor-based pagination endpoints
   * NOTE: These must come BEFORE @Get('entries/:id') to avoid route conflicts
   */
  @Get('entries/cursor')
  async getEntriesWithCursor(
    @Query('type') type?: EntryType,
    @Query('limit') limit?: string,
    @Query('beforeSequence') beforeSequence?: string,
    @Query('afterSequence') afterSequence?: string,
    // Filter parameters
    @Query('levels') levels?: string,
    @Query('contexts') contexts?: string,
    @Query('queryTypes') queryTypes?: string,
    @Query('sources') sources?: string,
    @Query('slow') slow?: string,
    @Query('names') names?: string,
    @Query('methods') methods?: string,
    @Query('paths') paths?: string,
    @Query('resolved') resolved?: string,
    @Query('statuses') statuses?: string,
    @Query('hostnames') hostnames?: string,
    @Query('controllers') controllers?: string,
    @Query('ips') ips?: string,
    @Query('scheduleStatuses') scheduleStatuses?: string,
    @Query('jobStatuses') jobStatuses?: string,
    @Query('queues') queues?: string,
    @Query('cacheOperations') cacheOperations?: string,
    @Query('mailStatuses') mailStatuses?: string,
    // New entry type filters
    @Query('redisStatuses') redisStatuses?: string,
    @Query('redisCommands') redisCommands?: string,
    @Query('modelActions') modelActions?: string,
    @Query('entities') entities?: string,
    @Query('modelSources') modelSources?: string,
    @Query('notificationTypes') notificationTypes?: string,
    @Query('notificationStatuses') notificationStatuses?: string,
    @Query('viewFormats') viewFormats?: string,
    @Query('viewStatuses') viewStatuses?: string,
    @Query('commandStatuses') commandStatuses?: string,
    @Query('commandNames') commandNames?: string,
    @Query('gateNames') gateNames?: string,
    @Query('gateResults') gateResults?: string,
    @Query('batchStatuses') batchStatuses?: string,
    @Query('batchOperations') batchOperations?: string,
    @Query('dumpStatuses') dumpStatuses?: string,
    @Query('dumpOperations') dumpOperations?: string,
    @Query('dumpFormats') dumpFormats?: string,
    @Query('tags') tags?: string,
    @Query('search') search?: string,
  ): Promise<CursorPaginatedResponse<Entry>> {
    // Build filters object from query params
    const filters: {
      levels?: string[];
      contexts?: string[];
      queryTypes?: string[];
      sources?: string[];
      slow?: boolean;
      names?: string[];
      methods?: string[];
      paths?: string[];
      resolved?: boolean;
      statuses?: (number | 'ERR')[];
      hostnames?: string[];
      controllers?: string[];
      ips?: string[];
      scheduleStatuses?: string[];
      jobStatuses?: string[];
      queues?: string[];
      cacheOperations?: string[];
      mailStatuses?: string[];
      // New entry type filters
      redisStatuses?: string[];
      redisCommands?: string[];
      modelActions?: string[];
      entities?: string[];
      modelSources?: string[];
      notificationTypes?: string[];
      notificationStatuses?: string[];
      viewFormats?: string[];
      viewStatuses?: string[];
      commandStatuses?: string[];
      commandNames?: string[];
      gateNames?: string[];
      gateResults?: string[];
      batchStatuses?: string[];
      batchOperations?: string[];
      dumpStatuses?: string[];
      dumpOperations?: string[];
      dumpFormats?: string[];
      tags?: string[];
      search?: string;
    } = {};

    if (levels) filters.levels = levels.split(',').filter(Boolean);
    if (contexts) filters.contexts = contexts.split(',').filter(Boolean);
    if (queryTypes) filters.queryTypes = queryTypes.split(',').filter(Boolean);
    if (sources) filters.sources = sources.split(',').filter(Boolean);
    if (slow !== undefined) filters.slow = slow === 'true';
    if (names) filters.names = names.split(',').filter(Boolean);
    if (methods) filters.methods = methods.split(',').filter(Boolean);
    if (paths) filters.paths = paths.split(',').filter(Boolean);
    if (resolved !== undefined) filters.resolved = resolved === 'true';
    if (statuses) {
      filters.statuses = statuses.split(',').filter(Boolean).map(s =>
        s.toUpperCase() === 'ERR' ? 'ERR' as const : parseInt(s, 10)
      );
    }
    if (hostnames) filters.hostnames = hostnames.split(',').filter(Boolean);
    if (controllers) filters.controllers = controllers.split(',').filter(Boolean);
    if (ips) filters.ips = ips.split(',').filter(Boolean);
    if (scheduleStatuses) filters.scheduleStatuses = scheduleStatuses.split(',').filter(Boolean);
    if (jobStatuses) filters.jobStatuses = jobStatuses.split(',').filter(Boolean);
    if (queues) filters.queues = queues.split(',').filter(Boolean);
    if (cacheOperations) filters.cacheOperations = cacheOperations.split(',').filter(Boolean);
    if (mailStatuses) filters.mailStatuses = mailStatuses.split(',').filter(Boolean);
    // New entry type filters
    if (redisStatuses) filters.redisStatuses = redisStatuses.split(',').filter(Boolean);
    if (redisCommands) filters.redisCommands = redisCommands.split(',').filter(Boolean);
    if (modelActions) filters.modelActions = modelActions.split(',').filter(Boolean);
    if (entities) filters.entities = entities.split(',').filter(Boolean);
    if (modelSources) filters.modelSources = modelSources.split(',').filter(Boolean);
    if (notificationTypes) filters.notificationTypes = notificationTypes.split(',').filter(Boolean);
    if (notificationStatuses) filters.notificationStatuses = notificationStatuses.split(',').filter(Boolean);
    if (viewFormats) filters.viewFormats = viewFormats.split(',').filter(Boolean);
    if (viewStatuses) filters.viewStatuses = viewStatuses.split(',').filter(Boolean);
    if (commandStatuses) filters.commandStatuses = commandStatuses.split(',').filter(Boolean);
    if (commandNames) filters.commandNames = commandNames.split(',').filter(Boolean);
    if (gateNames) filters.gateNames = gateNames.split(',').filter(Boolean);
    if (gateResults) filters.gateResults = gateResults.split(',').filter(Boolean);
    if (batchStatuses) filters.batchStatuses = batchStatuses.split(',').filter(Boolean);
    if (batchOperations) filters.batchOperations = batchOperations.split(',').filter(Boolean);
    if (dumpStatuses) filters.dumpStatuses = dumpStatuses.split(',').filter(Boolean);
    if (dumpOperations) filters.dumpOperations = dumpOperations.split(',').filter(Boolean);
    if (dumpFormats) filters.dumpFormats = dumpFormats.split(',').filter(Boolean);
    if (tags) filters.tags = tags.split(',').filter(Boolean);
    if (search) filters.search = search;

    // Only include filters if at least one is set
    const hasFilters = Object.keys(filters).length > 0;

    return this.storage.findWithCursor(type, {
      limit: this.parseLimit(limit),
      beforeSequence: beforeSequence ? parseInt(beforeSequence, 10) : undefined,
      afterSequence: afterSequence ? parseInt(afterSequence, 10) : undefined,
      filters: hasFilters ? filters : undefined,
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
  async getGroupedEntries(
    @Query('type') type?: EntryType,
    @Query('limit') limit?: string,
  ) {
    const groups = await this.storage.getGroupedByFamilyHash(
      type,
      this.parseLimit(limit),
    );
    return { data: groups };
  }

  /**
   * Get all entries with the same family hash
   * NOTE: Must come BEFORE @Get('entries/:id') to avoid route conflict
   */
  @Get('entries/family/:hash')
  async getEntriesByFamilyHash(
    @Param('hash') hash: string,
    @Query('limit') limit?: string,
  ) {
    const entries = await this.storage.findByFamilyHash(
      hash,
      this.parseLimit(limit),
    );
    return { data: entries };
  }

  @Get('entries/:id')
  async getEntry(@Param('id', ParseIntPipe) id: number) {
    const entry = await this.storage.findById(id);

    if (!entry) {
      return { data: null, error: 'Entry not found' };
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
  async getStats() {
    const stats = await this.storage.getStats();
    return { data: stats };
  }

  @Get('requests')
  async getRequests(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
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
      slow === 'true'
        ? entries.filter((e) => e.type === 'query' && e.payload.slow)
        : entries;

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
  async getExceptions(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
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
