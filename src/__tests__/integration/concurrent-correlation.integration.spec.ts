/**
 * Two requests in flight, and the entries each one produced.
 *
 * Correlation is carried in an `AsyncLocalStorage`, which is what lets a query
 * recorded by TypeORM's logger — handed no request object at all — belong to
 * the request that ran it. The whole value of that is under concurrency: with
 * one request at a time, a single mutable variable would work just as well and
 * nobody would notice the difference.
 *
 * So this runs overlapping requests that each record from inside an `await`,
 * and checks that no entry ended up attributed to the other one.
 */
import { Controller, Get, INestApplication, Injectable, Module, Query } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CollectorService } from '../../core/collector.service';
import { STORAGE, StorageInterface } from '../../core/storage/storage.interface';
import { NestLensModule } from '../../nestlens.module';
import { Entry } from '../../types';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
class Work {
  constructor(private readonly collector: CollectorService) {}

  /**
   * Records after an await, which is where an ambient context is either
   * carried across or lost.
   */
  async run(label: string, delay: number): Promise<void> {
    await sleep(delay);
    await this.collector.collectImmediate('log', {
      level: 'info',
      message: label,
      context: 'Work',
    } as never);
  }
}

@Controller('work')
class WorkController {
  constructor(private readonly work: Work) {}

  /**
   * Descending delays, so the requests finish in the opposite order to
   * starting — which is the only thing this fixture needs them for.
   *
   * Taken from here rather than from the query string. A duration a caller
   * chooses is a denial of service in anything that ships, and CodeQL is right
   * to say so wherever it reads one; the test has no use for the freedom.
   */
  private static readonly DELAYS_MS = [96, 84, 72, 60, 48, 36, 24, 12];
  private served = 0;

  @Get()
  async go(@Query('label') label: string): Promise<{ ok: true }> {
    const delay = WorkController.DELAYS_MS[this.served++ % WorkController.DELAYS_MS.length];

    await this.work.run(label, delay);
    return { ok: true };
  }
}

@Module({
  imports: [NestLensModule.forRoot({ watchers: { request: true, log: false, exception: false } })],
  controllers: [WorkController],
  providers: [Work],
})
class AppModule {}

describe('correlation under concurrency', () => {
  jest.setTimeout(30_000);

  let app: INestApplication;
  let url: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
  });

  /** Fires several overlapping requests and reads back what they recorded. */
  const overlapping = async (count: number): Promise<Entry[]> => {
    await Promise.all(
      // The fixture spaces them out; see `WorkController.DELAYS_MS`.
      Array.from({ length: count }, (_, i) => fetch(`${url}/work?label=job-${i}`)),
    );

    await app.get(CollectorService).flush();

    return app.get<StorageInterface>(STORAGE).find({ limit: 500 });
  };

  it('gives every log a request to belong to', async () => {
    const entries = await overlapping(8);
    const logs = entries.filter((entry) => entry.type === 'log');

    expect(logs.length).toBeGreaterThanOrEqual(8);
    expect(logs.every((entry) => Boolean(entry.requestId))).toBe(true);
  });

  it('gives each log the request that produced it', async () => {
    const entries = await overlapping(8);

    const requests = new Map(
      entries
        .filter((entry) => entry.type === 'request')
        .map((entry) => [
          entry.requestId,
          new URL(`http://x${(entry.payload as { url: string }).url}`).searchParams.get('label'),
        ]),
    );

    const logs = entries.filter((entry) => entry.type === 'log');

    for (const log of logs) {
      const label = (log.payload as { message: string }).message;

      // The request this log was filed under asked for this label — not for
      // the one that happened to be in flight beside it.
      expect([label, requests.get(log.requestId)]).toEqual([label, label]);
    }
  });

  it('does not put two requests under one id', async () => {
    const entries = await overlapping(8);
    const requestIds = entries
      .filter((entry) => entry.type === 'request')
      .map((entry) => entry.requestId);

    expect(new Set(requestIds).size).toBe(requestIds.length);
  });
});
