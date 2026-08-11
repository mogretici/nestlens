import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { TagService } from '../core/tag.service';
import { NESTLENS_API_PREFIX } from '../nestlens.config';
import { NestLensGuard } from './api.guard';
import { NestLensApiExceptionFilter } from './filters/api-exception.filter';
import { NestLensApiResponseInterceptor } from './interceptors/api-response.interceptor';

/**
 * Every handler here takes an unused `@Res() _res` parameter — see
 * `NestLensApiController` for why: it tells Nest the response is already
 * written by `NestLensApiResponseInterceptor`, which keeps the framework from
 * replying a second time on Nest 9/10 with Express.
 */
@Controller(`${NESTLENS_API_PREFIX}/api/tags`)
@UseGuards(NestLensGuard)
@UseFilters(NestLensApiExceptionFilter)
@UseInterceptors(NestLensApiResponseInterceptor)
export class TagController {
  constructor(private readonly tagService: TagService) {}

  /**
   * Get all tags with their counts
   */
  @Get()
  async getAllTags(@Res() _res?: unknown) {
    const tags = await this.tagService.getAllTags();
    return { data: tags };
  }

  /**
   * Get entries by tag(s)
   */
  @Get('entries')
  async getEntriesByTags(
    @Query('tags') tagsParam: string,
    @Query('logic') logic?: 'AND' | 'OR',
    @Query('limit') limit?: string,
    @Res() _res?: unknown,
  ) {
    const tags = tagsParam
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const entries = await this.tagService.findByTags(
      tags,
      logic ?? 'OR',
      limit ? parseInt(limit, 10) : 50,
    );
    return { data: entries };
  }

  /**
   * Get tags for a specific entry
   */
  @Get('entry/:id')
  async getEntryTags(@Param('id', ParseIntPipe) id: number, @Res() _res?: unknown) {
    const tags = await this.tagService.getEntryTags(id);
    return { data: tags };
  }

  /**
   * Add tags to an entry
   */
  @Post('entry/:id')
  async addTagsToEntry(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { tags: string[] },
    @Res() _res?: unknown,
  ) {
    await this.tagService.addTags(id, body.tags);
    const tags = await this.tagService.getEntryTags(id);
    return { success: true, data: tags };
  }

  /**
   * Remove tags from an entry
   */
  @Delete('entry/:id')
  async removeTagsFromEntry(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { tags: string[] },
    @Res() _res?: unknown,
  ) {
    await this.tagService.removeTags(id, body.tags);
    const tags = await this.tagService.getEntryTags(id);
    return { success: true, data: tags };
  }

  // ==================== Monitored Tags ====================

  /**
   * Get all monitored tags
   */
  @Get('monitored')
  async getMonitoredTags(@Res() _res?: unknown) {
    const tags = await this.tagService.getMonitoredTagsWithCounts();
    return { data: tags };
  }

  /**
   * Add a monitored tag
   */
  @Post('monitored')
  async addMonitoredTag(@Body() body: { tag: string }, @Res() _res?: unknown) {
    const tag = await this.tagService.addMonitoredTag(body.tag);
    return { success: true, data: tag };
  }

  /**
   * Remove a monitored tag
   */
  @Delete('monitored/:tag')
  async removeMonitoredTag(@Param('tag') tag: string, @Res() _res?: unknown) {
    await this.tagService.removeMonitoredTag(tag);
    return { success: true };
  }
}
