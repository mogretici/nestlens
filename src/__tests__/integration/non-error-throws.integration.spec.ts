/**
 * A controller that throws something other than an `Error` must not take the
 * process with it.
 *
 * `throw null` reached the request watcher's RxJS error handler, which read
 * `.status` off it. A `TypeError` inside an error handler has nothing left to
 * catch it: the process exited, and the request never got a response. The
 * application was handling its own failure correctly; NestLens turned it into a
 * crash.
 *
 * The exception filter had the same problem twice over — `'code' in exception`
 * throws on a non-object, and `exception.message` throws on `null`.
 *
 * This drives every shape through a real application and checks three things:
 * the process is still here, the client got its response, and the entry says
 * what was thrown.
 */
import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CollectorService } from '../../core/collector.service';
import { STORAGE, StorageInterface } from '../../core/storage/storage.interface';
import { NestLensModule } from '../../nestlens.module';
import { Entry } from '../../types';

@Controller('throws')
class ThrowingController {
  @Get('string')
  string(): never {
    throw 'a plain string';
  }

  @Get('object')
  object(): never {
    throw { code: 'E_CUSTOM', detail: 'no name field' };
  }

  @Get('number')
  number(): never {
    throw 42;
  }

  @Get('null')
  null(): never {
    throw null;
  }

  @Get('undefined')
  undefined(): never {
    // What a promise rejected with no reason arrives as.
    throw undefined;
  }

  @Get('error')
  error(): never {
    throw new Error('a real error');
  }
}

describe('a controller that throws a non-Error', () => {
  jest.setTimeout(30_000);

  let app: INestApplication;
  let url: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [NestLensModule.forRoot({ watchers: { request: true, exception: true } })],
      controllers: [ThrowingController],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
  });

  const shapes = ['string', 'object', 'number', 'null', 'undefined', 'error'] as const;

  it.each(shapes)('answers the request that threw %s', async (shape) => {
    // Before the fix, `null` never got here: the process was gone.
    const response = await fetch(`${url}/throws/${shape}`);

    expect(response.status).toBe(500);
  });

  it('records an exception for every one of them', async () => {
    for (const shape of shapes) {
      await fetch(`${url}/throws/${shape}`);
    }

    await app.get(CollectorService).flush();

    const entries = await app
      .get<StorageInterface>(STORAGE)
      .find({ type: 'exception', limit: 100 });

    expect(entries.length).toBeGreaterThanOrEqual(shapes.length);
  });

  it('says what was thrown rather than losing it', async () => {
    await fetch(`${url}/throws/string`);
    await app.get(CollectorService).flush();

    const entries = await app
      .get<StorageInterface>(STORAGE)
      .find({ type: 'exception', limit: 100 });

    const messages = entries.map((e: Entry) => String((e.payload as { message?: string }).message));

    // The value itself, not a TypeError raised while looking at it.
    expect(messages.some((m) => m.includes('a plain string'))).toBe(true);
    expect(messages.every((m) => !m.includes("Cannot use 'in' operator"))).toBe(true);
    expect(messages.every((m) => !m.includes('Cannot read properties of null'))).toBe(true);
  });

  it('shows the contents of a bare object', async () => {
    await fetch(`${url}/throws/object`);
    await app.get(CollectorService).flush();

    const entries = await app
      .get<StorageInterface>(STORAGE)
      .find({ type: 'exception', limit: 100 });

    const messages = entries.map((e: Entry) => String((e.payload as { message?: string }).message));

    expect(messages.some((m) => m.includes('E_CUSTOM'))).toBe(true);
    expect(messages.every((m) => m !== '[object Object]')).toBe(true);
  });

  it('still tags them as errors', async () => {
    await fetch(`${url}/throws/null`);
    await app.get(CollectorService).flush();

    const entries = await app
      .get<StorageInterface>(STORAGE)
      .find({ type: 'exception', limit: 100 });

    // Auto-tagging reads `payload.name`, which used to be `undefined` here —
    // so the tagging threw, was swallowed, and the entry reached the dashboard
    // with no ERROR tag and no way to filter for it.
    const tagged = entries.filter((e: Entry) => (e.tags ?? []).includes('ERROR'));
    expect(tagged.length).toBeGreaterThan(0);
  });
});
