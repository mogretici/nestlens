/**
 * NestLens' API behind a host's global ValidationPipe that has its own copy of
 * class-transformer.
 *
 * That copy has never seen NestLens' `@Transform`s, so it hands NestLens'
 * validators the query exactly as the URL spelled it. `@IsInt` on
 * `minDuration` answered `?minDuration=500` with a 400 there, `@IsDate` did the
 * same to every `from`, and the dashboard's filters stopped working in that
 * application while every suite here stayed green. A second copy is loaded
 * through `jest.isolateModules`, which is what the host's `node_modules`
 * amounts to.
 *
 * Implicit conversion — the host's, and the one NestLens' own pipe asks for —
 * converts by `design:type` before any `@Transform` runs. TypeScript records
 * `resolved?: boolean` as `Boolean`, and `Boolean('false')` is `true`, so the
 * dashboard's "unresolved exceptions" link listed the resolved ones. A blank
 * number became `Number('')`, which is `0`: `?limit=` asked for one entry and
 * `?beforeSequence=` for the page below sequence zero. What reaches the
 * storage is asserted here, not only the status.
 */
import 'reflect-metadata';
import { INestApplication, Module, ValidationPipe, ValidationPipeOptions } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import request from 'supertest';
import { getMetadataStorage } from 'class-validator';
import { NestLensModule } from '../../nestlens.module';
import { STORAGE, StorageInterface } from '../../core';
import { TagService } from '../../core/tag.service';
import * as dtos from '../../api/dto';
import {
  CheckNewQueryDto,
  CursorQueryDto,
  EntriesQueryDto,
  LogsQueryDto,
  QueriesQueryDto,
  TagEntriesQueryDto,
} from '../../api/dto';
import { DEFAULT_CONFIG, NESTLENS_API_PREFIX } from '../../nestlens.config';
import { toBaseHref } from '../../api/route-path';

type TransformerPackage = NonNullable<ValidationPipeOptions['transformerPackage']>;

const anotherClassTransformer = (): TransformerPackage => {
  let copy: TransformerPackage | undefined;
  jest.isolateModules(() => {
    copy = jest.requireActual<TransformerPackage>('class-transformer');
  });
  return copy as TransformerPackage;
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
  ['/entries/check-new', { afterSequence: '100' }],
  ['/tags/entries', { tags: 'SUCCESS,USER:1', logic: 'AND', limit: '10' }],
];

const REFUSED: [string, Record<string, string>][] = [
  ['/entries', { minDuration: 'abc' }],
  ['/entries', { offset: '10001' }],
  ['/entries', { from: 'yesterday' }],
  ['/entries/cursor', { maxDuration: 'slow' }],
  ['/tags/entries', { tags: ',,' }],
];

type Dto = new () => object;

/** The endpoint each query DTO is read through, so its properties can be driven over HTTP. */
const ENDPOINTS = new Map<Dto, string>([
  [CursorQueryDto, '/entries/cursor'],
  [EntriesQueryDto, '/entries'],
  [LogsQueryDto, '/logs'],
  [QueriesQueryDto, '/queries'],
  [CheckNewQueryDto, '/entries/check-new'],
  [TagEntriesQueryDto, '/tags/entries'],
]);

/** What a query needs to be answered at all, so a property can be tried on its own. */
const BASE = new Map<Dto, Record<string, string>>([[TagEntriesQueryDto, { tags: 'a' }]]);

type Property = [dtoName: string, property: string, dto: Dto];

const pathOf = (dto: Dto): string => {
  const path = ENDPOINTS.get(dto);
  if (path === undefined) throw new Error(`No endpoint drives ${dto.name}`);
  return path;
};

/** Every query DTO the package exports; one without an endpoint above fails in `pathOf`. */
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

describe.each([
  ['with no pipe of its own', undefined],
  ['without implicit conversion', {}],
  ['with implicit conversion', { transformOptions: { enableImplicitConversion: true } }],
])("NestLens' API behind a host ValidationPipe, %s", (_name, options) => {
  let app: INestApplication;
  let reads: jest.Mock[];

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
    await app.init();

    const storage = app.get<StorageInterface>(STORAGE);
    reads = [
      jest.spyOn(storage, 'findWithCursor'),
      jest.spyOn(storage, 'hasEntriesAfter'),
      jest.spyOn(app.get(TagService), 'findByTags'),
    ] as unknown as jest.Mock[];
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await app?.close();
  });

  /** The status, and every argument the storage was handed for the request. */
  const reached = async (
    path: string,
    query: Record<string, string>,
  ): Promise<{ status: number; storage: unknown[][][] }> => {
    reads.forEach((read) => read.mockClear());
    const response = await request(app.getHttpServer()).get(`${API}${path}`).query(query);

    return { status: response.status, storage: reads.map((read) => read.mock.calls) };
  };

  const filtersOf = (result: { storage: unknown[][][] }): Record<string, unknown> =>
    ((result.storage[0][0]?.[1] as { filters?: Record<string, unknown> } | undefined)?.filters ??
      {}) as Record<string, unknown>;

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
      const result = await reached(pathOf(dto), { ...BASE.get(dto), [property]: raw });

      expect({ status: result.status, value: filtersOf(result)[property] }).toEqual({
        status: 200,
        value: expected,
      });
    });
  });

  describe.each([...BOOLEANS, ...NUMBERS])('%s.%s', (_dtoName, property, dto) => {
    it('reads a blank one as not given', async () => {
      expect(await reached(pathOf(dto), { ...BASE.get(dto), [property]: '' })).toEqual(
        await reached(pathOf(dto), { ...BASE.get(dto) }),
      );
    });
  });
});
