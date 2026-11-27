/**
 * NestLens' API behind a host's global ValidationPipe that has its own copy of
 * class-transformer.
 *
 * That copy has never seen NestLens' `@Transform`s, so it hands NestLens'
 * validators the query exactly as the URL spelled it. `@IsInt` on
 * `minDuration` answered `?minDuration=500` with a 400 there, `@IsDate` did the
 * same to every `from`, and the dashboard's filters stopped working in that
 * application while every suite here stayed green. The second copy is a real
 * one: the package copied into a `node_modules` of the host's own and loaded
 * from there, which is what such an application has installed.
 *
 * Implicit conversion — the host's, and the one NestLens' own pipe asks for —
 * converts by `design:type` before any `@Transform` runs. TypeScript records
 * `resolved?: boolean` as `Boolean`, and `Boolean('false')` is `true`, so the
 * dashboard's "unresolved exceptions" link listed the resolved ones. A blank
 * number became `Number('')`, which is `0`: `?limit=` asked for one entry and
 * `?beforeSequence=` for the page below sequence zero. What reaches the
 * storage is asserted here, not only the status.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import 'reflect-metadata';
import { cpSync, mkdtempSync, rmSync } from 'fs';
import { createRequire } from 'module';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { INestApplication, Module, ValidationPipe, ValidationPipeOptions } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import request from 'supertest';
import { getMetadataStorage, ValidationTypes } from 'class-validator';
import { NestLensModule } from '../../nestlens.module';
import { STORAGE, StorageInterface } from '../../core';
import { TagService } from '../../core/tag.service';
import * as dtos from '../../api/dto';
import {
  CheckNewQueryDto,
  ClearEntriesQueryDto,
  CursorQueryDto,
  EntriesQueryDto,
  FamilyQueryDto,
  GroupedEntriesQueryDto,
  LatestSequenceQueryDto,
  LogsQueryDto,
  PageQueryDto,
  QueriesQueryDto,
  TagEntriesQueryDto,
} from '../../api/dto';
import { DEFAULT_CONFIG, NESTLENS_API_PREFIX } from '../../nestlens.config';
import { toBaseHref } from '../../api/route-path';
import { mutatingQueryRoutes } from '../support/query-bindings';

type TransformerPackage = NonNullable<ValidationPipeOptions['transformerPackage']>;

const hostDirectory = mkdtempSync(join(tmpdir(), 'nestlens-host-'));

afterAll(() => rmSync(hostDirectory, { recursive: true, force: true }));

const anotherClassTransformer = (): TransformerPackage => {
  const installed = dirname(require.resolve('class-transformer/package.json'));
  cpSync(installed, join(hostDirectory, 'node_modules', 'class-transformer'), { recursive: true });

  return createRequire(join(hostDirectory, 'index.js'))('class-transformer') as TransformerPackage;
};

@Module({ imports: [NestLensModule.forRoot({})] })
class HostModule {}

const API = `${toBaseHref(DEFAULT_CONFIG.path)}/${NESTLENS_API_PREFIX}/api`;

/** What the dashboard sends, one parameter of each kind per endpoint. */
const ANSWERED: [string, Record<string, string>][] = [
  ['/entries', { offset: '100', from: '2026-08-22T14:03:00Z', minDuration: '500' }],
  ['/entries', { to: '2026-08-22', maxDuration: '2000', limit: '20' }],
  ['/requests', { minDuration: '500', from: '2026-08-22T14:03:00Z' }],
  ['/logs', { level: 'error', offset: '10000' }],
  ['/queries', { slow: 'true', minDuration: '0' }],
  ['/entries/cursor', { type: 'request', minDuration: '500', maxDuration: '2000' }],
  ['/entries/cursor', { beforeSequence: '300', statuses: '200,404', slow: 'true' }],
  ['/entries/cursor', { beforeSequence: '5', afterSequence: '' }],
  ['/entries/cursor', { beforeSequence: '', afterSequence: '5' }],
  ['/entries/cursor', { beforeSequence: '5', afterSequence: '   ' }],
  ['/entries', { type: '', from: '', to: '', offset: '' }],
  ['/queries', { slow: '' }],
  ['/entries/check-new', { afterSequence: '100' }],
  ['/tags/entries', { tags: 'SUCCESS,USER:1', logic: 'AND', limit: '10' }],
];

