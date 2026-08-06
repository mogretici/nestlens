/**
 * Live end-to-end regression guard for the entries filter pipe and GraphQL tags.
 *
 * Boots a REAL NestJS (Express) application with NestLensModule and drives the
 * entries API over real HTTP, so the request actually flows through
 * NestLensGuard -> NestLensValidationPipe -> CursorQueryDto -> storage. This is
 * the end-to-end proof for:
 *   - the duplicate-package-safe validation pipe accepting comma-separated
 *     filters without a 400 (the core fix),
 *   - GraphQL entries receiving auto-tags (SUCCESS / USER / custom) via the
 *     live collect() -> autoTag() path,
 *   - case-insensitive tag filtering (badge click), and
 *   - search matching entry tags (search-by-tag feature).
 */
import 'reflect-metadata';
import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import request from 'supertest';
import { NestLensModule } from '../../nestlens.module';
import { CollectorService } from '../../core/collector.service';
import { DEFAULT_CONFIG, NESTLENS_API_PREFIX } from '../../nestlens.config';
import { toBaseHref } from '../../api/route-path';
import type { Entry } from '../../types';

@Controller('demo')
class DemoController {
  @Get('ok')
  ok(): { ok: boolean } {
    return { ok: true };
  }
}

@Module({
  imports: [NestLensModule.forRoot({ watchers: { request: true } })],
  controllers: [DemoController],
})
class AppModule {}

// The API lives under the configured mount point, so derive it from the default
// rather than hard-coding a prefix.
const CURSOR = `${toBaseHref(DEFAULT_CONFIG.path)}/${NESTLENS_API_PREFIX}/api/entries/cursor`;

describe('Entries filter pipe + GraphQL tags + search (real HTTP)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, new ExpressAdapter(), { logger: false });
    await app.init();

    const collector = app.get(CollectorService);
    // Seed a GraphQL entry shaped exactly as the adapter produces it
    // (headers already masked, custom tag present).
    await collector.collectImmediate('graphql', {
      operationName: 'GetUser',
      operationType: 'query',
      query: 'query GetUser { user { id } }',
      queryHash: 'hash-getuser',
      duration: 12,
      statusCode: 200,
      hasErrors: false,
      headers: { authorization: '***', 'user-agent': 'jest' },
      user: { id: 'user-7' },
      tags: ['checkout'],
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  const httpServer = (): Parameters<typeof request>[0] => app.getHttpServer();

  it('accepts a comma-separated status filter over the real pipe (200, not 400)', async () => {
    const res = await request(httpServer()).get(CURSOR).query({ statuses: '200,404' });
    expect(res.status).toBe(200);
  });

  it('accepts several comma-separated / boolean filters together (no 400)', async () => {
    const res = await request(httpServer()).get(CURSOR).query({
      methods: 'GET,POST',
      operationNames: 'GetUser',
      hasErrors: 'false',
      levels: 'log,error',
    });
    expect(res.status).toBe(200);
  });

  it('strips unknown query params instead of 400ing (whitelist)', async () => {
    const res = await request(httpServer()).get(CURSOR).query({ notARealFilter: 'x' });
    expect(res.status).toBe(200);
  });

  it('auto-tags the GraphQL entry (SUCCESS + USER + custom) and keeps masked headers', async () => {
    const res = await request(httpServer()).get(CURSOR).query({ type: 'graphql' });
    expect(res.status).toBe(200);
    const entry = (res.body.data as Entry[]).find(
      (e) => (e.payload as { operationName?: string }).operationName === 'GetUser',
    );
    expect(entry).toBeDefined();
    // Tags are normalized to UPPERCASE by the storage layer (consistent across
    // all watchers), so the stored USER tag is USER:USER-7, not USER:user-7.
    expect(entry!.tags).toEqual(expect.arrayContaining(['SUCCESS', 'USER:USER-7', 'CHECKOUT']));
    expect((entry!.payload as { headers?: Record<string, string> }).headers?.authorization).toBe(
      '***',
    );
  });

  it('filters by tag case-insensitively (badge click finds the graphql entry)', async () => {
    const res = await request(httpServer())
      .get(CURSOR)
      .query({ type: 'graphql', tags: 'checkout' });
    expect(res.status).toBe(200);
    const found = (res.body.data as Entry[]).some(
      (e) => (e.payload as { operationName?: string }).operationName === 'GetUser',
    );
    expect(found).toBe(true);
  });

  it('search matches an auto-tag (search-by-tag) over HTTP', async () => {
    const res = await request(httpServer())
      .get(CURSOR)
      .query({ type: 'graphql', search: 'checkout' });
    expect(res.status).toBe(200);
    const found = (res.body.data as Entry[]).some(
      (e) => (e.payload as { operationName?: string }).operationName === 'GetUser',
    );
    expect(found).toBe(true);
  });
});
