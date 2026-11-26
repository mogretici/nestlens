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
  UsePipes,
} from '@nestjs/common';
import { TagService } from '../core/tag.service';
import { NESTLENS_API_PREFIX } from '../nestlens.config';
import { DEFAULT_LIMIT, EntryTagsDto, MonitoredTagDto, TagEntriesQueryDto } from './dto';
import { NestLensGuard } from './api.guard';
import { NestLensApiExceptionFilter } from './filters/api-exception.filter';
import { NestLensApiResponseInterceptor } from './interceptors/api-response.interceptor';
import { NestLensTool } from './tools';
import { NestLensValidationPipe } from './pipes';

/**
 * Every handler here takes an unused `@Res() _res` parameter — see
 * `NestLensApiController` for why: it tells Nest the response is already
 * written by `NestLensApiResponseInterceptor`, which keeps the framework from
 * replying a second time on Nest 9/10 with Express.
 */
@Controller(`${NESTLENS_API_PREFIX}/api/tags`)
@UsePipes(new NestLensValidationPipe())
@UseGuards(NestLensGuard)
@UseFilters(NestLensApiExceptionFilter)
@UseInterceptors(NestLensApiResponseInterceptor)
export class TagController {
  constructor(private readonly tagService: TagService) {}

  /**
   * Get all tags with their counts
   */
  @NestLensTool({
    description:
      'Every tag in use with how many entries carry it. NestLens tags entries automatically from their content, and tags can be added by hand.',
  })
  @Get()
  async getAllTags(@Res() _res?: unknown) {
    const tags = await this.tagService.getAllTags();
    return { data: tags };
  }

  /**
   * Get entries by tag(s)
   */
  @NestLensTool({
    description:
      'Entries carrying one or more tags. `logic` is OR (any of the tags, the default) or AND (all of them).',
  })
  @Get('entries')
  async getEntriesByTags(@Query() query: TagEntriesQueryDto, @Res() _res?: unknown) {
    const entries = await this.tagService.findByTags(
      query.tags,
      query.logic ?? 'OR',
      query.limit ?? DEFAULT_LIMIT,
    );
    return { data: entries };
  }

  /**
   * Get tags for a specific entry
   */
  @NestLensTool({
    description: 'The tags on one entry.',
  })
  @Get('entry/:id')
  async getEntryTags(@Param('id', ParseIntPipe) id: number, @Res() _res?: unknown) {
    const tags = await this.tagService.getEntryTags(id);
    return { data: tags };
  }

  /**
   * Add tags to an entry
   */
  @NestLensTool({
    description: 'Add tags to an entry.',
  })
  @Post('entry/:id')
  async addTagsToEntry(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: EntryTagsDto,
    @Res() _res?: unknown,
  ) {
    await this.tagService.addTags(id, body.tags);
    const tags = await this.tagService.getEntryTags(id);
    return { success: true, data: tags };
  }

  /**
   * Remove tags from an entry
   */
  @NestLensTool({
    description: 'Remove tags from an entry.',
  })
  @Delete('entry/:id')
  async removeTagsFromEntry(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: EntryTagsDto,
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
  @NestLensTool({
    description:
      'Tags that are monitored, with their entry counts. Pruning never deletes an entry that carries one.',
  })
  @Get('monitored')
  async getMonitoredTags(@Res() _res?: unknown) {
    const tags = await this.tagService.getMonitoredTagsWithCounts();
    return { data: tags };
  }

  /**
   * Add a monitored tag
   */
  @NestLensTool({
    description: 'Monitor a tag, so pruning keeps every entry that carries it.',
  })
  @Post('monitored')
  async addMonitoredTag(@Body() body: MonitoredTagDto, @Res() _res?: unknown) {
    const tag = await this.tagService.addMonitoredTag(body.tag);
    return { success: true, data: tag };
  }

  /**
   * Remove a monitored tag
   */
  @NestLensTool({
    description: 'Stop monitoring a tag. Entries it protected become eligible for pruning again.',
  })
  @Delete('monitored/:tag')
  async removeMonitoredTag(@Param('tag') tag: string, @Res() _res?: unknown) {
    await this.tagService.removeMonitoredTag(tag);
    return { success: true };
  }
}