const REFUSED: [string, Record<string, string>][] = [
  ['/entries/cursor', { beforeSequence: '5', afterSequence: '6' }],
  ['/entries/check-new', { afterSequence: '' }],
  ['/entries', { minDuration: 'abc' }],
  ['/entries', { offset: '10001' }],
  ['/entries', { from: 'yesterday' }],
  ['/entries/cursor', { maxDuration: 'slow' }],
  ['/tags/entries', { tags: ',,' }],
];

type Dto = new () => object;

type Method = 'get' | 'delete';

/** The endpoint each query DTO is read through, so its properties can be driven over HTTP. */
const ENDPOINTS = new Map<Dto, [Method, string]>([
  [CursorQueryDto, ['get', '/entries/cursor']],
  [EntriesQueryDto, ['get', '/entries']],
  [PageQueryDto, ['get', '/requests']],
  [GroupedEntriesQueryDto, ['get', '/entries/grouped']],
  [FamilyQueryDto, ['get', '/entries/family/0123456789abcdef']],
  [LogsQueryDto, ['get', '/logs']],
  [QueriesQueryDto, ['get', '/queries']],
  [CheckNewQueryDto, ['get', '/entries/check-new']],
  [LatestSequenceQueryDto, ['get', '/entries/latest-sequence']],
  [ClearEntriesQueryDto, ['delete', '/entries']],
  [TagEntriesQueryDto, ['get', '/tags/entries']],
]);

/** What a query needs to be answered at all, so a property can be tried on its own. */
const BASE = new Map<Dto, Record<string, string>>([
  [TagEntriesQueryDto, { tags: 'a' }],
  [CheckNewQueryDto, { afterSequence: '1' }],
]);

const isRequired = (dto: Dto, property: string): boolean =>
  !getMetadataStorage()
    .getTargetValidationMetadatas(dto, '', true, false)
    .some(
      (metadata) =>
        metadata.propertyName === property &&
        metadata.type === ValidationTypes.CONDITIONAL_VALIDATION,
    );

type Property = [dtoName: string, property: string, dto: Dto];

const endpointOf = (dto: Dto): [Method, string] => {
  const endpoint = ENDPOINTS.get(dto);
  if (endpoint === undefined) throw new Error(`No endpoint drives ${dto.name}`);
  return endpoint;
};

/** Every query DTO the package exports; one without an endpoint above fails in `endpointOf`. */
const QUERY_DTOS = Object.values(dtos).filter(
  (value): value is Dto =>
    typeof value === 'function' && value.name.endsWith('QueryDto') && 'prototype' in value,
);

const validatedBy = (name: string): Property[] =>
  QUERY_DTOS.flatMap((dto) =>
    [
      ...new Set(
        getMetadataStorage()
          .getTargetValidationMetadatas(dto, '', true, false)
          .filter((metadata) => metadata.name === name)
          .map((metadata): string => metadata.propertyName),
      ),
    ].map((property): Property => [dto.name, property, dto]),
  );

const BOOLEANS = validatedBy('isBooleanLike');

/**
 * Every whole-number property, and `limit`, which carries no validator: its
 * transform reads anything into a page size.
 */
const NUMBERS: Property[] = [
  ...validatedBy('isWholeNumberLike'),
  ...QUERY_DTOS.filter((dto) =>
    getMetadataStorage()
      .getTargetValidationMetadatas(dto, '', true, false)
      .some((metadata) => metadata.propertyName === 'limit'),
  ).map((dto): Property => [dto.name, 'limit', dto]),
];

