import {
  Controller,
  Get,
  Res,
  UseFilters,
  UseGuards,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { NESTLENS_API_PREFIX } from '../nestlens.config';
import { WatcherStatusReport, WatcherStatusService } from '../watchers/watcher-status.service';
import { NestLensGuard } from './api.guard';
import { NestLensApiExceptionFilter } from './filters/api-exception.filter';
import { NestLensApiResponseInterceptor } from './interceptors/api-response.interceptor';
import { NestLensTool } from './tools';
import { NestLensValidationPipe } from './pipes';

/**
 * Whether each watcher can record anything. The unused `@Res() _res` is
 * explained on `NestLensApiController`.
 */
@Controller(`${NESTLENS_API_PREFIX}/api/watchers`)
@UsePipes(new NestLensValidationPipe())
@UseGuards(NestLensGuard)
@UseFilters(NestLensApiExceptionFilter)
@UseInterceptors(NestLensApiResponseInterceptor)
export class WatcherStatusController {
  constructor(private readonly statusService: WatcherStatusService) {}

  @NestLensTool({
    description:
      'Every watcher and whether it can record anything: `off` (switched off in the configuration), `recording` (attached and recording), `waiting` (switched on, with nothing attached to observe, so it records nothing) or `manual` (records only what the application code hands its manual API). Each comes with a one-line reason and the documentation page with the fix. Call this when a type has no entries, to tell an idle system from a watcher that cannot see anything — "why is the Redis tab empty?"',
  })
  @Get()
  async getWatcherStatus(@Res() _res?: unknown): Promise<{ data: WatcherStatusReport[] }> {
    return { data: this.statusService.statuses() };
  }
}
