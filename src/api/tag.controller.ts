import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TagService } from '../core/tag.service';
import { NESTLENS_API_PREFIX } from '../nestlens.config';
import { NestLensGuard } from './api.guard';

@Controller(`${NESTLENS_API_PREFIX}/api/tags`)
@UseGuards(NestLensGuard)
export class TagController {
  constructor(private readonly tagService: TagService) {}

  /**
   * Get all tags with their counts
   */
  @Get()
  async getAllTags() {
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
  ) {
    const tags = tagsParam.split(',').map(t => t.trim()).filter(Boolean);
    const entries = await this.tagService.findByTags(
      tags,
      logic || 'OR',
      limit ? parseInt(limit, 10) : 50,
    );
    return { data: entries };
  }

  /**
   * Get tags for a specific entry
   */
  @Get('entry/:id')
  async getEntryTags(@Param('id', ParseIntPipe) id: number) {
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
  async getMonitoredTags() {
    const tags = await this.tagService.getMonitoredTagsWithCounts();
    return { data: tags };
  }

  /**
   * Add a monitored tag
   */
  @Post('monitored')
  async addMonitoredTag(@Body() body: { tag: string }) {
    const tag = await this.tagService.addMonitoredTag(body.tag);
    return { success: true, data: tag };
  }

  /**
   * Remove a monitored tag
   */
  @Delete('monitored/:tag')
  async removeMonitoredTag(@Param('tag') tag: string) {
    await this.tagService.removeMonitoredTag(tag);
    return { success: true };
  }
}