/** The query DTOs of routes that change something, from the controllers' route metadata. */
const MUTATING = new Set<Dto>(mutatingQueryRoutes().map((route) => route.dto));

const propertiesOf = (dto: Dto): Property[] =>
  [
    ...new Set(
      getMetadataStorage()
        .getTargetValidationMetadatas(dto, '', true, false)
        .map((metadata): string => metadata.propertyName),
    ),
  ].map((property): Property => [dto.name, property, dto]);

/**
 * Every property of a mutating route's query: what it narrows. Blank, it is
 * refused — an empty form field must not widen a delete to everything.
 */
const SCOPE_PROPERTIES: Property[] = [...MUTATING].flatMap(propertiesOf);

/** Every property every query DTO declares. */
const EVERY_PROPERTY: Property[] = QUERY_DTOS.filter((dto) => !MUTATING.has(dto)).flatMap((dto) =>
  [
    ...new Set(
      getMetadataStorage()
        .getTargetValidationMetadatas(dto, '', true, false)
        .map((metadata): string => metadata.propertyName),
    ),
  ].map((property): Property => [dto.name, property, dto]),
);

describe.each([
  ['with no pipe of its own', undefined],
  ['without implicit conversion', {}],
  ['with implicit conversion', { transformOptions: { enableImplicitConversion: true } }],
])("NestLens' API behind a host ValidationPipe, %s", (_name, options) => {
  let app: INestApplication;
  let reads: [string, MockInstance][];

  beforeAll(async () => {
    app = await NestFactory.create(HostModule, new ExpressAdapter(), { logger: false });
    if (options) {
      app.useGlobalPipes(
        new ValidationPipe({
          transform: true,
          transformerPackage: anotherClassTransformer(),
          ...options,
        }),
      );
    }
    // Listening once: left to supertest, an application that is not listening
    // is given a server of its own per request, and twelve hundred of them
    // ran this suite out of sockets on a loaded machine ("socket hang up").
    await app.listen(0, '127.0.0.1');

    // Every method the storage has, so what a request reached is never judged
    // by a list that forgot one.
    const storage = app.get<StorageInterface>(STORAGE) as unknown as Record<string, unknown>;
    const methods = new Set<string>();
    for (let proto = Object.getPrototypeOf(storage); proto && proto !== Object.prototype;) {
      Object.getOwnPropertyNames(proto)
        .filter((name) => name !== 'constructor' && typeof storage[name] === 'function')
        .forEach((name) => methods.add(name));
      proto = Object.getPrototypeOf(proto);
    }
    reads = [
      ...[...methods].map((name): [string, MockInstance] => [
        name,
        vi.spyOn(storage as never, name as never),
      ]),
      ['findByTags', vi.spyOn(app.get(TagService), 'findByTags')],
    ];
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await app?.close();
  });

  /** The status, and every call the storage was handed for the request. */
  const reached = async (
    [method, path]: [Method, string],
    query: Record<string, string>,
  ): Promise<{ status: number; storage: unknown[] }> => {
    reads.forEach(([, read]) => read.mockClear());
    const response = await request(app.getHttpServer())[method](`${API}${path}`).query(query);

    return {
      status: response.status,
      storage: reads
        .filter(([, read]) => read.mock.calls.length > 0)
        .map(([name, read]) => [name, read.mock.calls]),
    };
  };

  /** The validation messages of a refusal, as the API's error body carries them. */
  const messagesOf = (body: unknown): unknown =>
    (body as { error?: { details?: { validationErrors?: unknown } } }).error?.details
      ?.validationErrors;

  const filtersOf = (result: { storage: unknown[] }): Record<string, unknown> => {
    const call = (result.storage as [string, unknown[][]][]).find(
      ([name]) => name === 'findWithCursor',
    )?.[1][0];
    return ((call?.[1] as { filters?: Record<string, unknown> } | undefined)?.filters ??
      {}) as Record<string, unknown>;
  };

  it.each(ANSWERED)('answers %s %o', async (path, query) => {
    const response = await request(app.getHttpServer()).get(`${API}${path}`).query(query);

    expect({ status: response.status, body: response.status === 200 ? '' : response.body }).toEqual(
      { status: 200, body: '' },
    );
  });

  it.each(REFUSED)('still refuses %s %o', async (path, query) => {
    const response = await request(app.getHttpServer()).get(`${API}${path}`).query(query);

    expect(response.status).toBe(400);
  });

  it('finds the boolean and whole-number properties it drives', () => {
    expect(BOOLEANS.map(([, property]) => property)).toEqual(
      expect.arrayContaining(['slow', 'resolved', 'hasErrors', 'hasN1']),
    );
    expect(NUMBERS.length).toBeGreaterThanOrEqual(8);
  });

  describe.each(BOOLEANS)('%s.%s', (_dtoName, property, dto) => {
    it.each([
      ['false', false],
      ['true', true],
    ])('reaches the storage as %s', async (raw, expected) => {
      const result = await reached(endpointOf(dto), { ...BASE.get(dto), [property]: raw });

      expect({ status: result.status, value: filtersOf(result)[property] }).toEqual({
        status: 200,
        value: expected,
      });
    });
  });

  it('finds a property of every kind to leave blank', () => {
    expect(EVERY_PROPERTY.length).toBeGreaterThan(60);
  });

  it('finds a route that changes something and what narrows it', () => {
    expect(SCOPE_PROPERTIES.map(([name, property]) => `${name}.${property}`)).toEqual(
      expect.arrayContaining(['ClearEntriesQueryDto.type']),
    );
  });

  describe.each(SCOPE_PROPERTIES)('%s.%s, narrowing a change', (_dtoName, property, dto) => {
    it.each([
      ['empty', ''],
      ['whitespace', '   '],
    ])('is refused %s, and nothing is changed', async (_kind, blank) => {
      const given = await reached(endpointOf(dto), { ...BASE.get(dto), [property]: blank });

      expect(given).toEqual({ status: 400, storage: [] });
    });

    it('says only that it was blank', async () => {
      const [method, path] = endpointOf(dto);
      const response = await request(app.getHttpServer())
        [method](`${API}${path}`)
        .query({ ...BASE.get(dto), [property]: '' });

      expect(messagesOf(response.body)).toEqual([
        `${property} was given blank; leave it out to mean every one`,
      ]);
    });
  });

  it('refuses tags that name only blanks', async () => {
    const result = await reached(['get', '/tags/entries'], { tags: ['', ''] } as never);

    expect(result).toEqual({ status: 400, storage: [] });
  });

  it('reads the tag beside a blank one as the tag alone', async () => {
    const result = await reached(['get', '/tags/entries'], { tags: ['', 'x'] } as never);

    expect(result.status).toBe(200);
    expect(
      (result.storage as [string, unknown[][]][]).find(([name]) => name === 'findByTags')?.[1],
    ).toEqual([[['x'], 'OR', 50]]);
  });

  it('still clears every type when type is left out entirely', async () => {
    const result = await reached(endpointOf(ClearEntriesQueryDto), {});

    expect(result.status).toBe(200);
    expect(result.storage).toEqual([['clear', [[undefined]]]]);
  });

  describe.each(EVERY_PROPERTY)('%s.%s', (_dtoName, property, dto) => {
    const omitted = (): Record<string, string> => {
      const query = { ...BASE.get(dto) };
      delete query[property];
      return query;
    };

    it.each([
      ['empty', ''],
      ['whitespace', '   '],
    ])('reads it %s as not given', async (_kind, blank) => {
      const given = await reached(endpointOf(dto), { ...omitted(), [property]: blank });
      const without = await reached(endpointOf(dto), omitted());

      expect(given).toEqual(without);
      // Not two empty answers agreeing: the request reached the storage, or
      // it was refused because the property is required.
      expect(without.status === 400 || without.storage.length > 0).toBe(true);
      if (isRequired(dto, property)) expect(given.status).toBe(400);
    });
  });
});
