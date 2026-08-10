import { Controller, Sse, UseGuards } from '@nestjs/common';
import { interval, map, merge, Observable } from 'rxjs';
import { CollectorService } from '@/core';
import { NESTLENS_API_PREFIX } from '@/nestlens.config';
import { Entry } from '@/types';
import { NestLensGuard } from './api.guard';

/** Shape NestJS serializes into a Server-Sent Event. */
interface NestLensStreamEvent {
  /** Becomes the SSE `event:` field. */
  type: 'entry' | 'ping';
  data: Entry | string;
}

/** Heartbeat interval (ms) — keeps the SSE connection alive through proxies. */
const HEARTBEAT_INTERVAL = 30_000;

/**
 * Real-time entry stream (Server-Sent Events).
 *
 * Deliberately kept on its own controller — without the API response
 * interceptor/exception filter — so the SSE body is never wrapped. Adapter
 * agnostic: NestJS `@Sse()` works on both Express and Fastify.
 */
@Controller(`${NESTLENS_API_PREFIX}/stream`)
@UseGuards(NestLensGuard)
export class NestLensStreamController {
  constructor(private readonly collector: CollectorService) {}

  @Sse()
  stream(): Observable<NestLensStreamEvent> {
    const entries$ = this.collector.entryStream$.pipe(
      map((entry): NestLensStreamEvent => ({ type: 'entry', data: entry })),
    );
    const heartbeat$ = interval(HEARTBEAT_INTERVAL).pipe(
      map((): NestLensStreamEvent => ({ type: 'ping', data: '' })),
    );
    return merge(entries$, heartbeat$);
  }
}
