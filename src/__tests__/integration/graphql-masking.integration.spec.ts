/**
 * What a GraphQL entry looks like by the time it reaches storage.
 *
 * Two services decide that between them and neither can be judged alone: the
 * watcher's sanitizer produces the clean copy, and `CollectorService.mask()`
 * masks whatever the watcher did not. A field is only readable on the dashboard
 * if both agree, and only safe if at least one of them acts — so this exercises
 * the pair on a payload shaped like the ones that were getting it wrong.
 */
import { Test } from '@nestjs/testing';
import { CollectorService } from '../../core/collector.service';
import { DataMaskerService } from '../../core/data-masker.service';
import { STORAGE, StorageInterface } from '../../core/storage/storage.interface';
import { NESTLENS_CONFIG, NestLensConfig } from '../../nestlens.config';
import { Entry, GraphQLPayload } from '../../types';
import { GRAPHQL_DEFAULTS } from '../../watchers/graphql/types';
import {
  sanitizeResponse,
  sanitizeVariables,
} from '../../watchers/graphql/utils/variable-sanitizer';

const PATTERNS = GRAPHQL_DEFAULTS.sensitiveVariables;
const REDACTED = '***REDACTED***';

describe('GraphQL entries from watcher to storage', () => {
  let collector: CollectorService;
  let saved: Entry[];

  beforeEach(async () => {
    saved = [];

    const storage: Partial<StorageInterface> = {
      save: jest.fn(async (entry: Entry) => {
        saved.push(entry);
        return { ...entry, id: saved.length };
      }),
      saveBatch: jest.fn(async (entries: Entry[]) => {
        saved.push(...entries);
        return entries;
      }),
      updateFamilyHash: jest.fn(),
    };

    const config: NestLensConfig = { enabled: true, watchers: { graphql: true } };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CollectorService,
        { provide: STORAGE, useValue: storage },
        { provide: NESTLENS_CONFIG, useValue: config },
        { provide: DataMaskerService, useValue: new DataMaskerService() },
      ],
    }).compile();

    collector = moduleRef.get(CollectorService);
  });

  afterEach(async () => {
    await collector.onModuleDestroy();
  });

  /** A payload shaped the way the Apollo adapter builds one. */
  const buildPayload = (): GraphQLPayload =>
    ({
      operationName: 'Feed',
      operationType: 'query',
      query: 'query Feed { feed { id } }',
      queryHash: 'abc123',
      duration: 12,
      statusCode: 200,
      hasErrors: true,
      variables: sanitizeVariables(
        { first: 20, apiToken: 'ak_live_secret', shoppingCart: { itemCount: 2 } },
        PATTERNS,
      ),
      responseData: sanitizeResponse(
        {
          feed: {
            tokenCount: 7,
            shippingAddress: { city: 'Istanbul', postalCode: '34710' },
            shoppingCart: { itemCount: 2, subtotal: 1299.9 },
            spinner: false,
            isPinned: true,
            topping: null,
            secretary: null,
            author: { id: 'u1', password: 'hunter2', accessToken: 'at_live_x' },
          },
        },
        PATTERNS,
        GRAPHQL_DEFAULTS.maxResponseSize,
      ),
      // Nothing sanitizes this: a resolver puts whatever it likes in
      // `extensions`, which is exactly why the collector still has to look.
      errors: [
        {
          message: 'Upstream refused',
          extensions: { code: 'BAD_GATEWAY', token: 'leaked-upstream-token' },
        },
      ],
      headers: { 'user-agent': 'jest' },
      user: { id: 'u1', name: 'Wearer', email: 'wearer@example.com' },
    }) as unknown as GraphQLPayload;

  const collectAndRead = async (): Promise<GraphQLPayload> => {
    await collector.collectImmediate('graphql', buildPayload(), 'req-1');
    return saved[0].payload as GraphQLPayload;
  };

  it('keeps the fields a substring matcher used to redact', async () => {
    const payload = await collectAndRead();
    const feed = (payload.responseData as Record<string, Record<string, unknown>>).feed;

    // Every one of these reached the dashboard as '***' before word-boundary
    // matching, which made it describe a response the API never sent.
    expect(feed.tokenCount).toBe(7);
    expect(feed.shippingAddress).toEqual({ city: 'Istanbul', postalCode: '34710' });
    expect(feed.shoppingCart).toEqual({ itemCount: 2, subtotal: 1299.9 });
    expect(feed.spinner).toBe(false);
    expect(feed.isPinned).toBe(true);
    expect(feed.topping).toBeNull();
    expect(feed.secretary).toBeNull();
  });

  it('still masks the credentials in the same response', async () => {
    const payload = await collectAndRead();
    const feed = (payload.responseData as Record<string, Record<string, unknown>>).feed;
    const author = feed.author as Record<string, unknown>;

    expect(author.password).toBe('***');
    expect(author.accessToken).toBe('***');
    expect(author.id).toBe('u1');
  });

  it('masks the variables the watcher sanitized', async () => {
    const payload = await collectAndRead();

    expect(payload.variables?.apiToken).toBe('***');
    expect(payload.variables?.first).toBe(20);
    expect(payload.variables?.shoppingCart).toEqual({ itemCount: 2 });
  });

  it('masks the part of the payload no watcher sanitized', async () => {
    const payload = await collectAndRead();
    const extensions = payload.errors?.[0].extensions as Record<string, unknown>;

    // The collector is the only thing looking at `extensions`. If skipping the
    // second traversal ever becomes entry-wide, this is what leaks.
    expect(extensions.token).toBe(REDACTED);
    expect(extensions.code).toBe('BAD_GATEWAY');
  });

  it('hands storage the sanitized copy rather than a clone of it', async () => {
    const original = buildPayload();
    await collector.collectImmediate('graphql', original, 'req-1');
    const stored = saved[0].payload as GraphQLPayload;

    // The saving in fix 2: the largest subtrees in the entry are passed
    // through, not deep-cloned a second time.
    expect(stored.responseData).toBe(original.responseData);
    expect(stored.variables).toBe(original.variables);
  });

  it('masks an unsanitized payload from any other watcher as before', async () => {
    await collector.collectImmediate(
      'request',
      {
        method: 'POST',
        url: '/login',
        path: '/login',
        query: {},
        params: {},
        headers: {},
        statusCode: 200,
        duration: 5,
        memory: 1,
        body: { password: 'hunter2', tokenCount: 3, username: 'wearer' },
      } as never,
      'req-2',
    );

    const body = (saved[0].payload as { body: Record<string, unknown> }).body;

    expect(body.password).toBe(REDACTED);
    // Still broad here, deliberately — see the comment on `matchesSensitiveTerm`.
    expect(body.tokenCount).toBe(REDACTED);
    expect(body.username).toBe('wearer');
  });
});
