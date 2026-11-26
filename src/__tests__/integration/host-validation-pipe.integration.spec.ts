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
 */
import 'reflect-metadata';
import { INestApplication, Module, ValidationPipe, ValidationPipeOptions } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import request from 'supertest';
import { NestLensModule } from '../../nestlens.module';
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

describe.each([
  ['without implicit conversion', {}],
  ['with implicit conversion', { transformOptions: { enableImplicitConversion: true } }],
])("NestLens' API behind a host ValidationPipe, %s", (_name, options) => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await NestFactory.create(HostModule, new ExpressAdapter(), { logger: false });
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        transformerPackage: anotherClassTransformer(),
        ...options,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

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
});
